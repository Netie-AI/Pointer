"use strict";
/**
 * App-name recognition + plan confirmation (#24, EPIC-P06).
 *
 * The acceptance has two halves and the second one is the one that was missing
 * entirely: an app Pointer cannot drive must be named and refused, not silently
 * turned into some other plan.
 */
const assert = require("assert");
const { recognizeApp, recognizeVerb, describeTarget } = require("../electron/netie/app-target");

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

check("the phrases recipes.js could never match are recognized", () => {
  // These are the exact examples the ticket calls out as matching nothing.
  assert.strictEqual(recognizeApp("Put this in Notes").id, "notepad");
  assert.strictEqual(recognizeApp("open it in Excel").id, "excel");
});

check("multi-word aliases beat their own substrings", () => {
  assert.strictEqual(recognizeApp("paste into microsoft word").id, "word");
  assert.strictEqual(recognizeApp("put it in power point").id, "powerpoint");
  assert.strictEqual(recognizeApp("type in visual studio code").id, "vscode");
});

check("a word boundary stops false positives", () => {
  assert.strictEqual(recognizeApp("that was an excellent point"), null);
  assert.strictEqual(recognizeApp("he replied in wordy prose"), null);
});

check("an explicit destination outranks an incidental mention", () => {
  const app = recognizeApp("copy the excel numbers into Word");
  assert.strictEqual(app.id, "word", "the destination is Word, not the topic Excel");
  assert.strictEqual(app.explicit, true);
});

check("a bare mention is recognized but marked non-explicit", () => {
  const app = recognizeApp("my word document is a mess");
  assert.strictEqual(app.id, "word");
  assert.strictEqual(app.explicit, false);
});

check("no app named means no confirmation invented", () => {
  const d = describeTarget("summarize what is on my screen");
  assert.strictEqual(d.recognized, false);
  assert.strictEqual(d.question, null);
  assert.strictEqual(d.refusal, null);
});

check("a drivable app gets a confirmation naming it", () => {
  const d = describeTarget("type this into Notepad");
  assert.strictEqual(d.recognized, true);
  assert.strictEqual(d.drivable, true);
  assert.ok(d.question.includes("Notepad"), `app not named: ${d.question}`);
  assert.match(d.question, /^Do you want to/);
});

check("the confirmation uses the verb the customer asked for", () => {
  assert.ok(describeTarget("paste this into Word").question.includes("paste into Word"));
  assert.ok(describeTarget("type this into Word").question.includes("type in Word"));
  assert.ok(describeTarget("open Word").question.includes("open Word"));
});

check("an undrivable app is NAMED and refused, never silently dropped", () => {
  const d = describeTarget("put this in Photoshop");
  assert.strictEqual(d.recognized, true);
  assert.strictEqual(d.drivable, false);
  assert.strictEqual(d.question, null, "must not offer to drive what it cannot drive");
  assert.ok(d.refusal.includes("Photoshop"), `refusal must name the app: ${d.refusal}`);
  assert.ok(/cannot drive/i.test(d.refusal));
});

check("recognition never claims a launch target for an undrivable app", () => {
  assert.strictEqual(recognizeApp("post this in Slack").launch, null);
  assert.strictEqual(recognizeApp("post this in Slack").drivable, false);
});

check("verbs are read independently of the app", () => {
  assert.strictEqual(recognizeVerb("paste it"), "paste");
  assert.strictEqual(recognizeVerb("launch the thing"), "open");
  assert.strictEqual(recognizeVerb("do something"), "default");
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\napp-target: all passed");
