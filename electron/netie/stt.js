"use strict";
/**
 * STT bridge — mic via renderer SpeechRecognition; optional localhost sidecar
 * for RealtimeSTT / Hearsay-style system audio (see docs/TRANSCRIPTION.md).
 */

class SttBridge {
  /**
   * @param {object} [opts]
   * @param {string} [opts.sidecarUrl]
   * @param {typeof fetch} [opts.fetchImpl]
   */
  constructor(opts = {}) {
    this.sidecarUrl = (opts.sidecarUrl || process.env.NETIE_STT_URL || "http://127.0.0.1:8766").replace(/\/$/, "");
    this._fetch = opts.fetchImpl || ((...a) => globalThis.fetch(...a));
    this.sidecarOnline = null;
  }

  async ping() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 800);
      const res = await this._fetch(`${this.sidecarUrl}/health`, {
        method: "GET",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      this.sidecarOnline = res.ok;
      return this.sidecarOnline;
    } catch {
      this.sidecarOnline = false;
      return false;
    }
  }

  /**
   * @param {'mic'|'system'|'both'} source
   */
  async start(source = "mic") {
    const online = await this.ping();
    if (!online) {
      return {
        ok: false,
        mode: "browser-speech",
        message: "No STT sidecar — using on-device SpeechRecognition for mic. System audio needs Hearsay/RealtimeSTT sidecar.",
      };
    }
    try {
      const res = await this._fetch(`${this.sidecarUrl}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, product: "netie-clicks" }),
      });
      if (!res.ok) throw new Error(`STT start ${res.status}`);
      return { ok: true, mode: "sidecar", source };
    } catch (err) {
      return { ok: false, mode: "browser-speech", error: String(err.message || err) };
    }
  }

  async stop() {
    if (!this.sidecarOnline) return { ok: true };
    try {
      await this._fetch(`${this.sidecarUrl}/stop`, { method: "POST" });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async pullPartials() {
    if (!this.sidecarOnline) return { ok: false, lines: [] };
    try {
      const res = await this._fetch(`${this.sidecarUrl}/partials`);
      if (!res.ok) return { ok: false, lines: [] };
      const data = await res.json();
      return { ok: true, lines: data.lines || data.partials || [], final: data.final || "" };
    } catch {
      return { ok: false, lines: [] };
    }
  }
}

module.exports = { SttBridge };
