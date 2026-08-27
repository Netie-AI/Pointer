"use strict";
const assert = require("assert");
const { createHoldMonitor, DICTATE_HOLD_VKS } = require("../electron/netie/holdkey");
const { InputDriver, MOD_VK, VK } = require("../electron/netie/driver");

let pass = 0;
const fails = [];
function test(name, fn) {
  const run = Promise.resolve().then(fn);
  return run
    .then(() => {
      pass += 1;
      console.log("PASS " + name);
    })
    .catch((err) => {
      fails.push(name);
      console.log("FAIL " + name + " -- " + err.message);
    });
}

(async () => {
  await test("dictate hold combo is Ctrl+Alt+Space", () => {
    assert.deepStrictEqual(DICTATE_HOLD_VKS.slice(), [MOD_VK.ctrl, MOD_VK.alt, VK.space]);
  });

  await test("hold monitor ignores dry-run so Linux stays toggle", async () => {
    let tick = null;
    let released = 0;
    const mon = createHoldMonitor({
      intervalMs: 1,
      setInterval: (fn) => {
        tick = fn;
        return 7;
      },
      clearInterval: () => {
        tick = null;
      },
      poll: () => ({ ok: true, down: false, dryRun: true }),
      onRelease: () => {
        released += 1;
      },
    });
    assert.strictEqual(mon.start().ok, true);
    await tick();
    await Promise.resolve();
    assert.strictEqual(released, 0);
    assert.strictEqual(mon.armed, true);
    mon.stop();
  });

  await test("hold monitor stops after seeing down then up", async () => {
    const samples = [{ down: true }, { down: true }, { down: false }];
    let i = 0;
    let tick = null;
    let released = 0;
    const mon = createHoldMonitor({
      intervalMs: 1,
      setInterval: (fn) => {
        tick = fn;
        return 8;
      },
      clearInterval: () => {
        tick = null;
      },
      poll: () => samples[Math.min(i, samples.length - 1)],
      onRelease: () => {
        released += 1;
      },
    });
    mon.start();
    await tick();
    i = 1;
    await Promise.resolve();
    await tick();
    i = 2;
    await Promise.resolve();
    await tick();
    await Promise.resolve();
    assert.strictEqual(released, 1);
    assert.strictEqual(mon.armed, false);
  });

  await test("keysHeld dry-run never claims a physical hold", async () => {
    const d = new InputDriver({ dryRun: true });
    const r = await d.keysHeld(DICTATE_HOLD_VKS);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.down, false);
    assert.strictEqual(r.dryRun, true);
  });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
