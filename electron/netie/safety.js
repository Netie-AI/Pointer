"use strict";
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
  const isInput = type === "type" || type === "fill" || type === "paste" || type === "setvalue";
  if (isInput && _matchesAny(hay, SECRET_TARGET_WORDS)) return ActionTier.PROHIBITED;

  switch (type) {
    case "observe":
    case "screenshot":
    case "read":
    case "wait":
    case "movecursor":
    case "hover":
    case "scroll":
      return ActionTier.READ;

    case "type":
    case "fill":
    case "paste":
    case "setvalue":
      // Free-text into a normal field is consequential (it changes state and
      // can be submitted). Secret fields already returned PROHIBITED above.
      return ActionTier.CONSEQUENTIAL;

    case "click":
    case "doubleclick":
    case "rightclick":
    case "press":
    case "keypress":
    case "navigate":
    case "open":
    case "drag":
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
 * @param {object} [policy]  { autoRunBenign?: bool }  default false (approve everything past READ)
 * @returns {{ tier:number, tierName:string, disposition:'auto'|'approve'|'custody'|'refuse',
 *            irreversible:boolean, secret:boolean }}
 */
function decide(action, policy = {}) {
  const tier = classifyAction(action);
  const irreversible = isIrreversible(action);
  const secret = targetsSecret(action);

  let disposition;
  if (tier === ActionTier.PROHIBITED) {
    // Secret field → hand to OpenVault custody (user approves in the vault UI,
    // the value is injected by the OS, Clicks/LLM never see it). Otherwise refuse.
    disposition = secret ? "custody" : "refuse";
  } else if (tier === ActionTier.READ) {
    disposition = "auto";
  } else if (tier === ActionTier.BENIGN && policy.autoRunBenign) {
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
  const list = Array.isArray(actions) ? actions : [];
  const annotated = list.map((a) => ({ ...a, safety: decide(a, policy) }));
  return {
    actions: annotated,
    needsApproval: annotated.some((a) => a.safety.disposition === "approve"),
    custody: annotated.filter((a) => a.safety.disposition === "custody"),
    refused: annotated.filter((a) => a.safety.disposition === "refuse"),
    autoOnly: annotated.every((a) => a.safety.disposition === "auto"),
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
