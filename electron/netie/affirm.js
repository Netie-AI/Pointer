"use strict";
/**
 * Affirmation / "nod" gate — voice, hotkey, or (later) camera.
 * Detect nod → start generating / approve the pending plan.
 */

const VOICE_YES =
  /\b(yes|yeah|yep|yup|ok|okay|go|do\s*it|confirm|approve|nod|sure)\b/i;
const VOICE_YES_CJK = /(可以|好的?|行啊?|对的?|對的?|嗯|好啊|走起)/;

function isAffirmation(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  // \b does not work around CJK — test Latin and CJK separately.
  return VOICE_YES.test(t) || VOICE_YES_CJK.test(t);
}

/**
 * Promise that resolves when the user affirms (voice callback, hotkey, or timeout skip).
 * Call `signal(text)` from STT; call `hotkey()` from main on Y/Space; `cancel()` on Esc.
 */
function createNodGate({ timeoutMs = 20000 } = {}) {
  let resolveFn = null;
  let timer = null;
  const gate = {
    pending: false,
    promise: null,
    begin() {
      if (this.pending) return this.promise;
      this.pending = true;
      this.promise = new Promise((resolve) => {
        resolveFn = resolve;
        timer = setTimeout(() => this._finish({ ok: false, reason: "timeout" }), timeoutMs);
      });
      return this.promise;
    },
    signal(text) {
      if (!this.pending) return false;
      if (isAffirmation(text)) {
        this._finish({ ok: true, via: "voice", text: String(text).slice(0, 80) });
        return true;
      }
      return false;
    },
    hotkey(via = "key") {
      if (!this.pending) return false;
      this._finish({ ok: true, via });
      return true;
    },
    cancel(reason = "cancel") {
      if (!this.pending) return false;
      this._finish({ ok: false, reason });
      return true;
    },
    _finish(result) {
      if (!this.pending) return;
      this.pending = false;
      clearTimeout(timer);
      const r = resolveFn;
      resolveFn = null;
      if (r) r(result);
    },
  };
  return gate;
}

module.exports = { isAffirmation, createNodGate, VOICE_YES, VOICE_YES_CJK };
