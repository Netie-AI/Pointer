"use strict";
/**
 * WP-P1-SKILLS-EXEC — turn Cortex skill hits into actions.
 *
 * `/api/discovery/find-skills` has been wired since the first Cortex pass, but
 * a hit only ever produced a toast in the insight panel: the planner never saw
 * it, so a catalogued SOP and an invented click were the same thing. This is
 * the missing half — a hit either expands into real actions, or at minimum
 * becomes a preamble the planner is told to prefer.
 *
 * Three sources of actions, most trustworthy first:
 *
 *   1. `hit.actions` — the Cortex 2.5 executable skill schema (C25-02). The
 *      catalog said exactly what to do; do that.
 *   2. a local recipe with the same id — deterministic hotkeys, no LLM, and
 *      already covered by test/recipes.test.js.
 *   3. a built-in expander (form fill) — derived from the profile schema.
 *
 * Nothing here decides whether an action may run. Everything it returns still
 * goes through plan-guard and safety.reviewPlan like any other plan, and any
 * value it emits is a `{{vault.*}}` placeholder — this module never touches the
 * user's real data (see ./vault-fill.js).
 */

const { PROFILE_FIELDS, matchProfileField, vaultToken } = require("./vault-fill");

/** Verbs a skill is allowed to contribute. plan-guard is still the enforcer. */
const SKILL_ACTION_TYPES = new Set([
  "observe", "read", "hover", "scroll", "movecursor",
  "click", "doubleclick", "rightclick", "type", "fill", "press",
  "copy", "select_all", "focus",
]);

function skillId(hit) {
  if (!hit || typeof hit !== "object") return "";
  return String(hit.id || hit.name || hit.skill_id || hit.title || "").trim();
}

function skillLabel(hit) {
  if (!hit || typeof hit !== "object") return "";
  return String(hit.title || hit.label || hit.name || hit.id || "").trim();
}

/** Keep only fields the driver understands, and stamp provenance. */
function normalizeAction(raw, source) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "").trim().toLowerCase();
  if (!type || !SKILL_ACTION_TYPES.has(type)) return null;
  const out = { type, skill: source };
  if (raw.target != null) out.target = String(raw.target);
  if (raw.value != null) out.value = String(raw.value);
  if (Number.isFinite(Number(raw.xPct))) out.xPct = Number(raw.xPct);
  if (Number.isFinite(Number(raw.yPct))) out.yPct = Number(raw.yPct);
  if (Number.isFinite(Number(raw.deltaY))) out.deltaY = Number(raw.deltaY);
  return out;
}

/**
 * Which profile fields did the user actually ask for?
 * "fill my email" → [email]. "fill the form" → everything the profile has.
 */
function requestedFields(instruction, profile) {
  const text = String(instruction || "").toLowerCase();
  const available = PROFILE_FIELDS.filter((f) => {
    if (!profile || typeof profile !== "object") return true;
    return (
      Object.prototype.hasOwnProperty.call(profile, f.key) ||
      Object.prototype.hasOwnProperty.call(profile, `profile.${f.key}`) ||
      (profile.profile && Object.prototype.hasOwnProperty.call(profile.profile, f.key))
    );
  });

  const named = available.filter((f) => f.aliases.some((a) => text.includes(a)));
  if (named.length) return named;
  // No field named — a bare "fill the form" means everything we hold.
  return available;
}

/** Built-in expanders for skills Cortex names but does not yet script. */
const BUILTIN = {
  "form-fill": (hit, ctx) => {
    const fields = requestedFields(ctx.instruction, ctx.profile);
    return fields.map((f) => ({
      type: "fill",
      target: f.label,
      // A placeholder, never the value — the plan stays free of personal data
      // all the way through approval and audit. vault-fill resolves it last.
      value: vaultToken(f.key),
      skill: skillId(hit) || "form-fill",
      profileKey: f.key,
    }));
  },
};

/** Cortex ids drift; map the ones we know onto local behaviour. */
const ALIASES = Object.freeze({
  "form-fill": "form-fill",
  form_fill: "form-fill",
  "fill-form": "form-fill",
  "vault-fill": "form-fill",
  "profile-fill": "form-fill",
});

/**
 * @param {object[]} hits    from ecosystem.findSkills()
 * @param {object}   ctx     { instruction, profile, recipes, screenText }
 * @returns {object[]} actions ready for plan-guard / reviewPlan
 */
function expandSkillsToActions(hits, ctx = {}) {
  const list = Array.isArray(hits) ? hits : hits ? [hits] : [];
  const out = [];

  for (const hit of list) {
    const id = skillId(hit);
    if (!id) continue;

    // 1. The catalog scripted it.
    if (Array.isArray(hit.actions) && hit.actions.length) {
      for (const raw of hit.actions) {
        const action = normalizeAction(raw, id);
        if (action) out.push(action);
      }
      if (out.length) continue;
    }

    // 2. A local recipe owns the id — deterministic, no model in the loop.
    const recipes = ctx.recipes || null;
    const recipe = recipes && (recipes[id] || recipes[id.replace(/-/g, "_")]);
    if (recipe && Array.isArray(recipe.actions) && recipe.actions.length) {
      for (const raw of recipe.actions) {
        const action = normalizeAction({ ...raw }, id);
        if (action) out.push(action);
      }
      continue;
    }

    // 3. A built-in expander.
    const builtin = BUILTIN[ALIASES[id] || id];
    if (builtin) {
      for (const raw of builtin(hit, ctx)) {
        const action = normalizeAction(raw, id);
        // normalizeAction drops unknown keys; profileKey is ours to keep.
        if (action) out.push(raw.profileKey ? { ...action, profileKey: raw.profileKey } : action);
      }
    }
  }

  return out;
}

/**
 * When a skill cannot be expanded we still tell the planner it exists, so the
 * model reaches for the catalogued route instead of inventing clicks.
 */
function skillPreamble(hits) {
  const list = (Array.isArray(hits) ? hits : []).filter(Boolean);
  if (!list.length) return "";
  const names = list.map((h) => skillLabel(h) || skillId(h)).filter(Boolean).slice(0, 5);
  if (!names.length) return "";
  return [
    "Known skills for this goal (prefer these over inventing a click sequence):",
    ...names.map((n) => `- ${n}`),
  ].join("\n");
}

/** One line for the HUD insight panel — what the skill changed, not that it exists. */
function describeExpansion(hits, actions) {
  const n = (actions || []).length;
  const names = (Array.isArray(hits) ? hits : []).map(skillLabel).filter(Boolean);
  if (!n) return names.length ? `Skill hint: ${names[0]} — planner will prefer it` : "";
  return `Skill ${names[0] || "catalog"} → ${n} step(s), no LLM`;
}

module.exports = {
  SKILL_ACTION_TYPES,
  expandSkillsToActions,
  skillPreamble,
  describeExpansion,
  requestedFields,
  matchProfileField,
};
