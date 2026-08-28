"use strict";
/**
 * Persisted Netie Clicks settings (3-dot menu).
 * Defaults favour agentic speed; irreversible still needs nod/approve.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { SECRET_KEYS, PROFILE_FIELDS } = require("./vault-fill");
const { DEFAULT_SCRIBE_INSTRUCTION } = require("./scribe");

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
   * On by default (DR-0005): agents, UACC, and demos must be able to see
   * Pointer before they can drive it. Turn off to hide the HUD from shares.
   */
  captureVisible: true,
  /** Schema version for one-time stored-value corrections. See migrate(). */
  settingsVersion: 3,
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
  /**
   * Let the Transcriber fall back to Deepgram (cloud) when no local engine
   * (whisper-cli / sidecar / openvault) is present, ranked above rough
   * windows-speech but never above a real local engine.
   *
   * Default OFF — this repo's STT chain is deliberately ordered by privacy,
   * not convenience (see netie/transcriber.js), and cloud means the mic
   * audio leaves the device. Turning this on is an explicit trade of some
   * privacy for accuracy over the offline Windows dictation floor.
   */
  cloudStt: false,
  /**
   * OpenWillow BYOK STT: OpenAI-shaped HTTP base URL (same slot as
   * NETIE_STT_URL). Empty keeps the env default loopback sidecar.
   * Not a Deepgram default (P-04). Remote URLs send mic audio off-device.
   */
  sttUrl: "",
  /**
   * OpenWillow BYOK LLM: OpenAI-shaped HTTP base (same slot as
   * NETIE_OPENVAULT_URL for chat). Empty keeps loopback OpenVault.
   * Not a Groq default (P-04). Keys stay in OpenVault, never here.
   * Remote URLs send prompts and screenshots off-device.
   */
  llmUrl: "",
  /** Optional chat model id. Empty keeps NETIE_CLICK_MODEL / OpenVault default. */
  llmModel: "",
  /**
   * OpenWillow dictation: type mic speech into the focused app in Transcribe
   * mode. Off only if the user hides it. Session still fail-closes without
   * Cortex /dms/secure when the mode is armed.
   */
  dictateIntoFocus: true,
  /**
   * OpenWillow Scribe: rewrite/compose from voice or typed instruction and
   * paste into the remembered app. Same Cortex gate as dictation.
   */
  scribeIntoFocus: true,
  /** Optional Scribe writing-style notes (plain text, not a skill dump). */
  writingStyle: "",
  /**
   * OpenWillow-class standing rewrite. Applies to every Scribe take.
   * The spoken/typed take stays USER INSTRUCTION. Empty stored value
   * falls back to DEFAULT_SCRIBE_INSTRUCTION at rewrite time.
   */
  scribeInstruction: DEFAULT_SCRIBE_INSTRUCTION,
  /** Optional Scribe personal reference (company, links). Data, not commands. */
  personalContext: "",
  /** OpenWillow-class Scribe + STT language. HUD lists 12 labels.
   *  Ctrl+Alt+L still flips English / Traditional Chinese. English
   *  keeps STT on auto; other HUD picks pin an ISO code. */
  scribeLanguage: "English",
  /**
   * OpenWillow screen context: attach a screenshot to Scribe. Off by default
   * because the screen is untrusted data and leaves the device with the LLM.
   */
  scribeScreenContext: false,
  /**
   * Cluely-class: refresh a spoken-reply line as meeting notes grow.
   * Still fail-closed without Cortex. Off to keep the HUD quiet.
   */
  meetingAutoSuggest: true,
  /** Launch Pointer at Windows sign-in (OpenWillow autostart pattern). */
  autostart: false,
  /**
   * OpenWillow-class global shortcuts. Electron accelerators.
   * Recording is hold-to-talk. The three must stay distinct.
   */
  recordingHotkey: "Control+Alt+Space",
  modeHotkey: "Control+Alt+M",
  languageHotkey: "Control+Alt+L",
});

function defaultPath() {
  return path.join(os.homedir(), "AppData", "Roaming", "NetieClicks", "settings.json");
}

/**
 * Bump when a stored value must change for existing installs.
 *
 * Stored settings win over DEFAULTS -- that is the whole point of storing them --
 * so flipping a default does nothing for anyone who has run the app before. The
 * only way to change behaviour for an existing install is to rewrite the stored
 * value once, which is what this does.
 */
const SETTINGS_VERSION = 3;

/**
 * One-time corrections to stored settings.
 *
 * Each step runs once, keyed on the version, so a user who deliberately turns a
 * setting back on afterwards keeps their choice. A migration that re-applied on
 * every boot would be a preference the user is not allowed to have.
 */
function migrate(data, storedVersion) {
  const out = { ...data };
  // The version must come from the FILE, not from the merged object: DEFAULTS
  // carries the current version, so merging first makes every install look
  // already-migrated and no step ever runs.
  const from = Number(storedVersion) || 1;

  if (from < 2) {
    // v2: the agent no longer moves the mouse the instant a plan comes back.
    // Auto-run shipped on by default, which meant the first surprise was an
    // agent clicking something while you were still reading the plan. It stays
    // available in the settings menu; it is just no longer the default, and
    // that has to reach installs that already stored `true`.
    out.autoRunSensible = false;
  }

  if (from < 3) {
    // v3: Pointer must be screenshotable so UACC and other agents can detect
    // it (DR-0005). Older installs stored the previous default of false.
    out.captureVisible = true;
  }

  out.settingsVersion = SETTINGS_VERSION;
  return out;
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
        const before = Number(raw.settingsVersion) || 1;
        this._data = migrate({ ...DEFAULTS, ...raw }, before);
        // Persist immediately. Without this the version never advances, the
        // migration re-runs on every boot, and a user who turns auto-run back
        // on finds it off again next launch -- a preference they are not
        // allowed to have.
        if (before < SETTINGS_VERSION) this._write();
      }
    } catch {
      this._data = { ...DEFAULTS };
    }
    return this.snapshot();
  }

  _write() {
    try {
      fs.mkdirSync(path.dirname(this.path), { recursive: true });
      fs.writeFileSync(this.path, JSON.stringify(this._data, null, 2), "utf8");
    } catch {
      // A read-only profile must not stop the app booting; the in-memory value
      // is still correct for this session.
    }
  }

  snapshot() {
    return { ...this._data };
  }

  set(partial = {}) {
    this._data = { ...this._data, ...partial };
    this._write();
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
