"use strict";
/**
 * Multi-monitor mapping: overlay-local → screen DIP → per-display crop px.
 * Run: node test/geometry.test.js
 */

const assert = require("assert");
const { overlayRegionToScreen, regionToDisplayCrop } = require("../electron/netie/geometry");

let pass = 0;
const fails = [];
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("overlayRegionToScreen offsets by the overlay display origin", () => {
  const r = overlayRegionToScreen(
    { x: 40, y: 60, width: 300, height: 200 },
    { x: 1920, y: 0, width: 2560, height: 1440 }
  );
  assert.deepStrictEqual(r, { x: 1960, y: 60, width: 300, height: 200 });
});

test("overlayRegionToScreen handles negative display origins (left monitor)", () => {
  const r = overlayRegionToScreen(
    { x: 100, y: 50, width: 200, height: 100 },
    { x: -1920, y: -200, width: 1920, height: 1080 }
  );
  assert.deepStrictEqual(r, { x: -1820, y: -150, width: 200, height: 100 });
});

test("overlayRegionToScreen coerces junk to zeros instead of NaN", () => {
  const r = overlayRegionToScreen({ x: "nope", y: 10, width: 50, height: 50 }, { x: 100, y: 0 });
  assert.deepStrictEqual(r, { x: 100, y: 10, width: 50, height: 50 });
});

test("regionToDisplayCrop maps DIP region into scaled display image px", () => {
  const crop = regionToDisplayCrop(
    { x: 2000, y: 100, width: 200, height: 100 },
    { bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, scaleFactor: 1.25 },
    { width: 3200, height: 1800 }
  );
  assert.deepStrictEqual(crop, { x: 100, y: 125, width: 250, height: 125 });
});

test("regionToDisplayCrop clamps a region hanging off the display edge", () => {
  const crop = regionToDisplayCrop(
    { x: -50, y: -20, width: 200, height: 100 }, // starts left/above display 0,0
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { width: 1920, height: 1080 }
  );
  assert.deepStrictEqual(crop, { x: 0, y: 0, width: 150, height: 80 });
});

test("regionToDisplayCrop clamps to the captured image size", () => {
  const crop = regionToDisplayCrop(
    { x: 1800, y: 1000, width: 400, height: 400 },
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { width: 1920, height: 1080 }
  );
  assert.deepStrictEqual(crop, { x: 1800, y: 1000, width: 120, height: 80 });
});

test("regionToDisplayCrop returns null when nothing overlaps", () => {
  const crop = regionToDisplayCrop(
    { x: 5000, y: 0, width: 100, height: 100 },
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { width: 1920, height: 1080 }
  );
  assert.strictEqual(crop, null);
  assert.strictEqual(regionToDisplayCrop(null, null), null);
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass += 1;
      console.log("PASS " + name);
    } catch (err) {
      fails.push(`${name} — ${err.message}`);
      console.log("FAIL " + name + " — " + err.stack);
    }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
