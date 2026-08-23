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

// ---------------------------------------------------------- event types -----
// The other direction of the same class. A renderer branch for an event main
// never sends is UI that cannot appear: the status pill shipped with an element,
// CSS and a handler, and nothing drove it, so an Act run showed no progress.

/** Event types the renderer paints. */
const painted = uniq([...hud.matchAll(/event\.type === "([^"]+)"/g)].map((m) => m[1]));

/**
 * Event types main emits TO THE HUD. `sendStage` is a different window with a
 * different renderer (`stage.js`) — lumping the two together compares each
 * against the wrong consumer.
 */
const emitted = uniq([...main.matchAll(/sendHud(?:Quiet)?\(\{\s*type:\s*"([^"]+)"/g)].map((m) => m[1]));

/**
 * Types that reach the HUD through a helper rather than an object literal, so
 * the regex above cannot see them. Each needs a reason, or it is just an
 * exemption list that grows until the check means nothing.
 */
const INDIRECT = Object.freeze({
  point: "sent as sendHud(toOverlayEvent(...)) — point-overlay owns the TTL",
  "act-status": "accepted alias of `status`, so a future sender can use either name",
});

check("every event type the renderer paints is one main can actually send", () => {
  const dead = painted.filter((t) => !emitted.includes(t) && !(t in INDIRECT));
  assert.deepStrictEqual(
    dead,
    [],
    `renderer branches that can never fire — the UI cannot appear: ${dead.join(", ")}`
  );
});

check("every event main sends to the HUD is one the HUD paints", () => {
  const ignored = emitted.filter((t) => !painted.includes(t));
  assert.deepStrictEqual(ignored, [], `sent but silently dropped by the HUD: ${ignored.join(", ")}`);
});

check("the stage window ignores the floating-identity events on purpose", () => {
  // `sendStage` targets stage.js, not the HUD. It deliberately drops bubbles,
  // orb, mood and cursor-guide — DR-0002 / CLAUDE.md Hard rule 3: the pointer is
  // the identity, not a floating chat companion. This asserts that the drop is
  // still deliberate rather than something that rotted into a silent no-op.
  const stage = read("electron/stage.js");
  const stageSends = uniq(
    [...main.matchAll(/sendStage\(\{\s*type:\s*"([^"]+)"/g)].map((m) => m[1])
  );
  const stagePaints = uniq([...stage.matchAll(/ev\.type === "([^"]+)"/g)].map((m) => m[1]));
  for (const t of ["subtitle", "nod-wait"]) {
    assert.ok(stagePaints.includes(t), `stage.js stopped painting "${t}"`);
    assert.ok(stageSends.includes(t), `main stopped sending "${t}" to the stage`);
  }
  assert.ok(
    /intentionally ignored/i.test(stage),
    "the deliberate-drop comment is gone — the ignored events are now an accident, not a decision"
  );
});

check("the status pill is driven by a run, not only by a finished document", () => {
  // The regression this check exists for: the pill only ever appeared for
  // `word-docx`, so a plan executed with no visible progress at all.
  assert.ok(
    /sendHud\(\{\s*\n?\s*type: "status"/.test(main) || /type: "status"/.test(main),
    "nothing in main raises the status pill"
  );
  assert.ok(/type: "status", done: true/.test(main), "the pill is never taken back down");
  assert.ok(/hideStatusPill\(\)/.test(hud), "the renderer cannot dismiss the pill");
  // Real use: word-docx fired mid-run, then done hid Document ready / Open.
  // The comment already said we re-raise; this asserts the call sits AFTER done.
  const doneAt = main.indexOf('type: "status", done: true');
  const reraiseAt = main.lastIndexOf("sendWordDocxReady(lastWordDocx)");
  assert.ok(doneAt >= 0 && reraiseAt > doneAt, "word-docx is not re-raised after the run teardown");
  // The shipped recipe is word_from_clipboard. Dropping that verb from the
  // capture still leaves the after-done call, so this check would pass while
  // real use never re-raised Open.
  const captureStart = main.indexOf('enriched.type === "word_from_clipboard"');
  const captureEnd = main.indexOf("sendWordDocxReady(lastWordDocx)");
  assert.ok(captureStart >= 0 && captureEnd > captureStart, "lastWordDocx capture block missing");
  const capture = main.slice(captureStart, captureEnd);
  assert.ok(capture.includes("word_docx_write"), "lastWordDocx misses word_docx_write");
  assert.ok(capture.includes("word_docx_append"), "lastWordDocx misses word_docx_append");
  assert.ok(
    /!outcome\.dryRun/.test(capture),
    "dry-run still raises Document ready for a file that was not written"
  );
  // writeDocx refusals carry `reason`, not `error`. Reading only error made
  // every empty/contained-out write show as "failed: unknown" (R-0011).
  assert.ok(
    /outcome\.error \|\| outcome\.reason/.test(main),
    "executeApproved still swallows coworker reason as failed: unknown"
  );
  assert.ok(
    /sendHud\(\{\s*type: "insight",\s*text: message \}\)/.test(main),
    "a failed coworker step never reaches the HUD"
  );
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
