"use strict";
/**
 * The screenshot harness produces a real picture of the real HUD.
 *
 * `test/invariants/hud-shot.test.js` reads the harness as text and proves it
 * does not cheat. This is the other half, and the half that matters under
 * R-0001: it runs the thing the developer actually runs, and asserts the
 * artifact they actually receive.
 *
 * The failure this exists to catch is not "the file is missing". It is the
 * quieter one: the capture succeeds, the PNG is well-formed, and the frame is
 * blank - which is exactly what would happen if content protection ever did
 * reach the compositor, or if a scene stopped painting. A test that asserts
 * `fs.existsSync` certifies that failure as a pass.
 *
 * So this asserts four things about the output: it is a PNG, it is the size of
 * a real display rather than a default 800x600 window, it carries enough
 * compressed bytes to be a painted frame rather than an empty one, and the
 * manifest says the window was still protected while it was taken.
 *
 * Needs a desktop session; will not work headless. Costs one Electron boot.
 *
 * Run: npm run test:shots
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(os.tmpdir(), `netie-shot-smoke-${process.pid}`);

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

/** Two scenes, one theme: enough to prove the loop, cheap enough to run often. */
console.log("booting Electron for two shots - this takes a minute on a loaded machine");
let ran = null;
try {
  execFileSync(
    process.execPath,
    [path.join(ROOT, "scripts", "hud-shot.js"), "--scene=rest,menu", "--theme=dark", `--out=${OUT}`],
    { cwd: ROOT, stdio: "inherit", timeout: 8 * 60 * 1000 }
  );
  ran = { ok: true };
} catch (err) {
  ran = { ok: false, error: (err && err.message) || String(err) };
}

check("the harness exits clean", () => {
  assert.ok(ran.ok, `hud-shot.js failed: ${ran.error}`);
});

const manifestPath = path.join(OUT, "manifest.json");
let manifest = null;

check("it writes a manifest", () => {
  assert.ok(fs.existsSync(manifestPath), `no manifest at ${manifestPath}`);
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.deepStrictEqual(manifest.failed, [], `scenes failed: ${manifest.failed}`);
  assert.strictEqual(manifest.shots.length, 2, `expected 2 shots, got ${manifest.shots.length}`);
});

check("the shots were taken off a still-protected window", () => {
  // This is the harness's whole claim. If it ever reads false, the run captured
  // a HUD that any screen share could also see, and proved nothing about
  // capturing a protected one - so say so loudly rather than pass.
  assert.ok(manifest, "no manifest to read");
  assert.strictEqual(
    manifest.contentProtection,
    true,
    "content protection was OFF during capture " +
      `(${JSON.stringify(manifest.protectionFrom)}) - this run does not demonstrate ` +
      "that a protected HUD can be screenshotted"
  );
});

check("no renderer exceptions while the scenes ran", () => {
  assert.ok(manifest, "no manifest to read");
  assert.deepStrictEqual(
    manifest.rendererErrors,
    [],
    `renderer threw during capture: ${manifest.rendererErrors.join(" | ")}`
  );
});

check("each shot is a PNG the size of a real display", () => {
  assert.ok(manifest, "no manifest to read");
  for (const shot of manifest.shots) {
    const file = path.join(OUT, shot.file);
    const head = fs.readFileSync(file).subarray(0, 8);
    assert.strictEqual(
      head.toString("hex"),
      "89504e470d0a1a0a",
      `${shot.file} is not a PNG`
    );
    // A window captured before it was sized comes back 800x600 and looks fine
    // in a listing. The HUD is created at display bounds, so anything that
    // small means the shot beat the layout.
    assert.ok(
      shot.width >= 1024 && shot.height >= 600,
      `${shot.file} is ${shot.width}x${shot.height} - too small to be the HUD display`
    );
  }
});

check("the frames are painted, not blank", () => {
  assert.ok(manifest, "no manifest to read");
  // PNG compresses flat colour almost to nothing: a fully transparent or solid
  // 1920x1080 frame lands in the low tens of KB. Real chrome, glass and text
  // land in the hundreds. 64 KB sits well clear of both.
  for (const shot of manifest.shots) {
    assert.ok(
      shot.bytes > 64 * 1024,
      `${shot.file} is only ${(shot.bytes / 1024).toFixed(0)} KB at ${shot.width}x${shot.height} - ` +
        "that is an empty frame, not a HUD"
    );
  }
});

check("two different scenes produced two different pictures", () => {
  // The cheapest way for this suite to go green while being useless is for
  // every scene to photograph the same resting HUD - a broken `drive`, a
  // reset that runs too late, a click that no longer opens anything.
  assert.ok(manifest, "no manifest to read");
  const [a, b] = manifest.shots.map((s) => fs.readFileSync(path.join(OUT, s.file)));
  assert.ok(!a.equals(b), "the two scenes produced byte-identical images - the scene never applied");
});

try {
  fs.rmSync(OUT, { recursive: true, force: true });
} catch {
  /* leave it; a temp dir is not worth failing a run over */
}

console.log(`\nhud-shot smoke: ${failures === 0 ? "all passed" : failures + " failed"}`);
process.exit(failures === 0 ? 0 : 1);
