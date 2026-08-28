"use strict";
/**
 * Approval disclosure corpus (#20). The gate under test is: can a customer read
 * the prompt and know what is about to happen and where it lands.
 */
const assert = require("assert");
const { describeAction, describePlan, approvalPrompt } = require("../electron/netie/plan-describe");
const { reviewPlan } = require("../electron/netie/safety");

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

check("a write names its destination", () => {
  const d = describeAction({ type: "word_docx_write", path: "C:\\Users\\x\\Documents\\NetiePointer\\a.docx" });
  assert.ok(d.text.includes("a.docx"), `destination missing from: ${d.text}`);
  assert.ok(d.destination.includes("a.docx"));
});

check("a write with no destination does not invent one", () => {
  const d = describeAction({ type: "word_docx_write", value: "hello" });
  assert.strictEqual(d.destination, "");
  assert.ok(!d.text.includes("C:\\"), "must not fabricate a path");
  assert.ok(/documents folder/i.test(d.text));
});

check("a click names the control", () => {
  const d = describeAction({ type: "click", targetText: "Send" });
  assert.ok(d.text.includes("Send"));
});

check("uia_wait names the control", () => {
  const d = describeAction({ type: "uia_wait", target: "Save" });
  assert.ok(d.text.includes("Save"));
  assert.ok(/wait for/i.test(d.text));
});

check("a secret value is never echoed", () => {
  const d = describeAction({
    type: "type",
    field: "password",
    value: "hunter2",
    safety: { secret: true },
  });
  assert.ok(!d.text.includes("hunter2"), "the secret value leaked into the prompt");
  assert.ok(d.text.includes("password"), "the field should still be disclosed");
});

check("a launch reuses the guard's reason", () => {
  const d = describeAction({ type: "open", target: "winword", _confirmReason: "Launches winword" });
  assert.ok(d.text.includes("winword"));
});

check("an unknown verb says it is unrecognized rather than hiding in a count", () => {
  const d = describeAction({ type: "frobnicate" });
  assert.ok(/unrecognized/i.test(d.text));
});

check("irreversible steps are flagged in the plan lines", () => {
  const reviewed = reviewPlan(
    [{ type: "click", targetText: "Delete account" }],
    { autoRunSensible: true }
  );
  const d = describePlan(reviewed.actions);
  assert.strictEqual(d.hasIrreversible, true);
  assert.ok(d.lines[0].includes("[irreversible]"));
  assert.ok(/irreversible/.test(d.summary));
});

check("the prompt names the verb and the destination, not a step count", () => {
  const reviewed = reviewPlan(
    [
      { type: "open", target: "winword" },
      { type: "word_docx_write", path: "C:\\out\\report.docx", value: "hi" },
    ],
    { autoRunSensible: true }
  );
  const p = approvalPrompt(reviewed.actions);
  assert.ok(!/^\d+ step\(s\)/.test(p.prompt), "still leading with a bare count");
  assert.ok(p.prompt.includes("report.docx"), `destination missing: ${p.prompt}`);
  assert.ok(/launch/i.test(p.prompt) || /launch/i.test(p.detail), "verb missing");
  assert.ok(p.detail.split("\n").length >= 2, "per-action detail missing");
});

check("every action in the plan gets a line", () => {
  const actions = Array.from({ length: 5 }, () => ({ type: "click", targetText: "OK" }));
  const d = describePlan(actions);
  assert.strictEqual(d.steps.length, 5);
  assert.strictEqual(d.lines.length, 5);
});

check("long plans are truncated but say so", () => {
  const actions = Array.from({ length: 20 }, () => ({ type: "click", targetText: "OK" }));
  const d = describePlan(actions, { max: 3 });
  assert.strictEqual(d.lines.length, 4);
  assert.ok(/17 more/.test(d.lines[3]));
});

check("an empty plan does not claim work", () => {
  assert.strictEqual(describePlan([]).summary, "Nothing to do");
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nplan-describe: all passed");
