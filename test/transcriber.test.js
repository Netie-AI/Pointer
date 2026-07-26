"use strict";
/**
 * Transcription engine chain: local-first ordering, fallback, honest status.
 * All engines faked — no network, no binaries.
 * Run: node test/transcriber.test.js
 */

const assert = require("assert");
const { Transcriber, cleanup } = require("../electron/netie/transcriber");

let pass = 0;
const fails = [];
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const pcm = () => Float32Array.from({ length: 1600 }, (_, i) => Math.sin(i / 10) * 0.3);
const fakeFs = (present = []) => ({
  existsSync: (p) => present.includes(p),
  mkdirSync: () => {},
  writeFileSync: () => {},
  unlinkSync: () => {},
});

test("prefers local whisper.cpp over any network engine", async () => {
  const calls = [];
  const t = new Transcriber({
    whisperBin: "C:\\w\\main.exe",
    whisperModel: "C:\\w\\ggml-tiny.bin",
    fsImpl: fakeFs(["C:\\w\\main.exe", "C:\\w\\ggml-tiny.bin"]),
    execFileImpl: (bin, args, opts, cb) => {
      calls.push({ bin, args });
      cb(null, "  hello from whisper  ");
    },
    fetchImpl: () => {
      throw new Error("must not touch the network when local whisper exists");
    },
  });
  assert.strictEqual(await t.probe(), "whisper-cli");
  const out = await t.transcribe(pcm());
  assert.deepStrictEqual(
    { ok: out.ok, text: out.text, engine: out.engine },
    { ok: true, text: "hello from whisper", engine: "whisper-cli" }
  );
  assert.strictEqual(calls[0].bin, "C:\\w\\main.exe");
  assert.ok(calls[0].args.includes("-m") && calls[0].args.includes("C:\\w\\ggml-tiny.bin"));
});

test("half-installed whisper (binary but no model) is not used", async () => {
  const t = new Transcriber({
    whisperBin: "C:\\w\\main.exe",
    whisperModel: "C:\\w\\missing.bin",
    fsImpl: fakeFs(["C:\\w\\main.exe"]),
    openvaultUrl: "",
    sidecarUrl: "",
    allowWindowsSpeech: false,
  });
  assert.strictEqual(t.hasLocalWhisper(), false);
  assert.strictEqual(await t.probe(), "none");
});

test("falls back to OpenVault when whisper is absent", async () => {
  const seen = [];
  const t = new Transcriber({
    fsImpl: fakeFs(),
    openvaultUrl: "http://127.0.0.1:5000/v1/audio/transcriptions",
    fetchImpl: async (url, opts) => {
      seen.push({ url, method: (opts && opts.method) || "GET" });
      if (url.endsWith("/v1/models")) return { ok: true };
      return { ok: true, json: async () => ({ text: "from openvault" }) };
    },
  });
  const out = await t.transcribe(pcm());
  assert.deepStrictEqual({ ok: out.ok, text: out.text, engine: out.engine }, {
    ok: true,
    text: "from openvault",
    engine: "openvault",
  });
  assert.ok(seen.some((s) => s.method === "POST"), "posted the wav");
});

test("falls back to sidecar when OpenVault is down", async () => {
  const t = new Transcriber({
    fsImpl: fakeFs(),
    openvaultUrl: "http://127.0.0.1:5000/v1/audio/transcriptions",
    sidecarUrl: "http://127.0.0.1:8766",
    fetchImpl: async (url) => {
      if (url.startsWith("http://127.0.0.1:5000")) throw new Error("ECONNREFUSED");
      if (url.endsWith("/v1/models")) return { ok: true };
      return { ok: true, json: async () => ({ text: "from sidecar" }) };
    },
  });
  const out = await t.transcribe(pcm());
  assert.strictEqual(out.engine, "sidecar");
  assert.strictEqual(out.text, "from sidecar");
});

test("no engine anywhere → honest failure, never a fake transcript", async () => {
  const t = new Transcriber({
    fsImpl: fakeFs(),
    openvaultUrl: "http://127.0.0.1:5000/v1/audio/transcriptions",
    sidecarUrl: "",
    allowWindowsSpeech: false, // non-Windows, or dictation unavailable
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  const out = await t.transcribe(pcm());
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.text, "");
  assert.strictEqual(out.engine, "none");
  const d = t.describe();
  assert.strictEqual(d.engine, "none");
  assert.ok(/no stt engine/i.test(d.label), "HUD is told plainly there is no engine");
  assert.ok(d.hint.includes("NETIE_WHISPER_BIN"));
});

test("Windows dictation is the floor, never preferred over a real engine", async () => {
  const recognized = [];
  const winStub = {
    recognizeFile: async (p) => {
      recognized.push(p);
      return { text: "open the settings window", confidence: 0.55 };
    },
  };
  // Nothing else available → falls through to Windows dictation.
  const t = new Transcriber({
    fsImpl: fakeFs(),
    openvaultUrl: "",
    sidecarUrl: "",
    allowWindowsSpeech: true,
    winSpeechImpl: winStub,
  });
  assert.strictEqual(await t.probe(), "windows-speech");
  const out = await t.transcribe(pcm());
  assert.strictEqual(out.text, "open the settings window");
  assert.strictEqual(out.rough, true, "0.55 confidence must be flagged rough");
  assert.ok(recognized[0].endsWith(".wav"));

  // But a real engine outranks it.
  const better = new Transcriber({
    fsImpl: fakeFs(["C:\\w\\m.exe", "C:\\w\\g.bin"]),
    whisperBin: "C:\\w\\m.exe",
    whisperModel: "C:\\w\\g.bin",
    allowWindowsSpeech: true,
    winSpeechImpl: winStub,
    execFileImpl: (_b, _a, _o, cb) => cb(null, "open the settings window"),
  });
  assert.strictEqual(await better.probe(), "whisper-cli");
});

test("high-confidence Windows dictation is not flagged rough", async () => {
  const t = new Transcriber({
    fsImpl: fakeFs(),
    openvaultUrl: "",
    sidecarUrl: "",
    allowWindowsSpeech: true,
    winSpeechImpl: { recognizeFile: async () => ({ text: "scroll down", confidence: 0.92 }) },
  });
  const out = await t.transcribe(pcm());
  assert.strictEqual(out.rough, false);
  assert.strictEqual(out.confidence, 0.92);
});

test("every engine in the chain is local-only (governance)", async () => {
  const t = new Transcriber({ fsImpl: fakeFs() });
  for (const e of ["whisper-cli", "openvault", "sidecar", "windows-speech", "none"]) {
    t.engine = e;
    assert.strictEqual(t.describe().local, true, `${e} must be on-device`);
  }
  assert.ok(
    t.openvaultUrl.startsWith("http://127.0.0.1"),
    "default STT endpoint is loopback, never a remote host"
  );
});

test("a failing engine re-probes next utterance instead of wedging", async () => {
  let up = true;
  const t = new Transcriber({
    fsImpl: fakeFs(),
    openvaultUrl: "http://127.0.0.1:5000/v1/audio/transcriptions",
    sidecarUrl: "http://127.0.0.1:8766",
    fetchImpl: async (url) => {
      if (url.endsWith("/v1/models")) {
        if (url.startsWith("http://127.0.0.1:5000") && !up) throw new Error("down");
        return { ok: true };
      }
      if (url.startsWith("http://127.0.0.1:5000")) throw new Error("500");
      return { ok: true, json: async () => ({ text: "sidecar rescued it" }) };
    },
  });
  const first = await t.transcribe(pcm());
  assert.strictEqual(first.ok, false, "openvault failed");
  assert.strictEqual(t.engine, null, "engine cleared for re-probe");
  up = false;
  const second = await t.transcribe(pcm());
  assert.strictEqual(second.engine, "sidecar");
  assert.strictEqual(second.text, "sidecar rescued it");
});

test("empty audio is rejected without calling an engine", async () => {
  const t = new Transcriber({
    fsImpl: fakeFs(),
    fetchImpl: () => {
      throw new Error("should not be called");
    },
  });
  const out = await t.transcribe(new Float32Array(0));
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.error, "empty");
});

test("cleanup strips whisper non-speech tags and collapses whitespace", () => {
  assert.strictEqual(cleanup("[BLANK_AUDIO]"), "");
  assert.strictEqual(cleanup("  hello   there \n world "), "hello there world");
  assert.strictEqual(cleanup("[MUSIC] open   settings"), "open settings");
  assert.strictEqual(cleanup("(silence) hi"), "hi");
  assert.strictEqual(cleanup(null), "");
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
