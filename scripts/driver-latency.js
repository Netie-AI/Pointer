"use strict";
/**
 * Measure the driver's stdio round trip, using READ-ONLY ops only.
 *
 * A timed keystroke sequence - the founder's piano restatement - can only be as
 * accurate as one op's round trip through the single PowerShell worker. Nothing
 * here actuates: `foreground()` and `listWindows()` query window state and send
 * no input, so this cannot type into whatever the founder has focused.
 */
const path = require("path");

const ROOT = "D:\\pointer-wt-integrate";
const { InputDriver } = require(path.join(ROOT, "electron", "netie", "driver.js"));

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    n: s.length,
    min: +s[0].toFixed(2),
    p50: +at(50).toFixed(2),
    p95: +at(95).toFixed(2),
    max: +s[s.length - 1].toFixed(2),
    mean: +mean.toFixed(2),
    jitter_p95_minus_min: +(at(95) - s[0]).toFixed(2),
  };
}

(async () => {
  const driver = new InputDriver({ dryRun: false });
  const out = {};

  try {
    // Warm the worker: the first call pays Add-Type compilation, which is not
    // representative of steady-state and would dominate a small sample.
    const t0 = process.hrtime.bigint();
    await driver.foreground();
    out.firstCallMs = +(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2);

    for (const [label, fn] of [
      ["foreground", () => driver.foreground()],
      ["listWindows", () => driver.listWindows()],
    ]) {
      const samples = [];
      for (let i = 0; i < 40; i += 1) {
        const t = process.hrtime.bigint();
        await fn();
        samples.push(Number(process.hrtime.bigint() - t) / 1e6);
      }
      out[label] = stats(samples);
    }

    // What a naive scheduler would achieve: ask for 60ms gaps and see what the
    // actual inter-op spacing is once the round trip is included.
    const target = 60;
    const marks = [];
    let last = process.hrtime.bigint();
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, target));
      await driver.foreground();
      const now = process.hrtime.bigint();
      marks.push(Number(now - last) / 1e6);
      last = now;
    }
    out.naive_sleep_then_op = { targetMs: target, ...stats(marks) };
  } catch (err) {
    out.error = String((err && err.stack) || err);
  } finally {
    try {
      driver.dispose();
    } catch {
      /* best effort */
    }
  }

  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})();
