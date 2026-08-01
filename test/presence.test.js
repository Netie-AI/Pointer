"use strict";
const assert = require("assert");
const { STATES, EVENTS, transition, describe } = require("../electron/netie/presence");

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

test("idle can begin thinking", () => {
  assert.strictEqual(transition(STATES.IDLE, EVENTS.THINK), STATES.THINKING);
});

test("thinking can begin work", () => {
  assert.strictEqual(transition(STATES.THINKING, EVENTS.START), STATES.WORKING);
});

test("working can wait for nod and resume", () => {
  const waiting = transition(STATES.WORKING, EVENTS.WAIT);
  assert.strictEqual(waiting, STATES.WAITING_NOD);
  assert.strictEqual(transition(waiting, EVENTS.NOD), STATES.WORKING);
});

test("work completes then times out to idle", () => {
  const done = transition(STATES.WORKING, EVENTS.COMPLETE);
  assert.strictEqual(done, STATES.DONE);
  assert.strictEqual(transition(done, EVENTS.TIMEOUT), STATES.IDLE);
});

test("failure enters error and reset recovers", () => {
  assert.strictEqual(transition(STATES.WORKING, EVENTS.FAIL), STATES.ERROR);
  assert.strictEqual(transition(STATES.ERROR, EVENTS.RESET), STATES.IDLE);
});

test("unknown events preserve state", () => {
  assert.strictEqual(transition(STATES.WORKING, "mystery"), STATES.WORKING);
});

test("thinking and working enable wild effects", () => {
  for (const state of [STATES.THINKING, STATES.WORKING]) {
    const view = describe(state);
    assert.strictEqual(view.crazy, true);
    assert.strictEqual(view.matrix, true);
    assert.strictEqual(view.mood, "crazy_smile");
  }
});

test("waiting is soft and done smiles", () => {
  assert.strictEqual(describe(STATES.WAITING_NOD).mood, "soft_smile");
  assert.strictEqual(describe(STATES.WAITING_NOD).crazy, false);
  assert.strictEqual(describe(STATES.DONE).mood, "smile");
});

test("descriptions are defensive copies", () => {
  const view = describe(STATES.IDLE);
  view.label = "changed";
  assert.strictEqual(describe(STATES.IDLE).label, "Ready");
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
