"use strict";
const assert = require("assert");
const { classifyIntent } = require("../electron/netie/intent");

let pass = 0;
const fails = [];

function test(name, fn) {
  try {
    fn();
    pass += 1;
    console.log("PASS " + name);
  } catch (err) {
    fails.push(`${name} — ${err.message}`);
    console.log("FAIL " + name + " — " + err.message);
  }
}

test("questions → ask", () => {
  assert.strictEqual(classifyIntent("What is this dialog?"), "ask");
  assert.strictEqual(classifyIntent("explain this error"), "ask");
});

test("imperatives → act", () => {
  assert.strictEqual(classifyIntent("click Save"), "act");
  assert.strictEqual(classifyIntent("fill name with Ada"), "act");
  assert.strictEqual(classifyIntent("type hello in the box"), "act");
});

test("empty → ask (safe default)", () => {
  assert.strictEqual(classifyIntent(""), "ask");
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
