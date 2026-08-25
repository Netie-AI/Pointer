"use strict";
/**
 * Audio DSP + utterance segmentation. Pure math, no Web Audio.
 * Run: node test/audio.test.js
 */

const assert = require("assert");
const {
  TARGET_RATE,
  mixToMono,
  downsampleTo16k,
  rmsEnergy,
  floatToPcm16,
  encodeWav16,
  Segmenter,
} = require("../electron/netie/audio");

let pass = 0;
const fails = [];
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/** frame of `ms` at 16k with given amplitude (sine so RMS is predictable) */
function frame(ms, amp, rate = TARGET_RATE) {
  const n = Math.round((ms / 1000) * rate);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = Math.sin((i / rate) * 2 * Math.PI * 220) * amp;
  return f;
}
const feed = (seg, ms, amp, step = 20) => {
  let out = null;
  for (let t = 0; t < ms; t += step) {
    const r = seg.push(frame(step, amp));
    if (r) out = r;
  }
  return out;
};

test("mixToMono averages channels and tolerates empties", () => {
  const a = Float32Array.from([1, 0, -1]);
  const b = Float32Array.from([0, 0, 1]);
  assert.deepStrictEqual(Array.from(mixToMono([a, b])), [0.5, 0, 0]);
  assert.strictEqual(mixToMono([a]), a, "single channel passes through");
  assert.strictEqual(mixToMono([]).length, 0);
  assert.strictEqual(mixToMono([null, undefined]).length, 0);
  // Ragged channels clamp to the shorter one instead of reading garbage.
  assert.strictEqual(mixToMono([Float32Array.from([1, 1, 1, 1]), Float32Array.from([1, 1])]).length, 2);
});

test("downsampleTo16k halves 32k, passes 16k through, handles empty", () => {
  const src = new Float32Array(320); // 10ms @32k
  for (let i = 0; i < src.length; i++) src[i] = i / 320;
  const out = downsampleTo16k(src, 32000);
  assert.strictEqual(out.length, 160);
  assert.ok(Math.abs(out[0] - 0) < 1e-6);
  assert.ok(Math.abs(out[80] - 0.5) < 0.01, "linear ramp preserved");
  assert.strictEqual(downsampleTo16k(src, 16000).length, 320);
  assert.strictEqual(downsampleTo16k(new Float32Array(0), 48000).length, 0);
  // 48k → 16k is the common real case (Windows default device rate).
  assert.strictEqual(downsampleTo16k(new Float32Array(480), 48000).length, 160);
});

test("rmsEnergy: silence 0, full-scale sine ~0.707", () => {
  assert.strictEqual(rmsEnergy(new Float32Array(100)), 0);
  assert.ok(Math.abs(rmsEnergy(frame(100, 1)) - 0.707) < 0.01);
  assert.strictEqual(rmsEnergy(null), 0);
});

test("floatToPcm16 clamps beyond [-1,1] instead of wrapping", () => {
  const out = floatToPcm16(Float32Array.from([0, 1, -1, 2, -2]));
  assert.strictEqual(out[0], 0);
  assert.strictEqual(out[1], 32767);
  assert.strictEqual(out[2], -32768);
  assert.strictEqual(out[3], 32767, "clamped, not wrapped to negative");
  assert.strictEqual(out[4], -32768);
});

test("encodeWav16 writes a valid 16k mono PCM RIFF header", () => {
  const wav = encodeWav16(Int16Array.from([0, 1, -1]));
  assert.strictEqual(wav.toString("ascii", 0, 4), "RIFF");
  assert.strictEqual(wav.toString("ascii", 8, 12), "WAVE");
  assert.strictEqual(wav.readUInt16LE(20), 1, "PCM");
  assert.strictEqual(wav.readUInt16LE(22), 1, "mono");
  assert.strictEqual(wav.readUInt32LE(24), 16000);
  assert.strictEqual(wav.readUInt16LE(34), 16, "16-bit");
  assert.strictEqual(wav.readUInt32LE(40), 6, "data bytes");
  assert.strictEqual(wav.length, 44 + 6);
  assert.strictEqual(wav.readInt16LE(46), 1);
});

test("Segmenter: silence alone never emits an utterance", () => {
  const seg = new Segmenter();
  assert.strictEqual(feed(seg, 3000, 0.001), null);
  assert.strictEqual(seg.speaking, false);
});

test("Segmenter: speech then hangover emits once, with pre-roll attack", () => {
  const seg = new Segmenter();
  feed(seg, 400, 0.001); // establish noise floor
  assert.strictEqual(feed(seg, 600, 0.3), null, "still speaking — no emit yet");
  assert.strictEqual(seg.speaking, true);
  const out = feed(seg, 800, 0.001); // hangover closes it
  assert.ok(out, "utterance emitted after trailing silence");
  assert.strictEqual(out.reason, "silence");
  assert.ok(out.ms >= 600, `kept the speech (${out.ms}ms)`);
  assert.ok(out.pcm.length > 0.6 * TARGET_RATE);
  assert.strictEqual(seg.speaking, false);
});

test("Segmenter: brief blip below minMs is discarded", () => {
  const seg = new Segmenter();
  feed(seg, 400, 0.001);
  feed(seg, 100, 0.4); // cough
  // Regression: the 700ms hangover tail must not pad a 100ms cough past minMs.
  assert.strictEqual(feed(seg, 900, 0.001), null, "too short to be speech");
});

test("Segmenter: minMs counts voiced audio, not the silent tail", () => {
  const seg = new Segmenter({ minMs: 320, hangoverMs: 700 });
  feed(seg, 300, 0.001);
  feed(seg, 400, 0.3);
  const out = feed(seg, 800, 0.001);
  assert.ok(out, "400ms of real speech clears the gate");
  assert.ok(out.voicedMs >= 320 && out.voicedMs < out.ms, "voiced tracked apart from total");
});

test("Segmenter: a mid-sentence pause does not split the utterance", () => {
  const seg = new Segmenter({ hangoverMs: 700 });
  feed(seg, 400, 0.001);
  feed(seg, 500, 0.3);
  assert.strictEqual(feed(seg, 300, 0.001), null, "300ms pause < 700ms hangover");
  feed(seg, 500, 0.3);
  const out = feed(seg, 800, 0.001);
  assert.ok(out && out.ms > 1200, "one utterance spanning the pause");
});

test("Segmenter: long monologue force-flushes at maxMs", () => {
  const seg = new Segmenter({ maxMs: 2000 });
  feed(seg, 200, 0.001);
  const out = feed(seg, 3000, 0.3);
  assert.ok(out, "flushed without waiting for silence");
  assert.strictEqual(out.reason, "maxlen");
  assert.ok(out.ms <= 2100);
});

test("Segmenter: end() closes an open utterance, no-ops when idle", () => {
  const seg = new Segmenter();
  feed(seg, 300, 0.001);
  feed(seg, 600, 0.3);
  const out = seg.end();
  assert.ok(out && out.reason === "end");
  assert.strictEqual(seg.end(), null, "idle end is a no-op");
});

test("Segmenter: loud speech cannot drag the noise floor up over itself", () => {
  const seg = new Segmenter();
  feed(seg, 300, 0.001);
  const floorBefore = seg.noiseFloor;
  feed(seg, 2000, 0.5); // sustained loud speech
  assert.ok(seg.noiseFloor <= floorBefore * 1.5, "floor only adapts on non-speech frames");
  assert.ok(seg.speaking, "still hearing speech, not gated out");
});

test("Segmenter: noisy room raises the gate so hiss is not transcribed", () => {
  const quiet = new Segmenter();
  feed(quiet, 500, 0.001);
  const noisy = new Segmenter();
  feed(noisy, 2000, 0.02); // fan / aircon hiss
  assert.ok(noisy.threshold > quiet.threshold, "gate adapted upward");
  assert.strictEqual(feed(noisy, 1500, 0.02), null, "steady hiss never becomes an utterance");
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass += 1;
      console.log("PASS " + name);
    } catch (err) {
      fails.push(name);
      console.log("FAIL " + name + " — " + err.stack);
    }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
