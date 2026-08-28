"use strict";
/**
 * OpenWillow-class dictation: type the user's own mic speech into the
 * focused app, only in Transcribe/dictation mode.
 *
 * This is not the agent Act path. It is a user-armed delivery of their
 * own words (like Windows dictation). Session still fail-closes if Cortex
 * /dms/secure is down when the mode is armed.
 */

function shouldDictateIntoFocus(opts = {}) {
  if (opts.enabled === false) return false;
  if (String(opts.source || "") !== "mic") return false;
  if (String(opts.mode || "") !== "transcribe") return false;
  const text = String(opts.text || "").trim();
  if (!text) return false;
  if (opts.gated !== true) return false;
  return true;
}

function dictateSecureGoal() {
  return "dictate user speech into the focused window";
}

module.exports = { shouldDictateIntoFocus, dictateSecureGoal };
