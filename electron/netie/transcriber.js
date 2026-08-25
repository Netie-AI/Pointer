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
 *   4. deepgram-cloud  — Deepgram Nova-3, opt-in only (settings.cloudStt), audio
 *                        leaves the device. Ranked below every local engine, and
 *                        only above windows-speech because that floor is the one
 *                        engine explicitly documented as "rough". describe()
 *                        always reports local:false for this tier — see R-0011,
 *                        a degraded/off-device path must say so, not just log it.
 *   5. windows-speech  — System.Speech offline dictation; zero install, rough
 *   6. none            — say so out loud; never pretend to be listening
 *
 * Deliberately NOT in the automatic chain: Chromium SpeechRecognition. It ships
 * no engine in Electron (dies `error: network`) and routes microphone audio to
 * Google with no opt-in, which contradicts this product's on-device governance.
 * deepgram-cloud is different only because it is opt-in, key-scoped via
 * OpenVault, and honestly labeled non-local wherever the engine name surfaces.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { encodeWav16, floatToPcm16 } = require("./audio");
const { WinSpeech } = require("./winspeech");

const DEFAULT_OPENVAULT = "http://127.0.0.1:5000/v1/audio/transcriptions";
const OPENVAULT_KEYS_URL = "http://127.0.0.1:5000/api/keys";
const OPENVAULT_PROBE_TIMEOUT_MS = 800;

class Transcriber {
  constructor(opts = {}) {
    this.whisperBin = opts.whisperBin || process.env.NETIE_WHISPER_BIN || "";
    this.whisperModel = opts.whisperModel || process.env.NETIE_WHISPER_MODEL || "";
    // `??` not `||`: passing an explicit "" must DISABLE this engine. With `||`
    // an empty string fell through to the default, so a caller could not opt out
    // and probe() would still reach for 127.0.0.1:5000.
    this.openvaultUrl =
      opts.openvaultUrl ?? process.env.NETIE_STT_OPENVAULT_URL ?? DEFAULT_OPENVAULT;
    this.sidecarUrl = String(opts.sidecarUrl ?? process.env.NETIE_STT_URL ?? "").replace(/\/$/, "");
    this.model = opts.model || process.env.NETIE_STT_MODEL || "whisper-1";
    this.tempDir = opts.tempDir || path.join(os.tmpdir(), "netie-clicks", "stt");
    this._fetch = opts.fetchImpl || ((...a) => globalThis.fetch(...a));
    this._exec = opts.execFileImpl || execFile;
    this._fs = opts.fsImpl || fs;
    // Windows dictation is the floor: available on any Windows box, so the
    // chain only reports "none" when even this is missing or disabled.
    //
    // Two separate questions, which used to be one expression. `opts` answers
    // the POLICY question (may we use it); the platform answers the CAPABILITY
    // question (is it there). Conflating them meant an explicit
    // `allowWindowsSpeech: true` was silently ignored off Windows even when the
    // caller had injected a working implementation - which is how the CI Linux
    // runner failed two tests that pass on the Windows runner.
    //
    // An injected `winSpeechImpl` IS the capability, so it satisfies the second
    // question on any platform. Production behaviour is unchanged: nobody
    // injects one, so off-Windows still resolves to false.
    this._win = opts.winSpeechImpl || null;
    const winSpeechAllowed = opts.allowWindowsSpeech !== false;
    const winSpeechAvailable = process.platform === "win32" || Boolean(this._win);
    this.allowWindowsSpeech = winSpeechAllowed && winSpeechAvailable;
    // Read live (a function, not a captured boolean) so flipping the Settings
    // checkbox takes effect on the next probe() without recreating this class.
    this.allowDeepgramCloud = opts.allowDeepgramCloud || (() => false);
    this.openvaultKeysUrl = opts.openvaultKeysUrl || OPENVAULT_KEYS_URL;
    this._deepgramKeyCache = null; // only successful lookups are cached — see _deepgramKey
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
    // Consent is the one input that must never be answered from cache (#21).
    // Once probe() resolved to "deepgram-cloud" the value stuck on this.engine
    // and every later call short-circuited below, so turning the setting off
    // kept shipping audio to Deepgram for the rest of the session. Re-check the
    // live value first and drop the cached engine the moment consent is gone.
    if (this.engine === "deepgram-cloud" && !this.allowDeepgramCloud()) {
      this.engine = null;
      // The key was resolved under a consent that no longer holds; make the
      // next opt-in re-fetch it rather than reuse a secret from before.
      this._deepgramKeyCache = null;
    }
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
    if (this.allowDeepgramCloud() && (await this._deepgramKey())) {
      this.engine = "deepgram-cloud";
      return this.engine;
    }
    if (this.allowWindowsSpeech) {
      this.engine = "windows-speech";
      return this.engine;
    }
    this.engine = "none";
    return this.engine;
  }

  /**
   * Resolve the Deepgram key from OpenVault's loopback-only vault.
   *
   * Returns `null` on any failure — OpenVault not running, no deepgram key
   * stored, network hiccup — so probe() just falls through to windows-speech
   * rather than throwing. A successful lookup is cached for the process
   * lifetime; a failed one is never cached, since OpenVault may start later.
   */
  async _deepgramKey() {
    if (this._deepgramKeyCache) return this._deepgramKeyCache;
    try {
      const listCtrl = new AbortController();
      const listTimer = setTimeout(() => listCtrl.abort(), OPENVAULT_PROBE_TIMEOUT_MS);
      let listRes;
      try {
        listRes = await this._fetch(this.openvaultKeysUrl, { signal: listCtrl.signal });
      } finally {
        clearTimeout(listTimer);
      }
      if (!listRes || !listRes.ok) return null;
      const { keys } = await listRes.json();
      const entry = (keys || []).find((k) => k.provider === "deepgram" && k.enabled !== false);
      if (!entry) return null;

      const secretCtrl = new AbortController();
      const secretTimer = setTimeout(() => secretCtrl.abort(), OPENVAULT_PROBE_TIMEOUT_MS);
      let secretRes;
      try {
        secretRes = await this._fetch(`${this.openvaultKeysUrl}/${entry.id}/secret`, {
          headers: { "X-OpenVault-Reveal": "intentional" },
          signal: secretCtrl.signal,
        });
      } finally {
        clearTimeout(secretTimer);
      }
      if (!secretRes || !secretRes.ok) return null;
      const { secret } = await secretRes.json();
      if (!secret) return null;
      this._deepgramKeyCache = secret;
      return secret;
    } catch {
      return null;
    }
  }

  /** Pre-recorded Deepgram REST transcription — one full utterance per call. */
  async _deepgramTranscribe(wav, key) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Number(process.env.NETIE_STT_TIMEOUT_MS) || 20000);
    try {
      const res = await this._fetch(
        "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true",
        {
          method: "POST",
          headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" },
          body: wav,
          signal: ctrl.signal,
        }
      );
      if (!res.ok) throw new Error(`deepgram ${res.status}`);
      const data = await res.json();
      const alt = data?.results?.channels?.[0]?.alternatives?.[0];
      return { text: String((alt && alt.transcript) || ""), language: null };
    } finally {
      clearTimeout(timer);
    }
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
      if (engine === "deepgram-cloud") {
        // Last gate before audio leaves the device. `engine` may have been
        // resolved before the customer revoked consent, and this is the only
        // line between that stale value and a network upload (#21).
        if (!this.allowDeepgramCloud()) {
          this.engine = null;
          this._deepgramKeyCache = null;
          const fallback = await this.probe(true);
          // probe() cannot return cloud without consent, so this recursion
          // terminates; the guard is here so a future probe() change cannot
          // turn that invariant into an infinite loop.
          if (fallback === "deepgram-cloud") {
            return { ok: false, text: "", engine: "none", error: "cloud STT consent revoked" };
          }
          return this.transcribe(pcm);
        }
        const key = await this._deepgramKey();
        if (!key) throw new Error("deepgram key unavailable");
        const r = await this._deepgramTranscribe(wav, key);
        return { ok: true, text: cleanup(r.text), engine, language: r.language, local: false };
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
      case "deepgram-cloud":
        return {
          engine: this.engine,
          label: "Deepgram (cloud — audio leaves this device)",
          local: false,
          hint: "Opted in via Settings > Cloud STT fallback. Turn off to stay fully on-device.",
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
