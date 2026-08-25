"use strict";
/**
 * Audio DSP + utterance segmentation for live transcription.
 *
 * Pure functions and plain state machines only — no Web Audio, no Electron, no
 * network. The renderer feeds raw Float32 frames in; this decides what counts
 * as an utterance and hands back 16 kHz mono PCM ready for an STT engine.
 *
 * Why 16 kHz mono s16: it is the common denominator every speech engine we
 * chain to accepts (whisper.cpp, faster-whisper, OpenAI-shaped /v1/audio/*).
 */

const TARGET_RATE = 16000;

/** Average N channel buffers into one. Mono in → same buffer back. */
function mixToMono(channels) {
  const live = (channels || []).filter((c) => c && c.length);
  if (!live.length) return new Float32Array(0);
  if (live.length === 1) return live[0];
  const n = Math.min(...live.map((c) => c.length));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let c = 0; c < live.length; c++) sum += live[c][i];
    out[i] = sum / live.length;
  }
  return out;
}

/**
 * Linear-interpolation resample to 16 kHz. Speech at 16 kHz does not justify a
 * windowed-sinc; the engines all band-limit anyway.
 */
function downsampleTo16k(input, inRate) {
  if (!input || !input.length) return new Float32Array(0);
  if (!inRate || inRate === TARGET_RATE) return Float32Array.from(input);
  const ratio = inRate / TARGET_RATE;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/** Root-mean-square level of a frame (0..~1). */
function rmsEnergy(frame) {
  if (!frame || !frame.length) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

/** Float32 [-1,1] → little-endian signed 16-bit PCM. */
function floatToPcm16(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Wrap 16 kHz mono PCM16 in a RIFF/WAVE container (what STT engines accept). */
function encodeWav16(pcm16, sampleRate = TARGET_RATE) {
  const bytes = pcm16.length * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // PCM fmt chunk size
  buf.writeUInt16LE(1, 20); // format = PCM
  buf.writeUInt16LE(1, 22); // channels
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < pcm16.length; i++) buf.writeInt16LE(pcm16[i], 44 + i * 2);
  return buf;
}

/**
 * Energy-gated utterance segmenter with an adaptive noise floor.
 *
 * Speech is cut on a trailing silence (hangover) rather than the first quiet
 * frame, so natural pauses mid-sentence don't shatter one thought into five
 * transcription calls. A hard cap force-flushes so a monologue still streams.
 *
 * push(frame) → null | { pcm, ms, reason }
 */
class Segmenter {
  constructor(opts = {}) {
    this.rate = opts.rate || TARGET_RATE;
    this.frameMs = opts.frameMs || 20;
    // Speech must clear the noise floor by this factor (and an absolute floor,
    // so a dead-silent room doesn't make any whisper "speech").
    this.factor = opts.factor || 3.0;
    this.absFloor = opts.absFloor != null ? opts.absFloor : 0.008;
    this.startFrames = opts.startFrames || 3; // ~60ms of speech to open
    this.hangoverMs = opts.hangoverMs || 700; // trailing silence closes
    this.minMs = opts.minMs || 320; // ignore coughs/clicks
    this.maxMs = opts.maxMs || 15000; // force flush long speech
    this.preRollMs = opts.preRollMs || 200; // keep the word's attack
    this.noiseFloor = opts.noiseFloor != null ? opts.noiseFloor : 0.004;

    this.speaking = false;
    this._voiced = 0;
    this._silentMs = 0;
    this._buf = [];
    this._bufMs = 0;
    this._voicedMs = 0; // speech only — the hangover tail must not pad this
    this._pre = [];
    this._preMs = 0;
  }

  get threshold() {
    return Math.max(this.absFloor, this.noiseFloor * this.factor);
  }

  /** @param {Float32Array} frame 16 kHz mono */
  push(frame) {
    if (!frame || !frame.length) return null;
    const ms = (frame.length / this.rate) * 1000;
    const energy = rmsEnergy(frame);
    const isSpeech = energy > this.threshold;

    if (!isSpeech) {
      // Track the floor only on non-speech so loud talking can't raise the gate.
      this.noiseFloor = this.noiseFloor * 0.95 + energy * 0.05;
    }

    if (!this.speaking) {
      if (isSpeech) {
        this._voiced += 1;
        this._pre.push(frame);
        this._preMs += ms;
        if (this._voiced >= this.startFrames) {
          this.speaking = true;
          this._buf = this._pre.slice();
          this._bufMs = this._preMs;
          this._voicedMs = this._voiced * ms;
          this._pre = [];
          this._preMs = 0;
          this._silentMs = 0;
        }
        return null;
      }
      // Keep a short pre-roll so the opening consonant survives.
      this._voiced = 0;
      this._pre.push(frame);
      this._preMs += ms;
      while (this._preMs > this.preRollMs && this._pre.length > 1) {
        const dropped = this._pre.shift();
        this._preMs -= (dropped.length / this.rate) * 1000;
      }
      return null;
    }

    this._buf.push(frame);
    this._bufMs += ms;
    if (isSpeech) this._voicedMs += ms;
    this._silentMs = isSpeech ? 0 : this._silentMs + ms;

    if (this._silentMs >= this.hangoverMs) return this._flush("silence");
    if (this._bufMs >= this.maxMs) return this._flush("maxlen");
    return null;
  }

  /** Close any open utterance (mic off, pause, window hide). */
  end() {
    return this.speaking ? this._flush("end") : null;
  }

  _flush(reason) {
    const frames = this._buf;
    const ms = this._bufMs;
    const voicedMs = this._voicedMs;
    this.speaking = false;
    this._voiced = 0;
    this._silentMs = 0;
    this._buf = [];
    this._bufMs = 0;
    this._voicedMs = 0;
    this._pre = [];
    this._preMs = 0;
    // Gate on voiced content: a cough plus a long hangover tail is not speech.
    if (voicedMs < this.minMs) return null;

    let total = 0;
    for (const f of frames) total += f.length;
    const pcm = new Float32Array(total);
    let off = 0;
    for (const f of frames) {
      pcm.set(f, off);
      off += f.length;
    }
    return { pcm, ms: Math.round(ms), voicedMs: Math.round(voicedMs), reason };
  }
}

module.exports = {
  TARGET_RATE,
  mixToMono,
  downsampleTo16k,
  rmsEnergy,
  floatToPcm16,
  encodeWav16,
  Segmenter,
};
