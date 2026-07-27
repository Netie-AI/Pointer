"use strict";
/**
 * Transcription engine chain (main process).
 *
 * Ordered by privacy, not convenience — the first engine that is actually
 * present wins, and every one of them is on this machine:
 *
 *   1. whisper-cli     — whisper.cpp binary, fully offline CPU (NETIE_WHISPER_BIN + _MODEL)
 *   2. openvault       — local OpenAI-shaped /v1/audio/transcriptions on :5000
 *   3. sidecar         — RealtimeSTT / Hearsay bridge on NETIE_STT_URL
 *   4. windows-speech  — System.Speech offline dictation; zero install, rough
 *   5. none            — say so out loud; never pretend to be listening
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
const { WinSpeech } = require("./winspeech");

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
    // Windows dictation is the floor: available on any Windows box, so the
    // chain only reports "none" when even this is missing or disabled.
    this.allowWindowsSpeech = opts.allowWindowsSpeech !== false && process.platform === "win32";
    this._win = opts.winSpeechImpl || null;
    this.engine = null; // resolved on first probe
    this.lastError = null;
    this.lastConfidence = null;
  }

  _winSpeech() {
    if (!this._win) this._win = new WinSpeech();
    return this._win;
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
    // Multilingual / Malaysian rojak — never force a single language.
    if (!("language" in extra)) form.append("language", "auto");
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    const ctrl = new AbortController();
    // Whisper on CPU can take ~10s for a few seconds of speech; a 20s ceiling
    // sat close enough to that to abort real work and demote a healthy engine.
    const timer = setTimeout(() => ctrl.abort(), Number(process.env.NETIE_STT_TIMEOUT_MS) || 60000);
    try {
      const res = await this._fetch(url, {
        method: "POST",
        body: form,
        headers: { "x-openfree-identity": "netie-clicks" },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const text = String((data && (data.text ?? data.transcript)) || "").trim();
      return {
        text,
        language: (data && data.language) || null,
        language_probability: (data && data.language_probability) || null,
      };
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
    // Prefer Netie STT sidecar (faster-whisper multilingual) before OpenVault —
    // best path for zh/en/ms code-switch ("rojak").
    for (const [name, url] of [
      ["sidecar", this.sidecarUrl ? `${this.sidecarUrl}/health` : ""],
      ["openvault", this.openvaultUrl],
    ]) {
      if (!url) continue;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 800);
        const probeUrl =
          name === "sidecar" ? url : url.replace(/\/v1\/.*$/, "/v1/models");
        const res = await this._fetch(probeUrl, {
          method: "GET",
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (res && (res.ok || res.status === 404)) {
          this.engine = name;
          return this.engine;
        }
      } catch {
        /* not up — try next */
      }
    }
    if (this.allowWindowsSpeech) {
      this.engine = "windows-speech";
      return this.engine;
    }
    this.engine = "none";
    return this.engine;
  }

  /** Write a wav to the temp dir and hand back its path plus a cleanup fn. */
  _tempWav(wav) {
    this._fs.mkdirSync(this.tempDir, { recursive: true });
    const p = path.join(this.tempDir, `u-${process.pid}-${Date.now()}.wav`);
    this._fs.writeFileSync(p, wav);
    return {
      path: p,
      cleanup: () => {
        try {
          this._fs.unlinkSync(p);
        } catch {
          /* best effort */
        }
      },
    };
  }

  /** Run whisper.cpp on a wav file, return its stdout text. */
  _runWhisperCli(wavPath) {
    return new Promise((resolve, reject) => {
      const args = [
        "-m", this.whisperModel,
        "-f", wavPath,
        "-l", "auto",   // zh/en/ms mix — never pin *.en model
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
        const tmp = this._tempWav(wav);
        try {
          return { ok: true, text: cleanup(await this._runWhisperCli(tmp.path)), engine };
        } finally {
          tmp.cleanup();
        }
      }
      if (engine === "windows-speech") {
        const tmp = this._tempWav(wav);
        try {
          const r = await this._winSpeech().recognizeFile(tmp.path);
          this.lastConfidence = r.confidence;
          return {
            ok: true,
            text: cleanup(r.text),
            engine,
            confidence: r.confidence,
            // Windows dictation misreads often enough that the HUD should show
            // this as provisional rather than as a settled transcript.
            rough: r.confidence < 0.75,
          };
        } finally {
          tmp.cleanup();
        }
      }
      if (engine === "openvault") {
        const r = await this._postWav(this.openvaultUrl, wav);
        return { ok: true, text: cleanup(r.text), engine, language: r.language };
      }
      if (engine === "sidecar") {
        const r = await this._postWav(`${this.sidecarUrl}/v1/audio/transcriptions`, wav);
        return {
          ok: true,
          text: cleanup(r.text),
          engine,
          language: r.language,
          confidence: r.language_probability,
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
        return {
          engine: this.engine,
          label: "Faster-Whisper sidecar (zh/en/ms rojak)",
          local: true,
        };
      case "windows-speech":
        return {
          engine: this.engine,
          label: "Windows dictation (offline, rough)",
          local: true,
          hint: "Set NETIE_WHISPER_BIN + NETIE_WHISPER_MODEL for far better accuracy.",
        };
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

  /** Release the Windows dictation worker (called on app quit). */
  dispose() {
    if (this._win && typeof this._win.dispose === "function") this._win.dispose();
    this._win = null;
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
