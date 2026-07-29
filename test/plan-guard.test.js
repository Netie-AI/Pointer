"use strict";
/**
 * Plan guard: allowlist, launch confirmation, stale-coordinate stripping.
 * These are policy decisions — pin them.
 * Run: node test/plan-guard.test.js
 */

const assert = require("assert");
const { guardPlan, stripStaleCoords, isSupported, DRIVER_ACTIONS } = require("../electron/netie/plan-guard");
const { reviewPlan, decide } = require("../electron/netie/safety");

let pass = 0;
const fails = [];
const tests = [];
const test = (n, f) => tests.push({ name: n, fn: f });

const AUTO = { autoRunSensible: true, autoRunBenign: true };

test("allowlist matches what the driver actually implements", () => {
  const src = require("fs").readFileSync(require.resolve("../electron/netie/driver.js"), "utf8");
  for (const verb of DRIVER_ACTIONS) {
    assert.ok(
      new RegExp(`case\\s+"${verb}"`).test(src),
      `plan-guard allows "${verb}" but driver.js has no case for it`
    );
  }
});

test("unknown and hallucinated verbs are dropped with a reason", () => {
  const g = guardPlan([
    { type: "click", xPct: 10, yPct: 10 },
    { type: "screenshot" },        // classified READ by safety, but driver has no case
    { type: "summon_dragon" },
    { type: "" },
    {},
  ]);
  assert.strictEqual(g.actions.length, 1);
  assert.strictEqual(g.actions[0].type, "click");
  assert.deepStrictEqual(
    g.dropped.map((d) => d.type).sort(),
    ["(missing)", "(missing)", "screenshot", "summon_dragon"].sort()
  );
  assert.ok(/driver/i.test(g.dropped.find((d) => d.type === "summon_dragon").reason));
});

test("an unknown verb can no longer auto-run (the live hole)", () => {
  // Before: _parseActions had no whitelist and classifyAction defaulted unknown
  // verbs to CONSEQUENTIAL, which autoRunSensible promoted to "auto".
  assert.strictEqual(decide({ type: "summon_dragon" }, AUTO).disposition, "auto",
    "classifyAction still defaults unknown verbs to auto — guard must drop them first");
  const review = reviewPlan([{ type: "summon_dragon" }], AUTO);
  assert.strictEqual(review.actions.length, 0, "guard removed it before dispatch");
  assert.strictEqual(review.dropped.length, 1);
});

test("open/navigate always need a human beat, even with auto-run on", () => {
  for (const type of ["open", "navigate"]) {
    const review = reviewPlan([{ type, url: "winword" }], AUTO);
    assert.strictEqual(review.actions[0].safety.disposition, "approve", `${type} must not auto-run`);
    assert.strictEqual(review.needsApproval, true);
    assert.ok(/launches/i.test(review.actions[0]._confirmReason || ""));
  }
  // A plain click still auto-runs — we did not break the sensible path.
  assert.strictEqual(reviewPlan([{ type: "click", xPct: 5, yPct: 5 }], AUTO).actions[0].safety.disposition, "auto");
});

test("coords after an app switch are stripped so vision re-aims", () => {
  const { actions, stripped } = stripStaleCoords([
    { type: "click", xPct: 10, yPct: 20 },      // before launch — plan-time shot is still valid
    { type: "select_all" },
    { type: "copy" },
    { type: "open", url: "winword" },
    { type: "click", xPct: 50, yPct: 60, target: "Blank document" },
    { type: "paste", xPct: 30, yPct: 40 },
  ]);
  assert.deepStrictEqual({ x: actions[0].xPct, y: actions[0].yPct }, { x: 10, y: 20 }, "pre-launch coords kept");
  assert.strictEqual(actions[4].xPct, undefined, "post-launch click re-aims");
  assert.strictEqual(actions[4]._reaim, true);
  assert.strictEqual(actions[4].target, "Blank document", "target text is preserved for vision");
  assert.strictEqual(actions[5].xPct, undefined, "post-launch paste re-aims");
  assert.deepStrictEqual(stripped, ["click", "paste"]);
});

test("non-aimed actions keep their fields across a launch", () => {
  const { actions } = stripStaleCoords([
    { type: "open", url: "winword" },
    { type: "press", value: "ctrl+v" },
    { type: "wait", ms: 2000 },
  ]);
  assert.strictEqual(actions[1].value, "ctrl+v");
  assert.strictEqual(actions[2].ms, 2000);
});

test("terminal→Word plan survives the guard end to end", () => {
  const review = reviewPlan(
    [
      { type: "select_all" },
      { type: "copy" },
      { type: "open", url: "winword" },
      { type: "wait", ms: 4000 },
      { type: "click", xPct: 50, yPct: 50, target: "Blank document" },
      { type: "paste" },
    ],
    AUTO
  );
  assert.strictEqual(review.dropped.length, 0, "every verb is real");
  assert.strictEqual(review.actions.length, 6);
  assert.strictEqual(review.actions[2].safety.disposition, "approve", "launching Word asks first");
  assert.strictEqual(review.actions[4].xPct, undefined, "the Word click re-aims after launch");
  assert.deepStrictEqual(review.reaimed, ["click"]);
  assert.strictEqual(review.needsApproval, true);
});

test("secret and irreversible policy still wins over the guard", () => {
  const review = reviewPlan(
    [
      { type: "fill", target: "password", value: "hunter2" },
      { type: "click", target: "Confirm order" },
    ],
    AUTO
  );
  assert.strictEqual(review.actions[0].safety.disposition, "custody");
  assert.strictEqual(review.actions[1].safety.disposition, "approve");
  assert.strictEqual(review.actions[1].safety.irreversible, true);
});

test("empty plan is not reported as autoOnly", () => {
  // autoOnly used Array.every, which is vacuously true for [] — an empty plan
  // would have claimed every step was safe to run unattended.
  assert.strictEqual(reviewPlan([], AUTO).autoOnly, false);
  assert.strictEqual(reviewPlan([{ type: "click" }], AUTO).autoOnly, true);
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
