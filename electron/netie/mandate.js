"use strict";
/**
 * P-UNATTENDED-MANDATE — how work runs while nobody is watching.
 *
 * The executor's gate is `if (disposition === "approve" && !action._approved) skip()`.
 * That is correct and it is why unattended work does not exist today: with no
 * human at the HUD, every consequential step stalls forever. The tempting fix
 * — let the planner mark its own steps runnable — is exactly KB A-0005, the
 * critical self-approving-plan attack, and it stays fixed here.
 *
 * A mandate is the other way round. It is a standing, narrow, expiring grant
 * that a HUMAN creates before the job starts:
 *
 *     "for the next 20 minutes, in Outlook only, you may click and type,
 *      at most 40 steps, and nothing irreversible"
 *
 * Three properties make it safe, and all three are structural rather than
 * conventional:
 *
 *   1. A mandate is never read off an action. The runner holds a bound handle
 *      it got from the job the human created. An action arriving with
 *      `_mandateId: "m-1"` on it — the A-0005 shape, injectable through any
 *      pixel on screen — grants nothing, and is recorded as tampering.
 *
 *   2. A mandate can only narrow, never widen. Every candidate is still
 *      classified by safety.js first; PROHIBITED stays prohibited, custody
 *      stays custody. Payment and account-destruction are refused at this
 *      layer too, unconditionally, because "the founder ticked a box six
 *      hours ago" is not consent to a purchase.
 *
 *   3. A mandate is spent. Steps, wall-clock and revocation all end it, and
 *      the budget is decremented by the same call that authorises, so a
 *      caller cannot check once and act fifty times.
 *
 * In memory only, deliberately. A mandate does not survive a restart: a grant
 * the user cannot remember giving is not a grant.
 */

const crypto = require("crypto");
const { classifyAction, isIrreversible, ActionTier } = require("./safety");
const { DRIVER_ACTIONS } = require("./plan-guard");

/**
 * Verbs a mandate may ever cover. Anything else needs a person, every time.
 *
 * Two verbs are deliberately absent that a reader will look for:
 *
 *   navigate / open   hand control to another application. A mandate is scoped
 *                     to apps the user already had open; letting it launch a
 *                     new one is how "tidy my inbox" ends up somewhere else.
 *   rightclick / drag context menus and drags are the verbs whose outcome is
 *                     least predictable from the plan alone, and unattended is
 *                     exactly when nobody sees the menu that opened.
 *
 * Names must match the driver's, or a grant silently covers nothing (the same
 * trap plan-guard.test.js pins for DRIVER_ACTIONS), so the list is filtered
 * through what the driver actually implements rather than trusted.
 */
const UNATTENDABLE = Object.freeze([
  "observe", "read", "wait", "movecursor", "hover",
  "click", "doubleclick", "type", "fill", "setvalue", "press", "keypress", "scroll",
  "copy", "copy_clipboard", "select_copy", "select_all",
  "clipboard_get", "clipboard_set", "clipboard_verify", "clipboard_baseline",
  "word_docx_write", "word_docx_append",
]);

const GRANTABLE = Object.freeze(UNATTENDABLE.filter((v) => DRIVER_ACTIONS.includes(v)));

/**
 * Never coverable, whatever the grant says and whatever tier the classifier
 * returns. These are the actions where being wrong costs money or an account,
 * and where a delayed, unattended mistake is discovered far too late.
 */
const NEVER_COVERED = Object.freeze([
  "buy", "purchase", "pay", "payment", "checkout", "place order", "confirm order",
  "transfer", "withdraw", "send money", "wire",
  "delete account", "close account", "deactivate", "factory reset", "wipe", "format",
  "uninstall", "sign contract", "accept terms", "agree to terms",
]);

const DEFAULTS = Object.freeze({
  ttlMs: 15 * 60 * 1000,
  maxSteps: 25,
});

const MAX_TTL_MS = 4 * 60 * 60 * 1000;   // a grant longer than an afternoon is a standing licence
const MAX_STEPS_CEILING = 500;

function haystack(action) {
  return [action.type, action.target, action.targetText, action.label, action.description, action.value, action.field]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normList(v) {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
}

/** Reasons `covers()` can refuse. Stable strings — the HUD and the tests read them. */
const DENY = Object.freeze({
  NO_MANDATE: "no-mandate",
  EXPIRED: "mandate-expired",
  REVOKED: "mandate-revoked",
  EXHAUSTED: "mandate-exhausted",
  VERB: "verb-not-granted",
  APP: "app-not-granted",
  TIER: "tier-above-mandate",
  IRREVERSIBLE: "irreversible-not-granted",
  NEVER: "never-coverable",
  TAMPERED: "action-claimed-its-own-authority",
});

function createMandateStore(opts = {}) {
  const now = typeof opts.now === "function" ? opts.now : () => Date.now();
  const onEvent = typeof opts.onEvent === "function" ? opts.onEvent : () => {};
  const mandates = new Map();
  let seq = 0;

  function snapshot(m) {
    return {
      id: m.id,
      reason: m.reason,
      apps: [...m.apps],
      verbs: [...m.verbs],
      allowIrreversible: [...m.allowIrreversible],
      createdAt: m.createdAt,
      expiresAt: m.expiresAt,
      maxSteps: m.maxSteps,
      usedSteps: m.usedSteps,
      revokedAt: m.revokedAt,
      grantedBy: m.grantedBy,
    };
  }

  function liveness(m) {
    // `!= null`, not truthiness: an injected clock can legitimately return 0,
    // and `if (m.revokedAt)` would then read a revoked mandate as live.
    if (m.revokedAt != null) return DENY.REVOKED;
    if (now() >= m.expiresAt) return DENY.EXPIRED;
    if (m.usedSteps >= m.maxSteps) return DENY.EXHAUSTED;
    return null;
  }

  const store = {
    DENY,
    GRANTABLE,
    NEVER_COVERED,

    /**
     * Create a grant. `grantedBy` names the human path that produced it — the
     * value is recorded, and a grant with no named human is refused, so a
     * module cannot quietly mint itself authority.
     *
     * @param {object} spec
     * @param {string} spec.reason      what the user asked for, in their words
     * @param {string} spec.grantedBy   "hud-approval" | "settings" | ...
     * @param {string[]} spec.apps      app allowlist; empty means "nowhere"
     * @param {string[]} spec.verbs     action types; intersected with GRANTABLE
     * @param {string[]} [spec.allowIrreversible] exact target labels, opt-in
     */
    grant(spec = {}) {
      const grantedBy = String(spec.grantedBy || "").trim();
      if (!grantedBy) return { ok: false, error: "a mandate needs a named human grant path" };

      const apps = normList(spec.apps);
      if (!apps.length) return { ok: false, error: "a mandate must name at least one app" };

      const verbs = normList(spec.verbs).filter((v) => GRANTABLE.includes(v));
      if (!verbs.length) return { ok: false, error: "a mandate must grant at least one supported verb" };

      const ttl = Math.min(Math.max(1000, Number(spec.ttlMs) || DEFAULTS.ttlMs), MAX_TTL_MS);
      const maxSteps = Math.min(Math.max(1, Number(spec.maxSteps) || DEFAULTS.maxSteps), MAX_STEPS_CEILING);

      seq += 1;
      const t = now();
      const m = {
        id: `m-${seq}-${crypto.randomBytes(3).toString("hex")}`,
        reason: String(spec.reason || "").slice(0, 200),
        grantedBy,
        apps,
        verbs,
        // Irreversible steps are opt-in per exact label, never per category.
        allowIrreversible: normList(spec.allowIrreversible),
        createdAt: t,
        expiresAt: t + ttl,
        maxSteps,
        usedSteps: 0,
        revokedAt: null,
      };
      mandates.set(m.id, m);
      onEvent("mandate.granted", snapshot(m));
      return { ok: true, id: m.id, mandate: snapshot(m) };
    },

    revoke(id) {
      const m = mandates.get(String(id));
      if (!m) return { ok: false, error: "no such mandate" };
      if (m.revokedAt != null) return { ok: false, error: "already revoked" };
      m.revokedAt = now();
      onEvent("mandate.revoked", snapshot(m));
      return { ok: true, id: m.id };
    },

    revokeAll() {
      let n = 0;
      for (const m of mandates.values()) {
        if (m.revokedAt == null && now() < m.expiresAt) {
          m.revokedAt = now();
          onEvent("mandate.revoked", snapshot(m));
          n += 1;
        }
      }
      return n;
    },

    get(id) {
      const m = mandates.get(String(id));
      return m ? snapshot(m) : null;
    },

    list() {
      return Array.from(mandates.values()).map(snapshot);
    },

    /** Live grants only — what the HUD should show as "Pointer may act". */
    active() {
      return this.list().filter((m) => m.revokedAt == null && now() < m.expiresAt && m.usedSteps < m.maxSteps);
    },

    /**
     * Decide whether `action` may run under mandate `id`, and if so SPEND a
     * step. Checking and spending are the same call on purpose — a separate
     * `consume()` is an invitation to check once and act in a loop.
     *
     * @returns {{allowed:boolean, reason:string|null, mandateId:string|null, remaining:number}}
     */
    authorize(id, action, ctx = {}) {
      const deny = (reason, m) => {
        onEvent("mandate.denied", { mandateId: m ? m.id : null, reason, type: action && action.type });
        return { allowed: false, reason, mandateId: m ? m.id : null, remaining: m ? m.maxSteps - m.usedSteps : 0 };
      };

      if (!action || typeof action !== "object") return deny(DENY.NO_MANDATE, null);

      // A-0005 defence. Authority travels with the runner, never on the data.
      // An action carrying its own grant is not merely ignored — it is reported,
      // because the only way one gets here is that something wrote it.
      if (action._mandateId || action._mandate || action._approved) {
        return deny(DENY.TAMPERED, mandates.get(String(id)) || null);
      }

      const m = mandates.get(String(id));
      if (!m) return deny(DENY.NO_MANDATE, null);
      const dead = liveness(m);
      if (dead) return deny(dead, m);

      const hay = haystack(action);
      if (NEVER_COVERED.some((w) => hay.includes(w))) return deny(DENY.NEVER, m);

      const type = String(action.type || "").toLowerCase();
      if (!GRANTABLE.includes(type) || !m.verbs.includes(type)) return deny(DENY.VERB, m);

      // safety.js is the ceiling. A mandate chooses from what policy already
      // permits; it cannot promote a PROHIBITED step into a runnable one.
      const tier = classifyAction(action);
      if (tier >= ActionTier.PROHIBITED) return deny(DENY.TIER, m);

      const app = String(ctx.app || action.app || "").toLowerCase();
      if (!app || !m.apps.some((a) => app.includes(a) || a.includes(app))) return deny(DENY.APP, m);

      if (isIrreversible(action)) {
        const label = String(action.target || action.targetText || "").toLowerCase();
        if (!label || !m.allowIrreversible.includes(label)) return deny(DENY.IRREVERSIBLE, m);
      }

      m.usedSteps += 1;
      const remaining = m.maxSteps - m.usedSteps;
      onEvent("mandate.authorized", { mandateId: m.id, type, target: action.target || null, remaining });
      return { allowed: true, reason: null, mandateId: m.id, remaining };
    },

    /**
     * Bind a mandate to a runner. The handle is the only thing the executor
     * holds; it cannot name a different mandate later.
     */
    bind(id) {
      if (!mandates.has(String(id))) return null;
      const bound = String(id);
      return {
        id: bound,
        authorize: (action, ctx) => store.authorize(bound, action, ctx),
        snapshot: () => store.get(bound),
        revoke: () => store.revoke(bound),
      };
    },
  };

  return store;
}

/** One line for the HUD. An unattended grant the user cannot see is not consent. */
function describeMandate(m, nowMs = Date.now()) {
  if (!m) return "";
  if (m.revokedAt != null) return `Mandate ${m.id} revoked`;
  const leftMs = Math.max(0, m.expiresAt - nowMs);
  const mins = Math.ceil(leftMs / 60000);
  const steps = Math.max(0, m.maxSteps - m.usedSteps);
  const where = m.apps.join(", ");
  const irr = m.allowIrreversible.length ? `, may confirm: ${m.allowIrreversible.join(", ")}` : "";
  return `Acting in ${where} for ${mins}m · ${steps} steps left${irr}`;
}

module.exports = {
  createMandateStore,
  describeMandate,
  GRANTABLE,
  NEVER_COVERED,
  DENY,
  DEFAULTS,
  MAX_TTL_MS,
  MAX_STEPS_CEILING,
};
