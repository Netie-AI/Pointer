"use strict";
/**
 * Speculative LIVE captions. Partials never become notes or commands.
 * Run: node test/live-partial.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { Segmenter, TARGET_RATE } = require("../electron/netie/audio");
const {
  shouldPeekPartial,
  createPartialPump,
  CADENCE_MS,
  MIN_VOICED_MS,
} = require("../electron/netie/live-partial");

let pass = 0;
const fails = [];
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

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

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("shouldPeekPartial: idle / busy / short / cadence all refuse", () => {
  const base = {
    speaking: true,
    voicedMs: 500,
    busyFinal: false,
    busyPartial: false,
    lastPeekAt: 0,
    now: 1000,
  };
  assert.strictEqual(shouldPeekPartial({ ...base, speaking: false }), false);
  assert.strictEqual(shouldPeekPartial({ ...base, busyFinal: true }), false);
  assert.strictEqual(shouldPeekPartial({ ...base, busyPartial: true }), false);
  assert.strictEqual(shouldPeekPartial({ ...base, voicedMs: 100 }), false);
  assert.strictEqual(shouldPeekPartial({ ...base, lastPeekAt: 800 }), false);
  assert.strictEqual(shouldPeekPartial(base), true);
  assert.strictEqual(CADENCE_MS, 400);
  assert.strictEqual(MIN_VOICED_MS, 240);
});

test("Segmenter.peek copies growing PCM and does not close the take", () => {
  const seg = new Segmenter();
  feed(seg, 400, 0.001);
  assert.strictEqual(seg.peek(), null, "idle peek is empty");
  feed(seg, 600, 0.3);
  assert.strictEqual(seg.speaking, true);
  const first = seg.peek();
  assert.ok(first && first.reason === "peek");
  assert.ok(first.pcm.length > 0.5 * TARGET_RATE);
  const firstLen = first.pcm.length;
  feed(seg, 200, 0.3);
  const second = seg.peek();
  assert.ok(second.pcm.length > firstLen, "peek grew with more speech");
  assert.strictEqual(seg.speaking, true, "peek must not flush");
  const out = feed(seg, 800, 0.001);
  assert.ok(out && out.reason === "silence");
  assert.strictEqual(seg.peek(), null, "closed utterance has no peek");
});

test("pump sends a partial and skips a second frame until cadence", async () => {
  const sent = [];
  let now = 1000;
  const pump = createPartialPump({
    now: () => now,
    busyFinal: () => false,
    cadenceMs: 400,
    minVoicedMs: 100,
    transcribe: async () => ({ ok: true, text: "hello there", engine: "fake" }),
    send: (evt) => sent.push(evt),
  });
  const seg = {
    speaking: true,
    voicedMs: 400,
    peek: () => ({ pcm: new Float32Array(32) }),
  };
  assert.strictEqual(pump.onFrame(seg), true);
  await tick();
  await tick();
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].partial, true);
  assert.strictEqual(sent[0].text, "hello there");
  assert.strictEqual(pump.onFrame(seg), false, "cadence holds");
  now = 1500;
  assert.strictEqual(pump.onFrame(seg), true, "cadence elapsed");
});

test("in-flight partial is dropped after onFinal", async () => {
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  const sent = [];
  const pump = createPartialPump({
    now: () => 1000,
    busyFinal: () => false,
    cadenceMs: 1,
    minVoicedMs: 1,
    transcribe: () => pending,
    send: (evt) => sent.push(evt),
  });
  const seg = {
    speaking: true,
    voicedMs: 500,
    peek: () => ({ pcm: new Float32Array(16) }),
  };
  assert.strictEqual(pump.onFrame(seg), true);
  pump.onFinal();
  resolve({ ok: true, text: "stale", engine: "fake" });
  await pending;
  await tick();
  await tick();
  assert.strictEqual(sent.length, 0, "stale peek must not paint");
});

test("finals win: busyFinal skips peeks", () => {
  const pump = createPartialPump({
    now: () => 1000,
    busyFinal: () => true,
    cadenceMs: 1,
    minVoicedMs: 1,
    transcribe: async () => ({ ok: true, text: "nope" }),
    send: () => {
      throw new Error("must not send");
    },
  });
  assert.strictEqual(
    pump.onFrame({
      speaking: true,
      voicedMs: 900,
      peek: () => ({ pcm: new Float32Array(8) }),
    }),
    false
  );
});

test("empty or failed transcribe never paints", async () => {
  const sent = [];
  const pump = createPartialPump({
    now: () => 1000,
    busyFinal: () => false,
    cadenceMs: 1,
    minVoicedMs: 1,
    transcribe: async () => ({ ok: false, text: "", error: "none" }),
    send: (evt) => sent.push(evt),
  });
  pump.onFrame({
    speaking: true,
    voicedMs: 500,
    peek: () => ({ pcm: new Float32Array(8) }),
  });
  await tick();
  await tick();
  assert.strictEqual(sent.length, 0);
});

test("main wires the pump and marks transcript events partial", () => {
  const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
  assert.match(main, /createPartialPump/);
  assert.match(main, /partialPumpFor/);
  assert.match(main, /partial:\s*true/);
  assert.match(main, /\.onFinal\(\)/);
  assert.match(main, /rememberCaption\(source, evt\.text, true\)/);
  assert.match(main, /params\.captions === true/);
  assert.doesNotMatch(main, /rememberHeard\([^)]*partial/);
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass += 1;
      console.log("PASS " + name);
    } catch (err) {
      fails.push(name);
      console.log("FAIL " + name + " -- " + (err && err.stack ? err.stack : err));
    }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
