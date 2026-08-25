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

test("Word coworker phrases are act, not ask or code", () => {
  // Go only runs recipes on "act". "write a" is a CODE_CUE, so
  // "write a word document..." was classified as code and never wrote.
  // "write this in Word" matched neither list and defaulted to ask.
  assert.strictEqual(classifyIntent("write this in Word"), "act");
  assert.strictEqual(classifyIntent("write a word document that says Hello Pointer"), "act");
  assert.strictEqual(classifyIntent('write "Hello Pointer" into word'), "act");
  assert.strictEqual(classifyIntent("word: Hello Pointer"), "act");
  assert.strictEqual(classifyIntent("copy this into word"), "act");
  assert.strictEqual(classifyIntent("write hello in Word."), "act");
  assert.strictEqual(classifyIntent("add this to Word"), "act");
  assert.strictEqual(classifyIntent("write a python script to sort a list"), "code");
});

test("coding questions → code", () => {
  assert.strictEqual(classifyIntent("write a python script to sort a list"), "code");
  assert.strictEqual(classifyIntent("debug this traceback please"), "code");
});

test("empty → ask (safe default)", () => {
  assert.strictEqual(classifyIntent(""), "ask");
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
