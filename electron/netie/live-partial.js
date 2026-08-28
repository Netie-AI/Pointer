"use strict";
/**
 * Speculative captions while an utterance is still open.
 *
 * Finals still own notes / scribe / capture commands. Partials only paint
 * LIVE chrome. Local engines (whisper / sidecar / OpenVault) are not
 * Deepgram streaming (P-04); this peeks the growing PCM on a cadence.
 */

const CADENCE_MS = 400;
const MIN_VOICED_MS = 240;

function shouldPeekPartial(state) {
  const s = state || {};
  if (s.speaking !== true) return false;
  if (s.busyFinal === true) return false;
  if (s.busyPartial === true) return false;
  const minVoiced = Number(s.minVoicedMs) > 0 ? Number(s.minVoicedMs) : MIN_VOICED_MS;
  if (Number(s.voicedMs) < minVoiced) return false;
  const last = Number(s.lastPeekAt) || 0;
  const now = Number(s.now) || 0;
  const cadence = Number(s.cadenceMs) > 0 ? Number(s.cadenceMs) : CADENCE_MS;
  if (now - last < cadence) return false;
  return true;
}

/**
 * One pump per audio source. onFinal invalidates in-flight peeks so a
 * hangover flush cannot paint stale words after the real utterance lands.
 */
function createPartialPump(opts = {}) {
  let busy = false;
  let gen = 0;
  let lastAt = 0;
  const minVoicedMs = Number(opts.minVoicedMs) > 0 ? Number(opts.minVoicedMs) : MIN_VOICED_MS;
  const cadenceMs = Number(opts.cadenceMs) > 0 ? Number(opts.cadenceMs) : CADENCE_MS;
  const transcribe = opts.transcribe;
  const send = opts.send;
  const busyFinal = typeof opts.busyFinal === "function" ? opts.busyFinal : () => false;
  const nowFn = typeof opts.now === "function" ? opts.now : () => Date.now();

  return {
    get busy() {
      return busy;
    },
    get gen() {
      return gen;
    },
    onFrame(seg) {
      if (!seg || typeof transcribe !== "function" || typeof send !== "function") return false;
      const now = nowFn();
      const voicedMs = typeof seg.voicedMs === "number" ? seg.voicedMs : 0;
      if (
        !shouldPeekPartial({
          speaking: seg.speaking === true,
          voicedMs,
          busyFinal: busyFinal() === true,
          busyPartial: busy,
          lastPeekAt: lastAt,
          now,
          minVoicedMs,
          cadenceMs,
        })
      ) {
        return false;
      }
      const snap = typeof seg.peek === "function" ? seg.peek() : null;
      if (!snap || !snap.pcm || !snap.pcm.length) return false;
      lastAt = now;
      const myGen = gen;
      busy = true;
      Promise.resolve(transcribe(snap.pcm))
        .then((res) => {
          if (myGen !== gen) return;
          const text = res && res.ok && res.text ? String(res.text).trim() : "";
          if (!text) return;
          send({
            text,
            engine: (res && res.engine) || "",
            partial: true,
          });
        })
        .catch(() => {})
        .finally(() => {
          if (myGen === gen) busy = false;
        });
      return true;
    },
    onFinal() {
      gen += 1;
      lastAt = 0;
      busy = false;
    },
  };
}

module.exports = { shouldPeekPartial, createPartialPump, CADENCE_MS, MIN_VOICED_MS };
