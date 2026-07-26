"use strict";
const assert = require("assert");
const { SttBridge } = require("../electron/netie/stt");

let pass = 0;
const fails = [];
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("ping miss → browser-speech mode on start", async () => {
  const stt = new SttBridge({
    sidecarUrl: "http://127.0.0.1:1",
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  const r = await stt.start("system");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.mode, "browser-speech");
});

test("sidecar start ok", async () => {
  const stt = new SttBridge({
    sidecarUrl: "http://127.0.0.1:8766",
    fetchImpl: async (url, opts) => {
      if (String(url).includes("/health")) return { ok: true };
      if (String(url).includes("/start")) {
        assert.ok(opts.body.includes("both"));
        return { ok: true };
      }
      return { ok: false };
    },
  });
  const r = await stt.start("both");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mode, "sidecar");
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass += 1;
      console.log("PASS " + name);
    } catch (err) {
      fails.push(name);
      console.log("FAIL " + name + " — " + err.message);
    }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
