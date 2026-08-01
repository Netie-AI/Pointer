"use strict";
/**
 * Persisted Netie Clicks settings (3-dot menu).
 * Defaults favour agentic speed; irreversible still needs nod/approve.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { SECRET_KEYS, PROFILE_FIELDS } = require("./vault-fill");

const DEFAULTS = Object.freeze({
  /**
   * WP-P1-VAULT-FILL — the `{{vault.profile.*}}` source. Non-secret contact
   * details only: name, email, address. Passwords and OTPs are deliberately
   * absent and `vaultProfile()` strips them even if a hand-edited settings.json
   * puts them here — those go through OpenVault custody, which types them
   * itself. Roughly the scope of a browser autofill store.
   */
  profile: {},
  /**
   * Auto-run READ + sensible (non-irreversible) consequential without Enter.
   *
   * Default OFF. The agent moving the real mouse the instant a plan comes back
   * is startling, and it removes the beat where you notice the plan is wrong.
   * Turn it on in the settings menu once you trust a workflow.
   */
  autoRunSensible: false,
  /**
   * Send dictated speech on a countdown instead of waiting for Do it.
   *
   * Default OFF. Speech lands in the Ask box and stays there so you can edit it,
   * add to it by typing, and send when you mean to. The countdown still exists
   * (hud-live.createAutoSend) for anyone who wants hands-free.
   */
  autoSend: false,
  /** LIVE subtitle tracks the mouse instead of sitting under the top bar. */
  followCursor: true,
  /** How many transcript lines the LIVE subtitle keeps on screen. */
  liveLines: 5,
  /**
   * Let screenshots and screen-capture see Netie's windows.
   *
   * Off by default: setContentProtection(true) keeps the HUD out of screen
   * shares and out of its own screenshots. Turn on to record a demo or to drive
   * the app from an automation tool — it is a testing affordance, not a mode.
   */
  captureVisible: false,
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

  /**
   * The profile `{{vault.profile.*}}` resolves against — never the raw store.
   * A secret that finds its way in (hand-edit, bad import, a future sync) is
   * dropped here rather than trusted to be caught later: this is the only
   * function that hands profile data to the fill path.
   */
  vaultProfile() {
    const raw = this._data.profile;
    if (!raw || typeof raw !== "object") return {};
    const known = new Set(PROFILE_FIELDS.map((f) => f.key));
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      const bare = key.startsWith("profile.") ? key.slice("profile.".length) : key;
      if (!known.has(bare)) continue;
      if (SECRET_KEYS.some((s) => bare.toLowerCase().includes(s))) continue;
      if (value == null || typeof value === "object") continue;
      out[bare] = String(value);
    }
    return out;
  }
}

module.exports = { SettingsStore, DEFAULTS, defaultPath };
