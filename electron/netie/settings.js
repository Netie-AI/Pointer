"use strict";
/**
 * Persisted Netie Clicks settings (3-dot menu).
 * Defaults favour agentic speed; irreversible still needs nod/approve.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const DEFAULTS = Object.freeze({
  /** Auto-run READ + sensible (non-irreversible) consequential without Enter. */
  autoRunSensible: true,
  /** Wait for nod / "yes" / Y before irreversible or when autoRun is off. */
  nodConfirm: true,
  /** Future: webcam nod detection (off until calibrated). */
  nodCamera: false,
  /** Sticky chat bubble follows the cursor. */
  cursorBubble: true,
  /** Larger context panel / canvas on demand. */
  largeContext: true,
  /** Save every Ask/Act/code run into session markdown (AirGPT-visible). */
  saveAllMarkdown: true,
  /** Run fenced Python from coding answers in a temp sandbox. */
  runPythonChecks: true,
  /** Hot memory ticks (disable via NETIE_LIGHT=1 to save CPU). */
  hotTicks: true,
  /** Spawn STT sidecar on boot. */
  sttSidecar: true,
  /** Fleet dual-brain telemetry. */
  fleetTelemetry: true,
  /** Crazy smile / matrix agent presence FX. */
  agentPresenceFx: true,
  /** Background 60s Clicky recall ring. */
  recall: true,
  /** Hold-to-arm Clicky cursor mode. */
  clicky: true,
  /** System audio capture toggle default. */
  systemAudio: true,
  /**
   * Demo-only: keep per-step screenshots under AppData/NetieClicks/demo-debug.
   * Off by default. Not the long-term stealth capture path.
   */
  demoDebug: false,
  /**
   * Post-step PNG hash verify. Off by default — byte-exact SHA lies on caret/clock
   * and costs two full-screen captures per step. Turn on only when debugging verify.
   */
  verifySteps: false,
});

function defaultPath() {
  return path.join(os.homedir(), "AppData", "Roaming", "NetieClicks", "settings.json");
}

class SettingsStore {
  constructor(opts = {}) {
    this.path = opts.path || defaultPath();
    this._data = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.path)) {
        const raw = JSON.parse(fs.readFileSync(this.path, "utf8"));
        this._data = { ...DEFAULTS, ...raw };
      }
    } catch {
      this._data = { ...DEFAULTS };
    }
    return this.snapshot();
  }

  snapshot() {
    return { ...this._data };
  }

  set(partial = {}) {
    this._data = { ...this._data, ...partial };
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    fs.writeFileSync(this.path, JSON.stringify(this._data, null, 2), "utf8");
    return this.snapshot();
  }

  get(key) {
    return this._data[key];
  }

  /** Policy object passed into safety.reviewPlan / decide. */
  safetyPolicy() {
    return {
      autoRunBenign: Boolean(this._data.autoRunSensible),
      autoRunSensible: Boolean(this._data.autoRunSensible),
    };
  }
}

module.exports = { SettingsStore, DEFAULTS, defaultPath };
