"use strict";
/**
 * Mythos vault + memory + telemetry stress tests (no live servers).
 * Run: node test/vault.test.js
 */

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { encrypt, decrypt, wrapKey, unwrapKey } = require("../electron/netie/crypto/aead");
const { sealRecord, openWithUserKek, openWithNetieKek, verifyIntegrity } = require("../electron/netie/crypto/envelope");
const { deriveUserKek } = require("../electron/netie/crypto/kdf");
const { Vault } = require("../electron/netie/crypto/vault");
const { PersonalBrain } = require("../electron/netie/brain");
const { redactOutcome, redactFeedback, TELEMETRY_PATH } = require("../electron/netie/telemetry/queue");

let pass = 0;
const fails = [];
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "netie-vault-"));
}

test("AES-GCM wrong key fails hard", () => {
  const k1 = crypto.randomBytes(32);
  const k2 = crypto.randomBytes(32);
  const sealed = encrypt(k1, "secret");
  assert.throws(() => decrypt(k2, sealed));
});

test("tampered ciphertext fails auth", () => {
  const k = crypto.randomBytes(32);
  const sealed = encrypt(k, "hello");
  const buf = Buffer.from(sealed.ct, "base64");
  buf[0] ^= 0xff;
  sealed.ct = buf.toString("base64");
  assert.throws(() => decrypt(k, sealed));
});

test("dual envelope: user can open; netie can open; wrong kek cannot", () => {
  const userKek = crypto.randomBytes(32);
  const netieKek = crypto.randomBytes(32);
  const wrong = crypto.randomBytes(32);
  const rec = sealRecord({
    id: "r1",
    type: "memory",
    payload: { summary: "liked dark mode in Settings" },
    userKek,
    netieKek,
  });
  assert.ok(verifyIntegrity(rec));
  const u = openWithUserKek(rec, userKek);
  assert.ok(u.plaintext.toString().includes("dark mode"));
  const n = openWithNetieKek(rec, netieKek);
  assert.ok(n.plaintext.toString().includes("dark mode"));
  assert.throws(() => openWithUserKek(rec, wrong));
  assert.throws(() => openWithNetieKek(rec, wrong));
});

test("integrity hash detects wrap_user tamper", () => {
  const userKek = crypto.randomBytes(32);
  const rec = sealRecord({
    id: "r2",
    type: "memory",
    payload: { summary: "x" },
    userKek,
    netieKek: null,
  });
  rec.wrap_user.ct = Buffer.from(rec.wrap_user.ct, "base64").map((b, i) => (i === 0 ? b ^ 1 : b)).toString("base64");
  // hash still old → verify fails before unwrap
  assert.strictEqual(verifyIntegrity(rec), false);
  assert.throws(() => openWithUserKek(rec, userKek));
});

test("hash alone is not an unlock — flipping hash fails verify", () => {
  const userKek = crypto.randomBytes(32);
  const rec = sealRecord({
    id: "r3",
    type: "memory",
    payload: { summary: "y" },
    userKek,
  });
  rec.hash = "0".repeat(64);
  assert.strictEqual(verifyIntegrity(rec), false);
});

test("local-only record (no netie wrap) still opens for user", () => {
  const userKek = crypto.randomBytes(32);
  const rec = sealRecord({
    id: "r4",
    type: "memory",
    payload: { summary: "private note" },
    userKek,
    netieKek: null,
  });
  assert.strictEqual(rec.wrap_netie, null);
  const u = openWithUserKek(rec, userKek);
  assert.ok(u.plaintext.toString().includes("private"));
  assert.throws(() => openWithNetieKek(rec, crypto.randomBytes(32)));
});

test("Vault unlock derives stable user KEK across reopen", () => {
  const dir = tmpDir();
  const root = crypto.randomBytes(32);
  const v1 = new Vault({ dataDir: dir, deviceId: "dev-a", deviceRoot: root });
  v1.unlock();
  const kek1 = Buffer.from(v1.userKek);
  const v2 = new Vault({ dataDir: dir, deviceId: "dev-a", deviceRoot: root });
  v2.unlock();
  assert.ok(kek1.equals(v2.userKek));
  // different deviceId ⇒ different KEK (adaptive binding)
  const v3 = new Vault({ dataDir: dir, deviceId: "dev-b", deviceRoot: root });
  v3.unlock();
  assert.ok(!kek1.equals(v3.userKek));
});

test("MemoryStore put/search/export/delete round-trip", () => {
  const dir = tmpDir();
  const brain = new PersonalBrain({
    deviceId: "mem-test",
    dataDir: dir,
    deviceRoot: crypto.randomBytes(32),
    netieKek: crypto.randomBytes(32),
  }).unlock();

  brain.remember("User prefers compact toolbar in Excel", { tags: ["excel", "ui"] });
  brain.remember("Bank login page — never auto-fill", { tags: ["security"] });

  const hits = brain.search("excel toolbar");
  assert.ok(hits.length >= 1);
  assert.ok(hits[0].summary.toLowerCase().includes("excel"));

  const exp = brain.memory.exportAll();
  assert.strictEqual(exp.records.length, 2);

  brain.memory.deleteAll();
  assert.strictEqual(brain.memory.count(), 0);
});

test("telemetry opt-out blocks enqueue", () => {
  const dir = tmpDir();
  const brain = new PersonalBrain({
    deviceId: "tel-test",
    dataDir: dir,
    deviceRoot: crypto.randomBytes(32),
    netieKek: crypto.randomBytes(32),
  }).unlock();

  brain.telemetry.setConsent({
    outcome_telemetry: false,
    training_feedback: false,
    session_sketches: false,
  });
  const r = brain.telemetry.enqueueOutcome({
    action_type: "click",
    approved: true,
    succeeded: true,
    latency_ms: 12,
    app_class: "Notepad",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.blocked, "consent-off");
});

test("fleet default ON enqueues redacted Tier A only", () => {
  const dir = tmpDir();
  const brain = new PersonalBrain({
    deviceId: "tel-test2",
    dataDir: dir,
    deviceRoot: crypto.randomBytes(32),
    netieKek: crypto.randomBytes(32),
  }).unlock();

  const r = brain.telemetry.enqueueOutcome({
    action_type: "click",
    approved: true,
    succeeded: true,
    latency_ms: 40,
    app_class: "Chrome",
    screenshot_b64: "iVBORw0KGgo=",
    screen_text: "password=hunter2",
    email: "me@x.com",
  });
  assert.strictEqual(r.ok, true);
  const list = brain.telemetry.list();
  assert.strictEqual(list.length, 1);
  assert.ok(!JSON.stringify(list[0]).includes("hunter2"));
  assert.ok(!JSON.stringify(list[0]).includes("iVBORw0KGgo"));
});

test("redactors strip dangerous fields", () => {
  const a = redactOutcome({
    action_type: "type",
    screen_text: "secret",
    approved: true,
    succeeded: false,
    latency_ms: 99999999,
    app_class: "x".repeat(200),
  });
  assert.strictEqual(a.tier, "A");
  assert.ok(!("screen_text" in a));
  assert.ok(a.latency_ms <= 600000);
  assert.ok(a.app_class.length <= 64);

  const b = redactFeedback({ sentiment: "down", note: "n".repeat(1000), password: "nope" });
  assert.strictEqual(b.tier, "B");
  assert.ok(b.note.length <= 500);
  assert.ok(!("password" in b));
});

test("flush refuses when fleet paused; allowlist is /v1/telemetry only", async () => {
  assert.strictEqual(TELEMETRY_PATH, "/v1/telemetry");
  const dir = tmpDir();
  const calls = [];
  const brain = new PersonalBrain({
    deviceId: "flush-test",
    dataDir: dir,
    deviceRoot: crypto.randomBytes(32),
    netieKek: crypto.randomBytes(32),
    fetchImpl: async (url, opts) => {
      calls.push({ url, body: opts.body });
      return { ok: true, status: 200, json: async () => ({}) };
    },
  }).unlock();

  brain.telemetry.setConsent({
    outcome_telemetry: false,
    training_feedback: false,
    session_sketches: false,
  });
  const blocked = await brain.telemetry.flush();
  assert.strictEqual(blocked.blocked, "consent-off");
  assert.strictEqual(calls.length, 0);

  brain.telemetry.setConsent({ outcome_telemetry: true, training_feedback: true, session_sketches: true });
  brain.telemetry.enqueueOutcome({
    action_type: "click",
    approved: true,
    succeeded: true,
    latency_ms: 1,
    app_class: "x",
  });
  const res = await brain.telemetry.flush();
  assert.strictEqual(res.sent, 1);
  assert.ok(calls.some((c) => c.url.endsWith("/v1/telemetry")));
  assert.ok(!calls.some((c) => c.url.includes("/update")));
  const body = JSON.parse(calls.find((c) => c.url.endsWith("/v1/telemetry")).body);
  assert.ok(body.envelope.wrap_user);
  assert.ok(body.envelope.wrap_netie);
  assert.ok(body.user_verified);
});

test("HKDF adaptive: same root different info ⇒ different keys", () => {
  const root = crypto.randomBytes(32);
  const a = deriveUserKek(root, "device-1");
  const b = deriveUserKek(root, "device-2");
  assert.ok(!a.equals(b));
});

test("wrap/unwrap DEK round-trip", () => {
  const kek = crypto.randomBytes(32);
  const dek = crypto.randomBytes(32);
  const w = wrapKey(kek, dek);
  assert.ok(unwrapKey(kek, w).equals(dek));
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
  if (fails.length) process.exit(1);
  process.exit(0);
})();
