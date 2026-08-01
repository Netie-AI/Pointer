"use strict";
/**
 * Netie Clicks modes — agent (default), general, transcribe, meeting.
 * Voice: "general mode" / "transcribe mode" / "meeting mode" / "agent mode".
 *
 * `actions` is the line that matters: General listens, summarises and answers
 * but never proposes a plan, so someone who wants a live screen companion is
 * not one stray sentence away from an agent moving their mouse.
 */

const MODES = Object.freeze({
  agent: {
    id: "agent",
    label: "Agent",
    chrome: true, // insights + answer + fab ask
    clickThrough: true, // still forward clicks outside chrome
    autoNotes: false,
    minimizeExtras: false,
    actions: true,
    listens: false,
  },
  general: {
    id: "general",
    label: "General",
    chrome: true, // full LIVE + insights, same as agent
    clickThrough: true,
    autoNotes: false,
    minimizeExtras: false,
    actions: false, // Cluely-class companion: talks, never clicks
    listens: true, // arms the mic on switch — it is a listening mode
  },
  transcribe: {
    id: "transcribe",
    label: "Transcribe",
    chrome: false, // thin bar only
    clickThrough: true,
    autoNotes: true,
    minimizeExtras: true,
    actions: false,
    listens: true,
  },
  meeting: {
    id: "meeting",
    label: "Meeting",
    chrome: "lite", // insights condensed, no act buttons
    clickThrough: true,
    autoNotes: true,
    minimizeExtras: true,
    actions: false,
    listens: true,
  },
});

const TRIGGERS = [
  { re: /\b(transcribe\s*mode|transcription\s*mode|notes?\s*mode|just\s*transcribe|switch\s+to\s+transcribe|change\s+to\s+transcribe)\b/i, mode: "transcribe" },
  { re: /\b(meeting\s*mode|call\s*mode|standup\s*mode|switch\s+to\s+meeting|change\s+to\s+meeting)\b/i, mode: "meeting" },
  // Before agent: "go to general mode" must not fall through to a mode that acts.
  { re: /\b((switch|change|go)\s+to\s+)?general\s*mode\b|\bcompanion\s*mode\b|\bassistant\s*mode\b|\bjust\s*(listen|help)\b|\bstop\s*acting\b|\bdon'?t\s*click\b/i, mode: "general" },
  { re: /\b((switch|change|go)\s+to\s+)?agent\s*mode\b|\bnormal\s*mode\b|\bclick\s*mode\b|\bexit\s*transcribe\b|\bstop\s*transcribing\b/i, mode: "agent" },
];

/** True when the mode is allowed to propose and run screen actions. */
function allowsActions(id) {
  return getMode(id).actions !== false;
}

function detectModeSwitch(text) {
  const t = String(text || "");
  for (const { re, mode } of TRIGGERS) {
    if (re.test(t)) return mode;
  }
  return null;
}

function getMode(id) {
  return MODES[id] || MODES.agent;
}

module.exports = { MODES, TRIGGERS, detectModeSwitch, getMode, allowsActions };
