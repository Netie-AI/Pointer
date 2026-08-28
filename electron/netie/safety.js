"use strict";

const { guardPlan } = require("./plan-guard");
/**
 * Netie Clicks — action safety policy.
 *
 * A screen agent that can click and type is a loaded gun. This module is the
 * safety catch: it classifies every proposed action into a tier and decides
 * what may run automatically, what needs a human OK, and what is never allowed.
 *
 * The tiers mirror the Netie Ecosystem trust model (see docs/SAFETY.md):
 *   READ          observe only — cursor move, screenshot, read text. Auto.
 *   BENIGN        low-consequence, easily reversible. Auto (config can raise).
 *   CONSEQUENTIAL clicks/typing/navigation with side effects. Needs approval.
 *   PROHIBITED    credentials, payment, destructive, security settings. Never
 *                 executed by Clicks — routed to OpenVault custody or refused.
 *
 * Nothing here talks to the network. It is pure, deterministic, and unit-tested
 * so the decision can never depend on a model's mood.
 */

const ActionTier = Object.freeze({
  READ: 0,
  BENIGN: 1,
  CONSEQUENTIAL: 2,
  PROHIBITED: 3,
});

const TIER_NAME = Object.freeze(["read", "benign", "consequential", "prohibited"]);

// Text on/near a control that means "this submits, sends, pays, or deletes".
const IRREVERSIBLE_WORDS = [
  "buy", "purchase", "pay", "checkout", "place order", "confirm order",
  "send", "submit", "post", "publish", "transfer", "withdraw", "delete",
  "remove", "unsubscribe", "deactivate", "close account", "factory reset",
  "wipe", "format", "sign", "accept", "agree", "authorize", "book", "reserve",
];

// Fields/targets that must NEVER be auto-filled by the agent — custody territory.
const SECRET_TARGET_WORDS = [
  "password", "passcode", "pin", "cvv", "cvc", "card number", "credit card",
  "security code", "otp", "one-time", "2fa", "seed phrase", "recovery phrase",
  "private key", "ssn", "social security", "passport", "iban", "routing number",
  "account number", "api key", "secret key", "token",
];

// System / security surfaces the agent may not touch at all.
const SYSTEM_SURFACE_WORDS = [
  "uac", "user account control", "registry", "regedit", "group policy",
  "firewall", "defender", "antivirus", "bios", "disk management",
  "device manager", "credential manager", "certificate",
];

function _hay(action) {
  return [
    action.type, action.target, action.targetText, action.label,
    action.selectorText, action.description, action.value, action.field,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function _matchesAny(hay, words) {
  return words.some((w) => hay.includes(w));
}

/**
 * Classify a single proposed action into an ActionTier.
 * @param {object} action  { type, target?, targetText?, value?, field?, ... }
 * @returns {number} ActionTier
 */
function classifyAction(action) {
  if (!action || typeof action !== "object") return ActionTier.PROHIBITED;
  const type = String(action.type || "").toLowerCase();
  const hay = _hay(action);

  // Never touch system / security surfaces, whatever the verb.
  if (_matchesAny(hay, SYSTEM_SURFACE_WORDS)) return ActionTier.PROHIBITED;

  // Typing (or pasting) into a secret field is custody-only, never the agent's job.
  const isInput =
    type === "type" ||
    type === "fill" ||
    type === "paste" ||
    type === "clipboard_paste" ||
    type === "setvalue" ||
    type === "uia_set" ||
    type === "clipboard_set";
  if (isInput && _matchesAny(hay, SECRET_TARGET_WORDS)) return ActionTier.PROHIBITED;

  switch (type) {
    case "observe":
    case "screenshot":
    case "read":
    case "wait":
    case "uia_wait":
    case "movecursor":
    case "hover":
    case "scroll":
    case "clipboard_get":
    case "copy_clipboard":
    case "clipboard_verify":
    case "clipboard_baseline":
      return ActionTier.READ;

    case "copy":
    case "select_copy":
    case "select_all":
    case "clipboard_set":
      return ActionTier.BENIGN;

    case "word_docx_write":
    case "word_docx_append":
    case "word_from_clipboard":
      // With no destination the write is contained by construction — it can
      // only land in the sanctioned output folder — so it stays BENIGN and the
      // ordinary coworker flow keeps running unattended (KB R-0005).
      //
      // With an explicit destination the path came from the planner, i.e. from
      // outside the trust boundary. word-coworker.js refuses anything outside
      // the sanctioned root, but "where does this file land" is exactly the
      // thing a customer must be shown before approving, so a pathful write is
      // never auto-runnable (#15).
      return action.path || action.target
        ? ActionTier.CONSEQUENTIAL
        : ActionTier.BENIGN;

    case "type":
    case "fill":
    case "paste":
    case "clipboard_paste":
    case "setvalue":
    case "uia_set":
      // Free-text into a normal field is consequential (it changes state and
      // can be submitted). Secret fields already returned PROHIBITED above.
      return ActionTier.CONSEQUENTIAL;

    case "click":
    case "doubleclick":
    case "rightclick":
    case "uia_toggle":
    case "uia_expand":
    case "uia_invoke":
    case "uia_select":
    case "press":
    case "keypress":
    case "navigate":
    case "open":
    case "drag":
    case "focus_hwnd":
      // A click on an irreversible control is the sharpest edge — still gated by
      // approval, but flagged so the UI can shout louder.
      return ActionTier.CONSEQUENTIAL;

    default:
      // Unknown verbs are treated as consequential at best; if they smell
      // irreversible, they stay consequential (approval) — never auto.
      return ActionTier.CONSEQUENTIAL;
  }
}

/** True when the action touches an irreversible control (Buy/Send/Delete/…). */
function isIrreversible(action) {
  return _matchesAny(_hay(action), IRREVERSIBLE_WORDS);
}

/** True when the action targets a secret field (password/card/OTP/…). */
function targetsSecret(action) {
  return _matchesAny(_hay(action), SECRET_TARGET_WORDS);
}

/**
 * Decide the disposition of an action under the current policy.
 * @param {object} action
 * @param {object} [policy]
 *   autoRunBenign?: bool
 *   autoRunSensible?: bool  — auto-run non-irreversible consequential (copy/click/type normal fields)
 * @returns {{ tier:number, tierName:string, disposition:'auto'|'approve'|'custody'|'refuse',
 *            irreversible:boolean, secret:boolean }}
 */
function decide(action, policy = {}) {
  const tier = classifyAction(action);
  const irreversible = isIrreversible(action);
  /**
   * `_custody` is set by vault-fill when a `{{vault.*}}` path resolved to a
   * secret. Trust it over the text heuristic: by the time we get here the value
   * has been blanked, so `_hay()` sees only the verb and the on-screen label —
   * and a label like "Recovery words" or "Code" does not match
   * SECRET_TARGET_WORDS. Without this the step is silently downgraded to
   * "approve", never reaches OpenVault custody, and executes as a zero-length
   * type that the driver reports as success.
   *
   * The heuristic still runs; it can only add secrecy, never remove it.
   */
  const secret = Boolean(action && action._custody) || targetsSecret(action);

  /**
   * A write that names its own destination. `classifyAction` already raises it
   * to CONSEQUENTIAL, but `autoRunSensible` promotes non-irreversible
   * CONSEQUENTIAL straight back to "auto" — so the tier alone does not hold the
   * line. The destination is the single fact a customer must see before
   * approving a write, so this one is checked here and cannot be policy-flipped
   * (#15).
   */
  const verb = String((action && action.type) || "").toLowerCase();
  const declaresDestination =
    (verb === "word_docx_write" ||
      verb === "word_docx_append" ||
      verb === "word_from_clipboard") &&
    Boolean(action && (action.path || action.target));

  let disposition;
  if (secret && action && action._custody) {
    disposition = "custody";
  } else if (tier === ActionTier.PROHIBITED) {
    disposition = secret ? "custody" : "refuse";
  } else if (declaresDestination) {
    disposition = "approve";
  } else if (action && action._requireConfirm) {
    // Set by plan-guard for launches (open/navigate). Start-Process hands the
    // machine to another application and is not undone by a second click, so it
    // never auto-runs regardless of autoRunSensible.
    disposition = "approve";
  } else if (tier === ActionTier.READ) {
    disposition = "auto";
  } else if (tier === ActionTier.BENIGN && (policy.autoRunBenign || policy.autoRunSensible)) {
    disposition = "auto";
  } else if (
    tier === ActionTier.CONSEQUENTIAL &&
    policy.autoRunSensible &&
    !irreversible
  ) {
    // Sensible agentic path: copy Claude→Cursor, click primary, type non-secret — run now.
    // Irreversible (buy/send/delete) still needs nod / explicit approve.
    disposition = "auto";
  } else {
    disposition = "approve";
  }

  return {
    tier,
    tierName: TIER_NAME[tier],
    disposition,
    irreversible,
    secret,
  };
}

/**
 * Annotate a whole plan and summarise what the human must decide.
 * @param {object[]} actions
 * @param {object} [policy]
 */
function reviewPlan(actions, policy = {}) {
  // Guard first: drop verbs the driver cannot run, force a human beat on
  // launches, and strip coordinates that a launch has invalidated. Doing this
  // inside reviewPlan means every caller is covered — it is the one chokepoint
  // every plan passes through.
  const guard = guardPlan(actions);
  const annotated = guard.actions.map((a) => ({ ...a, safety: decide(a, policy) }));
  return {
    actions: annotated,
    needsApproval: annotated.some((a) => a.safety.disposition === "approve"),
    custody: annotated.filter((a) => a.safety.disposition === "custody"),
    refused: annotated.filter((a) => a.safety.disposition === "refuse"),
    autoOnly: annotated.length > 0 && annotated.every((a) => a.safety.disposition === "auto"),
    dropped: guard.dropped,
    reaimed: guard.reaimed,
  };
}

module.exports = {
  ActionTier,
  TIER_NAME,
  classifyAction,
  isIrreversible,
  targetsSecret,
  decide,
  reviewPlan,
};
