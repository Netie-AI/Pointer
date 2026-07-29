"use strict";
/**
 * Netie Clicks modes — agent (default), transcribe, meeting.
 * Voice: "transcribe mode" / "meeting mode" / "agent mode".
 */

const MODES = Object.freeze({
  agent: {
    id: "agent",
    label: "Agent",
    chrome: true, // insights + answer + fab ask
    clickThrough: true, // still forward clicks outside chrome
    autoNotes: false,
    minimizeExtras: false,
  },
  transcribe: {
    id: "transcribe",
    label: "Transcribe",
    chrome: false, // thin bar only
    clickThrough: true,
    autoNotes: true,
    minimizeExtras: true,
  },
  meeting: {
    id: "meeting",
    label: "Meeting",
    chrome: "lite", // insights condensed, no act buttons
    clickThrough: true,
    autoNotes: true,
    minimizeExtras: true,
  },
});

const TRIGGERS = [
  { re: /\b(transcribe\s*mode|transcription\s*mode|notes?\s*mode|just\s*transcribe|switch\s+to\s+transcribe|change\s+to\s+transcribe)\b/i, mode: "transcribe" },
  { re: /\b(meeting\s*mode|call\s*mode|standup\s*mode|switch\s+to\s+meeting|change\s+to\s+meeting)\b/i, mode: "meeting" },
  { re: /\b((switch|change|go)\s+to\s+)?agent\s*mode\b|\bnormal\s*mode\b|\bclick\s*mode\b|\bexit\s*transcribe\b|\bstop\s*transcribing\b/i, mode: "agent" },
];

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

module.exports = { MODES, TRIGGERS, detectModeSwitch, getMode };
