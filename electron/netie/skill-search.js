"use strict";
/**
 * Generative lookup: search Cortex + local recipes, then craft a hint.
 * A miss never becomes hit.actions (DR-0003 / DR-0004).
 */

function slugGoal(goal) {
  return String(goal || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "draft";
}

function tokens(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
}

function searchLocal(goal, recipes) {
  const text = String(goal || "").toLowerCase();
  if (!text || !recipes || typeof recipes !== "object") return [];
  const goalTok = new Set(tokens(text));
  const hits = [];
  for (const [id, rec] of Object.entries(recipes)) {
    if (!rec || typeof rec !== "object") continue;
    const phrase = id.replace(/_/g, " ");
    if (text.includes(phrase) && phrase.length > 3) {
      hits.push({ id, title: rec.label || id, source: "local-recipe" });
      continue;
    }
    const recTok = tokens(`${id} ${rec.label || ""}`);
    if (recTok.some((w) => goalTok.has(w))) {
      hits.push({ id, title: rec.label || id, source: "local-recipe" });
    }
  }
  return hits.slice(0, 5);
}

function craftHint(goal) {
  const g = String(goal || "").trim();
  const id = `draft-${slugGoal(g)}`;
  const preamble = [
    "No catalogued skill matched. Treat this as a hint, not a script.",
    `Goal: ${g.slice(0, 200)}`,
    "Do not invent clicks. Prefer asking which tool to use, or a human-curated SkillCard.",
  ].join("\n");
  return {
    ok: true,
    tier: "hint",
    id,
    title: `Draft: ${g.slice(0, 60) || "untitled"}`,
    preamble,
    actions: [],
  };
}

/**
 * @param {string} goal
 * @param {{ findSkills?: Function, recipes?: object }} opts
 */
async function searchThenCraft(goal, opts = {}) {
  const g = String(goal || "").trim();
  if (!g) return { ok: false, hits: [], draft: null, reason: "empty" };
  let cortexHits = [];
  if (typeof opts.findSkills === "function") {
    try {
      const found = await opts.findSkills(g, { limit: opts.limit || 5 });
      if (found && found.ok && Array.isArray(found.hits)) cortexHits = found.hits;
    } catch {
      cortexHits = [];
    }
  }
  const local = searchLocal(g, opts.recipes);
  const seen = new Set();
  const hits = [];
  for (const h of [...cortexHits, ...local]) {
    const id = String((h && (h.id || h.name)) || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    hits.push(h);
  }
  if (hits.length) return { ok: true, hits, draft: null, source: "search" };
  const draft = craftHint(g);
  return { ok: true, hits: [], draft, source: "craft-hint" };
}

module.exports = { searchLocal, craftHint, searchThenCraft, slugGoal };
