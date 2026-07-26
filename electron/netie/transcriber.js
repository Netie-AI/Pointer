"use strict";
/**
 * Transcription engine chain (main process).
 *
 * Ordered by privacy, not convenience — the first engine that is actually
 * present wins, and every one of them is on this machine:
 *
 *   1. whisper-cli   — whisper.cpp binary, fully offline CPU (NETIE_WHISPER_BIN + _MODEL)
 *   2. openvault     — local OpenAI-shaped /v1/audio/transcriptions on :5000
 *   3. sidecar       — RealtimeSTT / Hearsay bridge on NETIE_STT_URL
 *   4. none          — say so out loud; never pretend to be listening
 *
 * Deliberately NOT in the chain: Chromium SpeechRecognition. It ships no engine
 * in Electron (dies `error: network`) and routes microphone audio to Google,
 * which contradicts this product's on-device governance.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { encodeWav16, floatToPcm16 } = require("./audio");

const DEFAULT_OPENVAULT = "http://127.0.0.1:5000/v1/audio/transcriptions";

class Transcriber {
  constructor(opts = {}) {
    this.whisperBin = opts.whisperBin || process.env.NETIE_WHISPER_BIN || "";
    this.whisperModel = opts.whisperModel || process.env.NETIE_WHISPER_MODEL || "";
    this.openvaultUrl = opts.openvaultUrl || process.env.NETIE_STT_OPENVAULT_URL || DEFAULT_OPENVAULT;
    this.sidecarUrl = (opts.sidecarUrl || process.env.NETIE_STT_URL || "").replace(/\/$/, "");
    this.model = opts.model || process.env.NETIE_STT_MODEL || "whisper-1";
    this.tempDir = opts.tempDir || path.join(os.tmpdir(), "netie-clicks", "stt");
    this._fetch = opts.fetchImpl || ((...a) => globalThis.fetch(...a));
    this._exec = opts.execFileImpl || execFile;
    this._fs = opts.fsImpl || fs;
    this.engine = null; // resolved on first probe
    this.lastError = null;
  }

  /** True when a local whisper.cpp binary AND model are both on disk. */
  hasLocalWhisper() {
    try {
      return Boolean(
        this.whisperBin &&
          this.whisperModel &&
          this._fs.existsSync(this.whisperBin) &&
          this._fs.existsSync(this.whisperModel)
      );
    } catch {
      return false;
    }
  }

  async _postWav(url, wav, extra = {}) {
    const form = new FormData();
    form.append("file", new Blob([wav], { type: "audio/wav" }), "audio.wav");
    form.append("model", this.model);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await this._fetch(url, {
        method: "POST",
        body: form,
        headers: { "x-openfree-identity": "netie-clicks" },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      return String((data && (data.text ?? data.transcript)) || "").trim();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Probe engines in priority order. Cheap and cached; call `probe(true)` to
   * re-check after the user starts OpenVault or installs a model.
   */
  async probe(force = false) {
    if (this.engine && !force) return this.engine;
    if (this.hasLocalWhisper()) {
      this.engine = "whisper-cli";
      return this.engine;
    }
    for (const [name, url] of [
      ["openvault", this.openvaultUrl],
      ["sidecar", this.sidecarUrl ? `${this.sidecarUrl}/v1/audio/transcriptions` : ""],
    ]) {
      if (!url) continue;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 800);
        // A HEAD/GET that 404s still proves something is listening on the port;
        // only a connection failure means the engine is truly absent.
        const res = await this._fetch(url.replace(/\/v1\/.*$/, "/v1/models"), {
          method: "GET",
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (res) {
          this.engine = name;
          return this.engine;
        }
      } catch {
        /* not up — try next */
      }
    }
    this.engine = "none";
    return this.engine;
  }

  /** Run whisper.cpp on a wav file, return its stdout text. */
  _runWhisperCli(wavPath) {
    return new Promise((resolve, reject) => {
      const args = [
        "-m", this.whisperModel,
        "-f", wavPath,
        "-nt",          // no timestamps
        "-np",          // no progress prints
        "-t", String(Math.max(2, Math.min(8, os.cpus().length - 2))),
      ];
      this._exec(this.whisperBin, args, { timeout: 30000 }, (err, stdout) => {
        if (err) return reject(err);
        resolve(String(stdout || "").trim());
      });
    });
  }

  /**
   * Transcribe one utterance.
   * @param {Float32Array} pcm 16 kHz mono
   * @returns {Promise<{ok:boolean, text:string, engine:string, error?:string}>}
   */
  async transcribe(pcm) {
    if (!pcm || !pcm.length) return { ok: false, text: "", engine: this.engine || "none", error: "empty" };
    const wav = encodeWav16(floatToPcm16(pcm));
    const engine = await this.probe();

    try {
      if (engine === "whisper-cli") {
        this._fs.mkdirSync(this.tempDir, { recursive: true });
        const wavPath = path.join(this.tempDir, `u-${process.pid}-${Date.now()}.wav`);
        this._fs.writeFileSync(wavPath, wav);
        try {
          const text = await this._runWhisperCli(wavPath);
          return { ok: true, text: cleanup(text), engine };
        } finally {
          try {
            this._fs.unlinkSync(wavPath);
          } catch {
            /* best effort */
          }
        }
      }
      if (engine === "openvault") {
        return { ok: true, text: cleanup(await this._postWav(this.openvaultUrl, wav)), engine };
      }
      if (engine === "sidecar") {
        return {
          ok: true,
          text: cleanup(await this._postWav(`${this.sidecarUrl}/v1/audio/transcriptions`, wav)),
          engine,
        };
      }
      return { ok: false, text: "", engine: "none", error: "no local STT engine" };
    } catch (err) {
      this.lastError = String((err && err.message) || err);
      // A dead engine shouldn't wedge us on it forever — re-probe next utterance.
      this.engine = null;
      return { ok: false, text: "", engine, error: this.lastError };
    }
  }

  /** One-line status for the HUD so it never lies about listening. */
  describe() {
    switch (this.engine) {
      case "whisper-cli":
        return { engine: this.engine, label: "Local Whisper (offline)", local: true };
      case "openvault":
        return { engine: this.engine, label: "OpenVault STT (127.0.0.1)", local: true };
      case "sidecar":
        return { engine: this.engine, label: "STT sidecar (127.0.0.1)", local: true };
      case "none":
        return {
          engine: "none",
          label: "No STT engine — typing still works",
          local: true,
          hint: "Set NETIE_WHISPER_BIN + NETIE_WHISPER_MODEL, or start OpenVault. See docs/TRANSCRIPTION.md.",
        };
      default:
        return { engine: "unknown", label: "Checking for a local STT engine…", local: true };
    }
  }
}

/** whisper.cpp emits bracketed non-speech tags and pads blank lines. */
function cleanup(text) {
  return String(text || "")
    .replace(/\[(BLANK_AUDIO|SILENCE|MUSIC|NOISE|INAUDIBLE)\]/gi, "")
    .replace(/\((?:blank audio|silence|music)\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { Transcriber, cleanup };
