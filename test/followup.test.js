"use strict";
/**
 * Follow-up coverage: targeting + custody client (mocked).
 */

const assert = require("assert");
const { ensureActionCoords } = require("../electron/netie/targeting");
const { NetieEcosystem } = require("../electron/netie/ecosystem");

let pass = 0;
const fails = [];
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function mockFetch(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    for (const [frag, responder] of routes) {
      if (url.includes(frag)) {
        const r = typeof responder === "function" ? responder(url, opts) : responder;
        if (r && r.__throw) throw new Error(r.__throw);
        return {
          ok: r.ok !== false,
          status: r.status || 200,
          json: async () => r.json,
          text: async () => (typeof r.text === "string" ? r.text : JSON.stringify(r.json)),
        };
      }
    }
    throw new Error("no mock for " + url);
  };
  impl.calls = calls;
  return impl;
}

test("ensureActionCoords keeps existing xPct", async () => {
  const a = await ensureActionCoords(
    { type: "click", target: "Save", xPct: 20, yPct: 80 },
    { dataUrl: null, eco: null }
  );
  assert.strictEqual(a.xPct, 20);
  assert.strictEqual(a._targeted, undefined);
});

test("ensureActionCoords keeps absolute x/y (click window: center)", async () => {
  const a = await ensureActionCoords(
    { type: "click", x: 420, y: 440 },
    { dataUrl: "data:image/png;base64,aaa", eco: null }
  );
  assert.strictEqual(a.x, 420);
  assert.strictEqual(a.y, 440);
  assert.strictEqual(a._targeted, undefined);
});

test("ensureActionCoords fills missing coords via vision mock", async () => {
  const f = mockFetch([
    [
      "/v1/chat/completions",
      { json: { choices: [{ message: { content: '{"xPct":33,"yPct":66}' } }] } },
    ],
  ]);
  const eco = new NetieEcosystem({ fetchImpl: f });
  const a = await ensureActionCoords(
    { type: "click", target: "green Save" },
    { dataUrl: "data:image/png;base64,aaa", eco }
  );
  assert.strictEqual(a.xPct, 33);
  assert.strictEqual(a.yPct, 66);
  assert.strictEqual(a._targeted, true);
});

test("requestCustody audits and soft-fails when inject missing", async () => {
  const f = mockFetch([
    ["/dms/audit/append", { json: { ok: true } }],
    ["/v1/custody/inject", { ok: false, status: 404, json: { detail: "missing" } }],
  ]);
  const eco = new NetieEcosystem({ fetchImpl: f });
  const r = await eco.requestCustody({ target: "Password" });
  assert.strictEqual(r.pending, true);
  assert.ok(String(r.message).toLowerCase().includes("yourself") || String(r.message).toLowerCase().includes("openvault"));
  assert.ok(f.calls.some((c) => c.url.includes("/dms/audit/append")));
});

test("planActions receives hotContext in LLM system (memory-aware)", async () => {
  const f = mockFetch([
    ["/dms/secure", { json: { ok: true, blocked: false, text: "Instruction: click Save" } }],
    [
      "/v1/chat/completions",
      (url, opts) => {
        const body = JSON.parse(opts.body);
        const sys = body.messages[0].content;
        assert.ok(sys.includes("likes compact toolbar"), "planner missing personal memory");
        return { json: { choices: [{ message: { content: '[{"type":"click","target":"Save","xPct":50,"yPct":50}]' } }] } };
      },
    ],
    ["/dms/audit/append", { json: { ok: true } }],
  ]);
  const eco = new NetieEcosystem({ fetchImpl: f });
  const plan = await eco.planActions({
    instruction: "click Save",
    hotContext: "Personal memory:\n- likes compact toolbar",
  });
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.actions[0].type, "click");
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass += 1;
      console.log("PASS " + name);
    } catch (err) {
      fails.push(`${name} — ${err.message}`);
      console.log("FAIL " + name + " — " + err.message);
    }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
