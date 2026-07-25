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

/**
 * @param {string} text
 * @returns {'act'|'ask'}
 */
function classifyIntent(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return "ask";

  const hasAct = ACT_VERBS.some((v) => t.includes(v));
  const hasAsk = ASK_CUES.some((v) => t.includes(v));

  // Imperative short commands → act ("click Save", "fill name Ada")
  if (hasAct && !hasAsk) return "act";
  if (hasAct && hasAsk && /^(please\s+)?(click|type|fill|press|open|save|send|delete)\b/.test(t)) {
    return "act";
  }
  if (hasAsk && !hasAct) return "ask";
  if (hasAct) return "act";
  // Default: prefer ask (safer). User can still hit an explicit Do path if we add one.
  return "ask";
}

module.exports = { classifyIntent, ACT_VERBS, ASK_CUES };
