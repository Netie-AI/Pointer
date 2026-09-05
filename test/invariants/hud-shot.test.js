"use strict";
/**
 * The HUD screenshot harness must never buy its picture by lowering the glass.
 *
 * `scripts/hud-shot.js` exists because content protection - correctly - hides
 * the HUD from every OS-level capture, which also hides it from the people
 * building it. The whole value of the harness is that it works anyway: a CDP
 * capture renders off the compositor, which the DWM affinity flag never
 * reaches, so the shipped window stays exactly as protected during a shot as
 * it is in front of a customer.
 *
 * That is a claim about a default, and defaults rot quietly. The obvious "fix"
 * for a shot that ever comes back wrong is to set NETIE_CAPTURE_VISIBLE=1, or
 * to flip `captureVisible`, or to wire a capture flag into the launcher so the
 * shipped app starts visible to every screen share on the machine. Each one
 * turns a debug affordance into a product regression, and each one would leave
 * this suite green without this file.
 *
 * So this gate reads the harness as text and refuses those three moves. The
 * artifact half - that a real PNG comes out, off a still-protected window -
 * needs an Electron boot and lives in `test/smoke/hud-shot.smoke.js`.
 *
 * Run: node test/invariants/hud-shot.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const harness = read("scripts/hud-shot.js");
const launcher = read("scripts/netie-launch.ps1");
const settings = read("electron/netie/settings.js");
const pkg = JSON.parse(read("package.json"));

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

/**
 * Comments are allowed to name the thing they promise not to do - and this
 * harness's header does, at length. Strip them before grepping for an
 * assignment, or the gate reads its own explanation as a violation.
 */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const harnessCode = code(harness);

check("the harness never turns capture visibility on for itself", () => {
  assert.ok(
    !/NETIE_CAPTURE_VISIBLE\s*[:=]\s*["'`]?1/.test(harnessCode),
    "hud-shot.js sets NETIE_CAPTURE_VISIBLE=1 - the shot would no longer prove " +
      "the HUD can be captured while protected, only that protection was off"
  );
});

check("the harness never writes captureVisible", () => {
  // Reading it to report the state is the point; assigning it is the escape.
  assert.ok(
    !/captureVisible\s*[:=]\s*(true|1)\b/.test(harnessCode),
    "hud-shot.js assigns captureVisible - a debug tool must not edit a shipped default"
  );
});

check("captureVisible still ships off", () => {
  // If the default itself flips, the harness's claim is vacuous: every window
  // would be capturable and nothing would be proven by capturing one.
  assert.ok(
    /captureVisible:\s*false/.test(settings),
    "settings.js no longer defaults captureVisible to false"
  );
});

check("the launcher does not start Pointer visible to screen capture", () => {
  // The launcher is the founder's own path into the running app. A capture flag
  // wired in here is not a debug affordance, it is a shipped behaviour change:
  // every Teams share from that session would carry the HUD.
  assert.ok(
    !/NETIE_CAPTURE_VISIBLE/.test(launcher),
    "netie-launch.ps1 sets NETIE_CAPTURE_VISIBLE - that changes the running app, " +
      "not the debug harness. Screenshot debugging goes through scripts/hud-shot.js"
  );
});

check("the harness is reachable as an npm script", () => {
  // An unwired tool is a tool nobody finds. This is the difference between a
  // supported way to see the HUD and a file that happens to exist.
  assert.ok(pkg.scripts && pkg.scripts.shots, "package.json has no `shots` script");
  assert.ok(
    /scripts\/hud-shot\.js/.test(pkg.scripts.shots),
    `npm run shots does not call the harness - got ${pkg.scripts.shots}`
  );
});

check("every scene drives the HUD through a control, not a class", () => {
  // A scene that sets `.open` by hand photographs a panel whose button may be
  // dead. Scenes that click are the reason a shot is evidence.
  const scenes = harness.slice(harness.indexOf("const SCENES"), harness.indexOf("function parseArgs"));
  assert.ok(scenes.length > 0, "SCENES block not found");
  for (const opener of ["btn-more", "btn-roulette", "bugReportBtn"]) {
    assert.ok(
      new RegExp(`getElementById\\("${opener}"\\)\\.click\\(\\)`).test(scenes),
      `the scene for #${opener} no longer clicks it`
    );
  }
});

check("the harness reports the protection state it ran under", () => {
  assert.ok(
    /contentProtection/.test(harnessCode),
    "hud-shot.js no longer records contentProtection - the manifest is what makes " +
      "the no-weakening claim checkable instead of asserted"
  );
  assert.ok(
    /manifest\.json/.test(harnessCode),
    "hud-shot.js no longer writes manifest.json"
  );
});

console.log(`\nhud-shot invariants: ${failures === 0 ? "all passed" : failures + " failed"}`);
process.exit(failures === 0 ? 0 : 1);
