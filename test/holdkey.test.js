"use strict";
const assert = require("assert");
const { createHoldMonitor, DICTATE_HOLD_VKS, DICTATE_MAX_MS, canonicalizeHotkey, comboVks, normalizeDictateHotkeys } = require("../electron/netie/holdkey");
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
    assert.deepStrictEqual(comboVks("ctrl+alt+space"), [MOD_VK.ctrl, MOD_VK.alt, VK.space]);
    assert.strictEqual(canonicalizeHotkey("ctrl+alt+space"), "Control+Alt+Space");
    const ok = normalizeDictateHotkeys({
      recordingHotkey: "Ctrl+Alt+Space",
      modeHotkey: "ctrl+alt+m",
      languageHotkey: "Control+Alt+L",
    });
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(ok.recordingHotkey, "Control+Alt+Space");
    const clash = normalizeDictateHotkeys({
      recordingHotkey: "Control+Alt+M",
      modeHotkey: "Control+Alt+M",
      languageHotkey: "Control+Alt+L",
    });
    assert.strictEqual(clash.ok, false);
    const reserved = normalizeDictateHotkeys({
      recordingHotkey: "Control+Enter",
      modeHotkey: "Control+Alt+M",
      languageHotkey: "Control+Alt+L",
    });
    assert.strictEqual(reserved.ok, false);
    const bare = normalizeDictateHotkeys({
      recordingHotkey: "M",
      modeHotkey: "Control+Alt+M",
      languageHotkey: "Control+Alt+L",
    });
    assert.strictEqual(bare.ok, false);
    const fs = require("fs");
    const path = require("path");
    const html = fs.readFileSync(path.join(__dirname, "../electron/hud.html"), "utf8");
    assert.ok(html.includes('id="set-recording-hotkey"'));
    assert.ok(html.includes('id="set-mode-hotkey"'));
    assert.ok(html.includes('id="set-language-hotkey"'));
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

  await test("hold monitor auto-stops at the 120s session cap", async () => {
    assert.strictEqual(DICTATE_MAX_MS, 120000);
    let tick = null;
    let cap = null;
    let released = [];
    const mon = createHoldMonitor({
      intervalMs: 1,
      maxMs: 50,
      setInterval: (fn) => {
        tick = fn;
        return 9;
      },
      clearInterval: () => {
        tick = null;
      },
      setTimeout: (fn) => {
        cap = fn;
        return 10;
      },
      clearTimeout: () => {
        cap = null;
      },
      poll: () => ({ ok: true, down: false, dryRun: true }),
      onRelease: (sample) => {
        released.push(sample);
      },
    });
    const started = mon.start();
    assert.strictEqual(started.ok, true);
    assert.strictEqual(started.maxMs, 50);
    assert.strictEqual(mon.armed, true);
    await tick();
    await Promise.resolve();
    assert.strictEqual(released.length, 0);
    cap();
    assert.strictEqual(released.length, 1);
    assert.strictEqual(released[0].reason, "max");
    assert.strictEqual(released[0].maxMs, 50);
    assert.strictEqual(mon.armed, false);
    const fs = require("fs");
    const path = require("path");
    const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
    assert.match(main, /DICTATE_MAX_MS/);
    assert.match(main, /120s session cap/);
    const hudLive = fs.readFileSync(path.join(__dirname, "..", "electron", "netie", "hud-live.js"), "utf8");
    assert.match(hudLive, /maxMs = 120000/);
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
