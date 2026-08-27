"use strict";
/**
 * OpenWillow-class hold-to-talk. Electron globalShortcut only fires on press,
 * so after listen starts we poll key state and stop on release. Dry-run and
 * Linux never report a physical hold, so those stay tap-to-toggle.
 *
 * Recording / mode / language accelerators are first-party Pointer copy.
 * Do not dump GPLv3 OpenWillow.
 */

const { parseKeyCombo } = require("./driver");

const DEFAULT_RECORDING_HOTKEY = "Control+Alt+Space";
const DEFAULT_MODE_HOTKEY = "Control+Alt+M";
const DEFAULT_LANGUAGE_HOTKEY = "Control+Alt+L";
const DICTATE_HOLD_VKS = Object.freeze([0x11, 0x12, 0x20]); // Ctrl, Alt, Space

const MOD_ORDER = Object.freeze(["Control", "Alt", "Shift", "Super"]);
const RESERVED_HOTKEYS = Object.freeze([
  "escape",
  "control+y",
  "control+shift+space",
  "control+enter",
  "control+`",
]);

function electronKeyName(key) {
  const k = String(key || "").toLowerCase();
  if (k === "esc" || k === "escape") return "Escape";
  if (k === "space") return "Space";
  if (k === "enter") return "Enter";
  if (k === "tab") return "Tab";
  if (k === "backspace") return "Backspace";
  if (/^f([1-9]|1[0-2])$/.test(k)) return k.toUpperCase();
  if (k.length === 1) return k.toUpperCase();
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function modNameForVk(vk) {
  if (vk === 0x11) return "Control";
  if (vk === 0x12) return "Alt";
  if (vk === 0x10) return "Shift";
  if (vk === 0x5b) return "Super";
  return "";
}

/** Canonical Electron accelerator (`Control+Alt+Space`). Empty when unknown. */
function canonicalizeHotkey(value) {
  const combo = parseKeyCombo(value);
  if (!combo || combo.vk == null) return "";
  const seen = new Set();
  const mods = [];
  for (const vk of combo.mods) {
    const name = modNameForVk(vk);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    mods.push(name);
  }
  mods.sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
  return [...mods, electronKeyName(combo.key)].join("+");
}

function hotkeyId(value) {
  return canonicalizeHotkey(value).toLowerCase();
}

function comboVks(value) {
  const combo = parseKeyCombo(value);
  if (!combo) return [];
  return [...combo.mods, combo.vk];
}

function normalizeDictateHotkeys(input = {}) {
  const recording =
    canonicalizeHotkey(input.recordingHotkey) || DEFAULT_RECORDING_HOTKEY;
  const mode = canonicalizeHotkey(input.modeHotkey) || DEFAULT_MODE_HOTKEY;
  const language =
    canonicalizeHotkey(input.languageHotkey) || DEFAULT_LANGUAGE_HOTKEY;
  const ids = [hotkeyId(recording), hotkeyId(mode), hotkeyId(language)];
  if (new Set(ids).size !== 3) {
    return {
      ok: false,
      reason: "Recording, mode, and language shortcuts must be different",
      recordingHotkey: DEFAULT_RECORDING_HOTKEY,
      modeHotkey: DEFAULT_MODE_HOTKEY,
      languageHotkey: DEFAULT_LANGUAGE_HOTKEY,
    };
  }
  if (ids.some((id) => RESERVED_HOTKEYS.includes(id))) {
    return {
      ok: false,
      reason: "That shortcut is reserved",
      recordingHotkey: DEFAULT_RECORDING_HOTKEY,
      modeHotkey: DEFAULT_MODE_HOTKEY,
      languageHotkey: DEFAULT_LANGUAGE_HOTKEY,
    };
  }
  for (const acc of [recording, mode, language]) {
    const combo = parseKeyCombo(acc);
    if (!combo || !combo.mods.length) {
      return {
        ok: false,
        reason: "Each shortcut needs a modifier",
        recordingHotkey: DEFAULT_RECORDING_HOTKEY,
        modeHotkey: DEFAULT_MODE_HOTKEY,
        languageHotkey: DEFAULT_LANGUAGE_HOTKEY,
      };
    }
  }
  return {
    ok: true,
    recordingHotkey: recording,
    modeHotkey: mode,
    languageHotkey: language,
  };
}

function createHoldMonitor(opts = {}) {
  const intervalMs = Number(opts.intervalMs) > 0 ? Number(opts.intervalMs) : 40;
  const poll = opts.poll;
  const onRelease = opts.onRelease;
  const setInt = typeof opts.setInterval === "function" ? opts.setInterval : setInterval;
  const clearInt = typeof opts.clearInterval === "function" ? opts.clearInterval : clearInterval;
  let timer = null;
  let armed = false;
  let seenDown = false;

  function stop() {
    armed = false;
    seenDown = false;
    if (timer != null) {
      clearInt(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    if (typeof poll !== "function") return { ok: false, reason: "no poll" };
    armed = true;
    timer = setInt(() => {
      Promise.resolve(poll())
        .then((sample) => {
          if (!armed) return;
          if (sample && sample.dryRun) return;
          if (sample && sample.down === true) {
            seenDown = true;
            return;
          }
          if (seenDown && sample && sample.down !== true) {
            const fn = onRelease;
            stop();
            if (typeof fn === "function") fn(sample);
          }
        })
        .catch(() => {});
    }, intervalMs);
    return { ok: true };
  }

  return {
    start,
    stop,
    get armed() {
      return armed;
    },
    get seenDown() {
      return seenDown;
    },
  };
}

module.exports = {
  createHoldMonitor,
  DICTATE_HOLD_VKS,
  DEFAULT_RECORDING_HOTKEY,
  DEFAULT_MODE_HOTKEY,
  DEFAULT_LANGUAGE_HOTKEY,
  canonicalizeHotkey,
  comboVks,
  normalizeDictateHotkeys,
};
