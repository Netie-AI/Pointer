"use strict";
const assert = require("assert");
const { decide, reviewPlan } = require("../electron/netie/safety");
const { isAffirmation } = require("../electron/netie/affirm");
const { extractPythonBlocks } = require("../electron/netie/coderun");

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

test("autoRunSensible auto-clicks non-irreversible", () => {
  const d = decide({ type: "click", target: "Copy" }, { autoRunSensible: true });
  assert.strictEqual(d.disposition, "auto");
});

test("autoRunSensible still gates Buy", () => {
  const d = decide({ type: "click", target: "Buy now" }, { autoRunSensible: true });
  assert.strictEqual(d.disposition, "approve");
  assert.strictEqual(d.irreversible, true);
});

test("affirmation detects yes / 可以", () => {
  assert.ok(isAffirmation("yes go ahead"));
  assert.ok(isAffirmation("可以"));
  assert.ok(!isAffirmation("wait no"));
});

test("extract python fences", () => {
  const blocks = extractPythonBlocks("hi\n```python\nprint(1)\n```\n");
  assert.strictEqual(blocks[0], "print(1)");
});

test("reviewPlan autoOnly when all sensible", () => {
  const r = reviewPlan(
    [
      { type: "click", target: "OK" },
      { type: "scroll" },
    ],
    { autoRunSensible: true }
  );
  assert.strictEqual(r.needsApproval, false);
  assert.strictEqual(r.autoOnly, true);
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
