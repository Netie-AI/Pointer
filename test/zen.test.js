"use strict";
/**
 * Security regressions from prior review + driver dry-run.
 * Run: node test/zen.test.js
 */

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { coerceBool, TELEMETRY_PATH } = require("../electron/netie/telemetry/queue");
const { PersonalBrain } = require("../electron/netie/brain");
const { InputDriver } = require("../electron/netie/driver");
const { sealRecord } = require("../electron/netie/crypto/envelope");
const { Vault } = require("../electron/netie/crypto/vault");

let pass = 0;
const fails = [];
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "netie-zen-"));
}

test("coerceBool: string false is false (not truthy)", () => {
  assert.strictEqual(coerceBool("false"), false);
  assert.strictEqual(coerceBool("FALSE"), false);
  assert.strictEqual(coerceBool("0"), false);
  assert.strictEqual(coerceBool("true"), true);
  assert.strictEqual(coerceBool(true), true);
  assert.strictEqual(coerceBool(false), false);
  assert.strictEqual(coerceBool(undefined, true), true);
});

test("ConsentStore rejects stringly false-as-true via IPC shape", () => {
  const dir = tmpDir();
  const brain = new PersonalBrain({
    deviceId: "zen-consent",
    dataDir: dir,
    deviceRoot: crypto.randomBytes(32),
  }).unlock();
  brain.telemetry.setConsent({
    outcome_telemetry: "false",
    training_feedback: "false",
    session_sketches: "false",
  });
  const c = brain.telemetry.getConsent();
  assert.strictEqual(c.outcome_telemetry, false);
  assert.strictEqual(c.training_feedback, false);
  assert.strictEqual(c.session_sketches, false);
  assert.strictEqual(brain.status().fleetOn, false);
});

test("flush skips envelopes that fail user-kek open", async () => {
  const dir = tmpDir();
  const calls = [];
  const userKek = crypto.randomBytes(32);
  const netieKek = crypto.randomBytes(32);
  const brain = new PersonalBrain({
    deviceId: "zen-flush",
    dataDir: dir,
    deviceRoot: crypto.randomBytes(32),
    netieKek,
    fetchImpl: async (url, opts) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => ({}) };
    },
  }).unlock();

  // Plant a pending item whose wrap_user is under a DIFFERENT user kek.
  const id = crypto.randomUUID();
  const sealed = sealRecord({
    id,
    type: "telemetry",
    payload: { kind: "outcome", tier: "A", action_type: "click" },
    userKek, // not brain's userKek
    netieKek,
  });
  const qdir = path.join(dir, "telemetry");
  fs.mkdirSync(qdir, { recursive: true });
  fs.writeFileSync(path.join(qdir, `${id}.enc.json`), JSON.stringify(sealed));
  fs.writeFileSync(
    path.join(qdir, "queue.json"),
    JSON.stringify({
      version: 1,
      items: [
        {
          id,
          kind: "outcome",
          status: "pending",
          lineage_id: sealed.lineage_id,
          has_netie_wrap: true,
          preview: "x",
        },
      ],
    })
  );

  const res = await brain.telemetry.flush({ reason: "test" });
  assert.strictEqual(res.sent, 0);
  assert.ok(res.errors.some((e) => e.error === "user-kek-open-failed"));
  assert.strictEqual(calls.filter((u) => u.endsWith(TELEMETRY_PATH)).length, 0);
});

test("vault rejects test-plain without env escape hatch", () => {
  const dir = tmpDir();
  const vaultDir = path.join(dir, "vault");
  fs.mkdirSync(vaultDir, { recursive: true });
  fs.writeFileSync(
    path.join(vaultDir, "root.sealed.json"),
    JSON.stringify({ method: "test-plain", root_b64: crypto.randomBytes(32).toString("base64") })
  );
  delete process.env.NETIE_VAULT_ALLOW_TEST_PLAIN;
  const v = new Vault({ dataDir: dir, deviceId: "x" });
  assert.throws(() => v.unlock(), /disallowed|Unknown/);
});

test("driver dry-run click/type without OS", async () => {
  const d = new InputDriver({ dryRun: true });
  const click = await d.perform(
    { type: "click", xPct: 50, yPct: 50 },
    { region: { x: 100, y: 200, width: 400, height: 300 } }
  );
  assert.strictEqual(click.ok, true);
  assert.strictEqual(Math.round(click.x), 300); // 100 + 0.5*400
  assert.strictEqual(Math.round(click.y), 350); // 200 + 0.5*300

  const typed = await d.perform({ type: "type", value: "hello" });
  assert.strictEqual(typed.ok, true);
  assert.strictEqual(typed.typed, 5);

  const miss = await d.perform({ type: "click", target: "Save" }, { region: { x: 0, y: 0, width: 0, height: 0 } });
  assert.strictEqual(miss.ok, false);
});

test("feedback preview never contains note plaintext", () => {
  const dir = tmpDir();
  const brain = new PersonalBrain({
    deviceId: "zen-prev",
    dataDir: dir,
    deviceRoot: crypto.randomBytes(32),
  }).unlock();
  brain.telemetry.enqueueFeedback({
    sentiment: "down",
    note: "my password is hunter2 and ssn 123",
  });
  const list = brain.telemetry.list();
  assert.ok(list.length >= 1);
  assert.ok(!JSON.stringify(list).includes("hunter2"));
  assert.ok(list[0].preview.includes("note_chars="));
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass += 1;
      console.log("PASS " + name);
    } catch (err) {
      fails.push(`${name} — ${err.message}`);
      console.log("FAIL " + name + " — " + err.stack);
    }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
