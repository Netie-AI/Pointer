"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  STATES,
  EVENTS,
  HOLD_MS,
  transition,
  RecallRing,
  MAX_RETENTION_MS,
} = require("../electron/netie/clicky");
const { modeForAction, MODES } = require("../electron/netie/clicky/pointer");

let pass = 0;
const fails = [];
function test(name, fn) {
  try {
    fn();
    pass += 1;
    console.log("PASS " + name);
  } catch (err) {
    fails.push(name);
    console.log("FAIL " + name + " — " + err.message);
  }
}

test("Clicky hold threshold and cancel", () => {
  const holding = transition(STATES.IDLE, EVENTS.HOLD_START);
  assert.strictEqual(transition(holding, EVENTS.HOLD_CANCEL, { heldMs: HOLD_MS - 1 }), STATES.IDLE);
  assert.strictEqual(transition(holding, EVENTS.HOLD_COMMIT, { heldMs: HOLD_MS - 1 }), STATES.IDLE);

  const committed = transition(
    transition(STATES.IDLE, EVENTS.HOLD_START),
    EVENTS.HOLD_COMMIT,
    { heldMs: HOLD_MS }
  );
  assert.strictEqual(committed, STATES.CLICKY);
});

test("Recall ring caps frames and drops expired entries", () => {
  let now = 60000;
  const ring = new RecallRing({ maxFrames: 60, windowMs: 60000, clock: () => now });
  for (let t = 0; t <= 60; t += 1) ring.push({ t: t * 1000, cx: t, cy: t });
  assert.strictEqual(ring.snapshot().length, 60);
  assert.strictEqual(ring.snapshot()[0].t, 1000);

  now = 122000;
  ring.push({ t: 122000, cx: 122, cy: 122 });
  assert.deepStrictEqual(ring.snapshot().map((frame) => frame.t), [122000]);
});

test("Recall summaries never expose JPEG base64", () => {
  const thumb = Buffer.from("a JPEG-sized secret payload");
  const ring = new RecallRing({ clock: () => 1000, windowMs: 60000 });
  ring.push({
    t: 1000,
    cx: 12,
    cy: 34,
    fgProc: "editor.exe",
    fgTitle: "Notes",
    thumbJpeg: thumb,
  });

  const summary = ring.summaryText();
  assert.ok(summary.includes("editor.exe"));
  assert.ok(summary.includes("cursor(12,34)"));
  assert.ok(!summary.includes(thumb.toString("base64")));
});

test("Recall eviction seals a dual-wrap record", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "netie-clicky-"));
  const calls = [];
  try {
    const ring = new RecallRing({
      maxFrames: 1,
      windowMs: 60000,
      clock: () => 2,
      dataDir,
      vault: {
        userKek: Buffer.alloc(32, 1),
        netieKek: Buffer.alloc(32, 2),
      },
      sealPixels: true,
      sealFn: (opts) => {
        calls.push(opts);
        return { id: opts.id, type: opts.type };
      },
    });

    ring.push({ t: 1, cx: 1, cy: 2, thumbJpeg: Buffer.from("jpeg") });
    ring.push({ t: 2, cx: 3, cy: 4 });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].type, "recall-frame");
    assert.ok(calls[0].payload.thumbJpegBase64);
    assert.ok(Buffer.isBuffer(calls[0].userKek));
    assert.ok(Buffer.isBuffer(calls[0].netieKek));
    assert.strictEqual(fs.readdirSync(path.join(dataDir, "recall")).length, 1);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

function sealedVaultRing(dataDir, opts = {}) {
  let now = opts.now ?? 120_000;
  const ring = new RecallRing({
    maxFrames: opts.maxFrames ?? 2,
    windowMs: opts.windowMs ?? 60_000,
    retentionMs: opts.retentionMs ?? 60_000,
    clock: () => now,
    dataDir,
    vault: {
      userKek: Buffer.alloc(32, 1),
      netieKek: Buffer.alloc(32, 2),
    },
    sealFn: (sealOpts) => ({ id: sealOpts.id, type: sealOpts.type }),
    ...opts.ring,
  });
  return {
    ring,
    setNow(value) {
      now = value;
    },
    getNow() {
      return now;
    },
    sealedNames() {
      return fs.readdirSync(path.join(dataDir, "recall")).filter((n) => n.endsWith(".enc.json")).sort();
    },
    plantSealed(t, n = 1) {
      const tail = String(n).replace(/\D/g, "").padStart(12, "0").slice(-12);
      const name = `recall-${t}-00000000-0000-0000-0000-${tail}.enc.json`;
      fs.writeFileSync(path.join(dataDir, "recall", name), JSON.stringify({ id: name, planted: true }), "utf8");
      return name;
    },
  };
}

test("Recall construct purges leftover sealed files older than retention", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "netie-clicky-"));
  try {
    fs.mkdirSync(path.join(dataDir, "recall"), { recursive: true });
    const oldName = `recall-1000-00000000-0000-0000-0000-000000000001.enc.json`;
    const freshName = `recall-100000-00000000-0000-0000-0000-000000000002.enc.json`;
    const foreign = "notes.txt";
    fs.writeFileSync(path.join(dataDir, "recall", oldName), "{}", "utf8");
    fs.writeFileSync(path.join(dataDir, "recall", freshName), "{}", "utf8");
    fs.writeFileSync(path.join(dataDir, "recall", foreign), "keep", "utf8");
    const { sealedNames } = sealedVaultRing(dataDir, { now: 120_000, retentionMs: 60_000 });
    const names = sealedNames();
    assert.ok(!names.includes(oldName), "expired leftover must be unlinked on construct");
    assert.ok(names.includes(freshName), "in-retention leftover must survive construct");
    assert.ok(fs.existsSync(path.join(dataDir, "recall", foreign)), "foreign names are not the sweep's to delete");
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("Recall time-eviction drops expired frames instead of sealing them", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "netie-clicky-"));
  try {
    const sealCalls = [];
    const { ring, setNow, sealedNames } = sealedVaultRing(dataDir, {
      now: 60_000,
      maxFrames: 60,
      windowMs: 60_000,
      retentionMs: 60_000,
      ring: {
        sealFn: (opts) => {
          sealCalls.push(opts);
          return { id: opts.id, type: opts.type };
        },
      },
    });
    ring.push({ t: 1_000, cx: 1, cy: 1, fgTitle: "Secret.docx" });
    assert.strictEqual(sealedNames().length, 0, "in-window frame stays in RAM, not on disk");
    setNow(122_000);
    ring.push({ t: 122_000, cx: 2, cy: 2 });
    assert.deepStrictEqual(ring.snapshot().map((f) => f.t), [122_000]);
    assert.strictEqual(
      sealedNames().length,
      0,
      "a frame that aged out of the ring must be dropped, not filed"
    );
    assert.strictEqual(
      sealCalls.length,
      0,
      "purge-after-write is not a drop; expired eviction must not call sealFn"
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("Recall sealed disk stays bounded across a long eviction run", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "netie-clicky-"));
  try {
    const { ring, setNow, getNow, sealedNames } = sealedVaultRing(dataDir, {
      now: 1_000,
      maxFrames: 5,
      windowMs: 60_000,
      retentionMs: 60_000,
    });
    for (let i = 0; i < 200; i += 1) {
      const t = getNow() + 1000;
      setNow(t);
      ring.push({ t, cx: i, cy: i, fgProc: "app.exe" });
    }
    const sealed = sealedNames();
    // Count-eviction may seal in-window frames, so disk can hold more than
    // maxFrames - but never the whole run, and never a file past retention.
    assert.ok(
      sealed.length < 200,
      `sealed count ${sealed.length} grew with the 200-frame run; purge is missing`
    );
    assert.ok(sealed.length <= 60, `sealed count ${sealed.length} exceeds the 60s/1Hz window`);
    for (const name of sealed) {
      const t = Number(name.split("-")[1]);
      assert.ok(t >= getNow() - 60_000, `${name} survived past retention`);
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("Recall purgeExpired removes aged sealed files after the clock moves", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "netie-clicky-"));
  try {
    const { ring, setNow, plantSealed, sealedNames } = sealedVaultRing(dataDir, {
      now: 80_000,
      maxFrames: 1,
      retentionMs: 60_000,
    });
    ring.push({ t: 80_000, cx: 1, cy: 1 });
    ring.push({ t: 80_001, cx: 2, cy: 2 });
    const afterEvict = sealedNames();
    assert.strictEqual(afterEvict.length, 1, "count-eviction still seals an in-window frame");
    const leftover = plantSealed(1_000, 3);
    setNow(200_000);
    const removed = ring.purgeExpired();
    const left = sealedNames();
    assert.ok(removed >= 2, "both the aged eviction and the planted leftover must go");
    assert.ok(!left.includes(leftover));
    assert.strictEqual(left.length, 0, "nothing older than retention may remain");
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("Recall retentionMs is fail-closed and capped", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "netie-clicky-"));
  try {
    const zero = new RecallRing({ dataDir, windowMs: 60_000, retentionMs: 0, clock: () => 1 });
    assert.strictEqual(zero.retentionMs, 60_000, "0 must not mean keep-forever or delete-everything");
    const huge = new RecallRing({ dataDir, windowMs: 60_000, retentionMs: 99 * 24 * 60 * 60 * 1000, clock: () => 1 });
    assert.strictEqual(huge.retentionMs, MAX_RETENTION_MS, "a century of retention is the unbounded dir again");
    const nan = new RecallRing({ dataDir, windowMs: 60_000, retentionMs: Number.NaN, clock: () => 1 });
    assert.strictEqual(nan.retentionMs, 60_000);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("Recall stopFlush seals in-window frames then purges expired leftovers", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "netie-clicky-"));
  try {
    const { ring, setNow, plantSealed, sealedNames } = sealedVaultRing(dataDir, {
      now: 90_000,
      maxFrames: 10,
      retentionMs: 60_000,
    });
    ring.push({ t: 90_000, cx: 1, cy: 1 });
    plantSealed(1_000, 9);
    const flushed = ring.stopFlush();
    assert.strictEqual(flushed, 1);
    const names = sealedNames();
    assert.ok(names.some((n) => n.startsWith("recall-90000-")), "quit still seals the live ring");
    assert.ok(!names.some((n) => n.startsWith("recall-1000-")), "quit must not keep expired leftovers");
    setNow(200_000);
    ring.purgeExpired();
    assert.strictEqual(sealedNames().length, 0, "the quit snapshot expires with the same TTL");
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("Pointer modeForAction maps click vs type faces", () => {
  assert.strictEqual(modeForAction("click"), MODES.CLICK);
  assert.strictEqual(modeForAction("doubleclick"), MODES.CLICK);
  assert.strictEqual(modeForAction("drag"), MODES.CLICK);
  assert.strictEqual(modeForAction("type"), MODES.AGENT);
  assert.strictEqual(modeForAction("fill"), MODES.AGENT);
  assert.strictEqual(modeForAction("hotkey"), MODES.AGENT);
  assert.strictEqual(modeForAction("unknown-xyz"), MODES.AGENT);
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);