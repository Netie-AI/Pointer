"use strict";
/**
 * Local action ledger — the record that survives Cortex being down.
 * These are the promises the HUD makes when it says "check what it clicked".
 * Run: node test/ledger.test.js
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createLedger,
  describeRecord,
  canonical,
  redact,
  redactAction,
  isRedactedKey,
} = require("../electron/netie/ledger");

let pass = 0;
const fails = [];
const tests = [];
const test = (n, f) => tests.push({ name: n, fn: f });

const tmpDirs = [];
function freshDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "netie-ledger-"));
  tmpDirs.push(d);
  return d;
}

/** A clock the test drives, so day rotation and ordering are not wall-clock luck. */
function clockFrom(iso) {
  let t = Date.parse(iso);
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

test("an appended record is readable, sequenced and chained to genesis", () => {
  const led = createLedger({ dir: freshDir() });
  const rec = led.append("clicks.action.executed", { app: "Outlook" });
  assert.ok(rec, "append returned a record");
  assert.strictEqual(rec.seq, 1);
  assert.strictEqual(rec.prev, led.GENESIS);
  assert.strictEqual(led.read().length, 1);
  assert.strictEqual(led.verify().ok, true);
});

test("verify walks the whole chain and counts every record", () => {
  const led = createLedger({ dir: freshDir() });
  for (let i = 0; i < 25; i += 1) led.append("clicks.action.executed", { i });
  const v = led.verify();
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.count, 25);
  assert.strictEqual(v.brokenAt, null);
});

test("a record edited after the fact is caught, and the edit is named", () => {
  const dir = freshDir();
  const led = createLedger({ dir });
  led.append("clicks.action.executed", { target: "Send" });
  led.append("clicks.action.executed", { target: "Archive" });
  led.append("clicks.action.executed", { target: "Reply" });

  const file = path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".ndjson")));
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  const tampered = JSON.parse(lines[1]);
  tampered.payload.target = "Delete";           // rewrite history, keep the hash
  lines[1] = JSON.stringify(tampered);
  fs.writeFileSync(file, `${lines.join("\n")}\n`);

  const v = createLedger({ dir }).verify();
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.brokenAt, 2);
  assert.match(v.reason, /edited/);
});

test("a record deleted from the middle is caught as a sequence break", () => {
  const dir = freshDir();
  const led = createLedger({ dir });
  for (let i = 0; i < 4; i += 1) led.append("clicks.action.executed", { i });

  const file = path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".ndjson")));
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  lines.splice(1, 1);                            // make step 2 disappear
  fs.writeFileSync(file, `${lines.join("\n")}\n`);

  const v = createLedger({ dir }).verify();
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.brokenAt, 2);
  assert.match(v.reason, /sequence/);
});

test("re-hashing a tampered record still fails, because prev binds it to the chain", () => {
  // The obvious forgery: edit the payload AND recompute that record's own hash.
  // The next record's `prev` is what makes it fail anyway.
  const dir = freshDir();
  const led = createLedger({ dir });
  led.append("clicks.action.executed", { target: "Send" });
  led.append("clicks.action.executed", { target: "Archive" });

  const { hashRecord } = require("../electron/netie/ledger");
  const file = path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".ndjson")));
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  const forged = JSON.parse(lines[0]);
  forged.payload.target = "Delete";
  forged.hash = hashRecord(forged);              // self-consistent again
  lines[0] = JSON.stringify(forged);
  fs.writeFileSync(file, `${lines.join("\n")}\n`);

  const v = createLedger({ dir }).verify();
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.brokenAt, 2, "the FOLLOWING record is where the forgery shows");
  assert.match(v.reason, /prev hash/);
});

test("the chain continues across a day rotation", () => {
  const dir = freshDir();
  const clock = clockFrom("2026-09-05T23:59:00.000Z");
  const led = createLedger({ dir, now: clock.now });
  led.append("clicks.action.executed", { n: 1 });
  clock.advance(2 * 60 * 1000);                  // over midnight, new file
  led.append("clicks.action.executed", { n: 2 });

  const written = fs.readdirSync(dir).filter((f) => f.endsWith(".ndjson")).sort();
  assert.strictEqual(written.length, 2, "a new day opens a new file");
  const v = createLedger({ dir, now: clock.now }).verify();
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.count, 2, "the chain spans both files");
});

test("a fresh handle picks the chain up where the last one left it", () => {
  const dir = freshDir();
  createLedger({ dir }).append("clicks.action.executed", { n: 1 });
  const second = createLedger({ dir });          // e.g. after an app restart
  const rec = second.append("clicks.action.executed", { n: 2 });
  assert.strictEqual(rec.seq, 2, "head is derived from the log, not from memory");
  assert.strictEqual(second.verify().ok, true);
});

test("secret VALUES never reach the log, at any nesting depth", () => {
  const led = createLedger({ dir: freshDir() });
  led.append("clicks.action.executed", {
    password: "hunter2",
    otp: "482913",
    nested: { api_key: "sk-live-abc", note: "fine" },
    headers: { authorization: "Bearer abc.def" },
    target: "Sign in",
  });
  const raw = fs.readFileSync(path.join(led.dir, fs.readdirSync(led.dir)[0]), "utf8");
  for (const secret of ["hunter2", "482913", "sk-live-abc", "Bearer abc.def"]) {
    assert.ok(!raw.includes(secret), `${secret} must not be in the ledger file`);
  }
  const rec = led.read()[0];
  assert.strictEqual(rec.payload.password, "[redacted]");
  assert.strictEqual(rec.payload.nested.api_key, "[redacted]");
  assert.strictEqual(rec.payload.nested.note, "fine", "non-secrets survive");
  assert.strictEqual(rec.payload.target, "Sign in", "the step is still legible");
});

test("a custody action records the field but never the value", () => {
  const a = redactAction({ type: "fill", target: "One-time code", value: "119922", _custody: "otp" });
  assert.strictEqual(a.value, "[custody]");
  assert.strictEqual(a.target, "One-time code", "which field was filled is the evidence");
});

test("the redactor matches secret keys by shape, not by exact spelling", () => {
  assert.strictEqual(isRedactedKey("password"), true);
  assert.strictEqual(isRedactedKey("card_number"), true);
  assert.strictEqual(isRedactedKey("Authorization"), true);
  assert.strictEqual(isRedactedKey("user_password"), true);
  assert.strictEqual(isRedactedKey("token_expiry"), true);
  assert.strictEqual(isRedactedKey("passport_name"), false, "a fillable profile field is not a secret");
  assert.strictEqual(isRedactedKey("target"), false);
});

test("an oversized string is truncated and says so, rather than bloating the log", () => {
  const out = redact({ note: "x".repeat(2000) });
  assert.ok(out.note.length < 600);
  assert.match(out.note, /\[\+1488\]$/);
});

test("hashing does not depend on key order", () => {
  assert.strictEqual(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
});

test("a write that cannot happen returns null and reports, it does not throw", () => {
  // The ledger must never be the reason a step dies (R-0011: but it must also
  // never pretend it recorded something it did not).
  const base = freshDir();
  const blocked = path.join(base, "wall");
  fs.writeFileSync(blocked, "not a directory");
  const errs = [];
  const led = createLedger({ dir: path.join(blocked, "ledger"), onError: (e) => errs.push(e) });
  const rec = led.append("clicks.action.executed", {});
  assert.strictEqual(rec, null, "a failed write is reported as a failed write");
  assert.strictEqual(errs.length, 1, "and somebody is told");
});

test("pending tracks what Cortex has not acknowledged, and never drops it", () => {
  const led = createLedger({ dir: freshDir() });
  for (let i = 0; i < 5; i += 1) led.append("clicks.action.executed", { i });
  assert.strictEqual(led.pending().length, 5);
  led.markSynced(3);
  assert.strictEqual(led.pending().length, 2, "only the unacknowledged tail stays pending");
  led.markSynced(1);
  assert.strictEqual(led.lastSynced(), 3, "sync progress never goes backwards");
  assert.strictEqual(led.verify().ok, true, "marking synced does not touch the chain");
});

test("appendAction records the gate that allowed the step, not just the step", () => {
  const led = createLedger({ dir: freshDir() });
  led.appendAction("clicks.action.executed", {
    action: { type: "click", target: "Send" },
    disposition: "approve",
    mandateId: "m-7",
    app: "Outlook",
    ok: true,
    ms: 312,
  });
  const rec = led.read()[0];
  assert.strictEqual(rec.payload.mandate_id, "m-7");
  assert.strictEqual(rec.payload.disposition, "approve");
  assert.strictEqual(rec.payload.ok, true);
  assert.match(describeRecord(rec), /click "Send"/);
  assert.match(describeRecord(rec), /under mandate m-7/);
  assert.match(describeRecord(rec), /ok \(312ms\)/);
});

test("a failed step is recorded as failed, with the reason", () => {
  const led = createLedger({ dir: freshDir() });
  led.appendAction("clicks.action.executed", {
    action: { type: "click", target: "Send" },
    ok: false,
    error: "target not found",
  });
  assert.match(describeRecord(led.read()[0]), /FAILED: target not found/);
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
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
  console.log(`\nledger: ${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
