"use strict";
/**
 * The IPC bridge must be complete in both directions.
 *
 * Three files have to agree for a HUD button to work: `hud.js` invokes a
 * channel, `hud-preload.js` allowlists it, and `main.js` handles it. Nothing
 * checked that they agreed, and they did not: `hud:openPath` shipped with a
 * handler and a caller but no allowlist entry, so the status pill's Open button
 * was rejected with "blocked hud:openPath" on every click. The feature had a
 * green test suite, a rendered button, and no possible way to work.
 *
 * This is the root-cause-class check (KB R-0004): rather than one assertion for
 * that one channel, every channel the renderer can reach is cross-checked
 * against both the allowlist and the handler table. A silently blocked channel
 * is also R-0011 — the button looks identical whether it fired or was refused.
 *
 * Run: node test/invariants/ipc-bridge.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const hud = read("electron/hud.js");
const preload = read("electron/hud-preload.js");
const main = read("electron/main.js");

const uniq = (a) => [...new Set(a)];

/** Channels the renderer actually calls. */
const invoked = uniq([...hud.matchAll(/invoke\(\s*"([^"]+)"/g)].map((m) => m[1]));

/** The preload allowlist — parsed from the INVOKE array only, not the whole file. */
const invokeArray = preload.match(/const INVOKE = \[([\s\S]*?)\];/);
assert.ok(invokeArray, "hud-preload.js no longer declares an INVOKE allowlist");
const allowed = uniq([...invokeArray[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));

/** Channels main actually handles. */
const handled = uniq([...main.matchAll(/ipcMain\.handle\(\s*"([^"]+)"/g)].map((m) => m[1]));

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

check("the renderer invokes at least the channels we expect", () => {
  assert.ok(invoked.length > 20, `only found ${invoked.length} invoked channels — parser broken?`);
  assert.ok(allowed.length > 20, `only found ${allowed.length} allowlisted channels`);
  assert.ok(handled.length > 20, `only found ${handled.length} handlers`);
});

check("every channel the renderer invokes is allowlisted in the preload", () => {
  const blocked = invoked.filter((c) => !allowed.includes(c));
  assert.deepStrictEqual(
    blocked,
    [],
    `these renderer calls are rejected as "blocked <channel>" and the UI does nothing: ${blocked.join(", ")}`
  );
});

check("every channel the renderer invokes has a main-process handler", () => {
  const orphaned = invoked.filter((c) => !handled.includes(c));
  assert.deepStrictEqual(
    orphaned,
    [],
    `invoked with no ipcMain.handle — the promise never resolves: ${orphaned.join(", ")}`
  );
});

check("the allowlist does not widen the bridge beyond what main handles", () => {
  // An allowlisted channel with no handler is reachable surface for nothing —
  // it should be removed rather than left as a dangling entry.
  const dangling = allowed.filter((c) => !handled.includes(c));
  assert.deepStrictEqual(dangling, [], `allowlisted but unhandled: ${dangling.join(", ")}`);
});

check("hud:openPath specifically is reachable (the regression that started this)", () => {
  assert.ok(invoked.includes("hud:openPath"), "the status pill no longer opens anything");
  assert.ok(allowed.includes("hud:openPath"), "hud:openPath is blocked by the preload allowlist");
  assert.ok(handled.includes("hud:openPath"), "hud:openPath has no handler");
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nipc-bridge: all passed");
