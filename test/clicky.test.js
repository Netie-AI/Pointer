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