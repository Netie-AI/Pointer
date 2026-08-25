"use strict";
/**
 * Idiot-proof intent: one "Go" button — we decide ask vs act.
 * Users should not pick modes. Heuristic only; cheap and local.
 */

const ACT_VERBS = [
  "click", "type", "fill", "press", "open", "close", "drag", "scroll",
  "select", "submit", "send", "save", "delete", "remove", "buy", "pay",
  "navigate", "go to", "switch", "toggle", "check", "uncheck", "enter",
  "paste", "copy", "move", "resize", "minimize", "maximise", "maximize",
  "do it", "make it", "change", "set ", "turn on", "turn off",
];

const ASK_CUES = [
  "what", "why", "how", "who", "when", "where", "which", "explain",
  "describe", "summar", "tell me", "is this", "are these", "can you see",
  "look at", "help me understand", "?",
];

const CODE_CUES = [
  "code", "python", "script", "function", "debug", "traceback", "stack trace",
  "write a", "implement", "refactor", "unit test", "pytest", "fix bug",
  "compile", "syntax", "algorithm", "leetcode",
];

/**
 * Word coworker requests must Act, not Chat.
 *
 * `clicks:go` only runs recipes when this returns "act". CODE_CUES includes
 * "write a", so "write a word document that says Hello" was classified as
 * code and never reached matchRecipe. "write this in Word" matched neither
 * ACT_VERBS nor CODE_CUES and defaulted to ask. Both paths skipped the
 * coworker verbs and the customer got a chat reply (or, on Act, an LLM
 * click/type plan).
 */
function spokenCoworkerForm(text) {
  return String(text || "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s*,?\s*please$/i, "")
    .replace(/[.!?,]+$/g, "")
    .replace(/^(?:(?:please|can you|could you)\s+)+/i, "")
    .trim()
    .toLowerCase();
}

function isHowWhyQuestion(t) {
  return (
    /^(?:how|why|who|when|where|which|what|explain|describe|tell me|help me understand)\b/.test(t) ||
    /\bhow (?:do i|to)\b/.test(t) ||
    /\bcan you explain\b/.test(t)
  );
}

function isWordCoworkerIntent(t) {
  const s = spokenCoworkerForm(t);
  // "how do I write this in Word?" is a question. Force-act would run the
  // clipboard SOP. "can you write hello in Word" is still an imperative.
  if (isHowWhyQuestion(s)) return false;
  if (/^word\s*:/.test(s)) return true;
  if (!/\b(?:microsoft\s+)?word\b/.test(s)) return false;
  return /\b(?:write|put|create|make|copy|paste|append|add|insert)\b/.test(s);
}

/**
 * @param {string} text
 * @returns {'act'|'ask'|'code'}
 */
function classifyIntent(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return "ask";

  if (isWordCoworkerIntent(t)) return "act";

  const hasCode = CODE_CUES.some((v) => t.includes(v));
  const hasAct = ACT_VERBS.some((v) => t.includes(v));
  const hasAsk = ASK_CUES.some((v) => t.includes(v));

  // Coding questions → full answer + optional Python check (not screen clicks).
  if (hasCode && !hasAct) return "code";
  if (hasCode && hasAsk) return "code";

  if (hasAct && !hasAsk) return "act";
  if (hasAct && hasAsk && /^(please\s+)?(click|type|fill|press|open|save|send|delete)\b/.test(t)) {
    return "act";
  }
  if (hasAsk && !hasAct) return "ask";
  if (hasAct) return "act";
  return "ask";
}

module.exports = { classifyIntent, isWordCoworkerIntent, ACT_VERBS, ASK_CUES, CODE_CUES };
