"use strict";
/**
 * Cursor art encoding + pointer swap/restore contract.
 * No registry is touched — PowerShell is faked.
 * Run: node test/clicky-cursor.test.js
 */

const assert = require("assert");
const path = require("path");
const { encodeCur, drawFace, agentFrames, encodeAni, buildAll, SIZE } = require("../electron/netie/clicky/cur");
const { Pointer, MODES, KEY } = require("../electron/netie/clicky/pointer");

let pass = 0;
const fails = [];
const tests = [];
const test = (n, f) => tests.push({ name: n, fn: f });

const fakeFs = (present = []) => ({
  existsSync: (p) => present.some((x) => String(p).includes(x)),
  readFileSync: () => JSON.stringify({ Arrow: "C:\\old\\arrow.cur", AppStarting: "", Hand: "C:\\old\\hand.cur" }),
  writeFileSync() {},
  unlinkSync() {},
});

test("encodeCur emits a valid 32x32 CUR with hotspot", () => {
  const { canvas, hotspot } = drawFace("normal");
  const buf = encodeCur(canvas, hotspot);
  assert.strictEqual(buf.readUInt16LE(0), 0, "reserved");
  assert.strictEqual(buf.readUInt16LE(2), 2, "type 2 = cursor");
  assert.strictEqual(buf.readUInt16LE(4), 1, "one image");
  assert.strictEqual(buf[6], SIZE);
  assert.strictEqual(buf[7], SIZE);
  assert.deepStrictEqual([buf.readUInt16LE(10), buf.readUInt16LE(12)], hotspot);
  // BITMAPINFOHEADER: height is doubled for XOR + AND masks.
  const off = buf.readUInt32LE(18);
  assert.strictEqual(buf.readUInt32LE(off), 40, "header size");
  assert.strictEqual(buf.readInt32LE(off + 4), SIZE);
  assert.strictEqual(buf.readInt32LE(off + 8), SIZE * 2);
  assert.strictEqual(buf.readUInt16LE(off + 14), 32, "32bpp");
});

test("agent face is opaque in the middle and clear at the corners", () => {
  const { canvas } = drawFace("agent");
  const at = (x, y) => canvas.px[(y * SIZE + x) * 4 + 3];
  assert.ok(at(16, 16) > 200, "face centre is drawn");
  assert.strictEqual(at(0, 0), 0, "corner stays transparent");
  assert.strictEqual(at(31, 31), 0);
});

test("grin teeth are light against the dark mouth (regression)", () => {
  // First cut drew teeth in ink on an ink mouth, so they were invisible.
  const { canvas } = drawFace("agent");
  let light = 0;
  for (let y = 17; y < 24; y++) {
    for (let x = 10; x < 23; x++) {
      const i = (y * SIZE + x) * 4;
      if (canvas.px[i + 3] > 128 && canvas.px[i] > 180 && canvas.px[i + 1] > 180) light++;
    }
  }
  assert.ok(light >= 6, `expected visible teeth pixels, found ${light}`);
});

test("animation frames differ across the cycle", () => {
  const f = agentFrames();
  assert.strictEqual(f.length, 8);
  const diff = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
  };
  assert.ok(diff(f[0], f[2]) > 100, "quarter-cycle frames must differ");
  // 0 and 4 sit at sin(0) and sin(pi) — identical by design, not a bug.
  assert.strictEqual(diff(f[0], f[4]), 0);
});

test("encodeAni wraps frames in RIFF/ACON with matching counts", () => {
  const ani = encodeAni(agentFrames(), 8);
  assert.strictEqual(ani.toString("ascii", 0, 4), "RIFF");
  assert.strictEqual(ani.toString("ascii", 8, 12), "ACON");
  assert.strictEqual(ani.toString("ascii", 12, 16), "anih");
  assert.strictEqual(ani.readUInt32LE(20), 36, "anih cbSize");
  assert.strictEqual(ani.readUInt32LE(24), 8, "cFrames");
  assert.strictEqual(ani.readUInt32LE(28), 8, "cSteps");
  assert.strictEqual(ani.readUInt32LE(52), 0x01, "AF_ICON — frames are .cur");
  assert.ok(ani.includes(Buffer.from("fram", "ascii")));
});

test("buildAll produces the four shipped files", () => {
  const all = buildAll();
  assert.deepStrictEqual(Object.keys(all).sort(), [
    "netie-agent.ani", "netie-agent.cur", "netie-click.cur", "netie-normal.cur",
  ]);
});

test("pointer does nothing at all unless explicitly enabled", async () => {
  let called = false;
  const p = new Pointer({
    fsImpl: fakeFs(["netie-"]),
    execFileImpl: () => {
      called = true;
    },
  });
  const r = await p.set(MODES.AGENT);
  assert.deepStrictEqual(r, { ok: false, skipped: "disabled" });
  assert.strictEqual(called, false, "must not touch the registry when disabled");
});

test("set captures originals first, then writes the right slot", async () => {
  const scripts = [];
  const p = new Pointer({
    enabled: true,
    // Cursor files exist; the crash backup does NOT, so this exercises the
    // registry-capture path rather than crash recovery.
    fsImpl: { ...fakeFs([]), existsSync: (x) => /netie-(normal|click|agent)\./.test(String(x)) },
    execFileImpl: (_bin, args, _o, cb) => {
      const script = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");
      scripts.push(script);
      cb(null, JSON.stringify({ Arrow: "C:\\old\\arrow.cur", AppStarting: "", Hand: "" }));
    },
  });
  const r = await p.set(MODES.AGENT);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.slot, "AppStarting");
  assert.ok(r.file.endsWith("netie-agent.ani"), "agent uses the animated cursor");
  assert.ok(scripts[0].includes("Get-ItemProperty"), "captured before mutating");
  assert.ok(scripts[1].includes("Set-ItemProperty") && scripts[1].includes("AppStarting"));
  assert.ok(scripts[1].includes("SystemParametersInfo"), "must broadcast or nothing changes");
});

test("restore puts originals back and clears slots that had none", async () => {
  const scripts = [];
  const p = new Pointer({
    enabled: true,
    fsImpl: { ...fakeFs([]), existsSync: (x) => /netie-(normal|click|agent)\./.test(String(x)) },
    execFileImpl: (_b, args, _o, cb) => {
      scripts.push(Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le"));
      cb(null, JSON.stringify({ Arrow: "C:\\old\\arrow.cur", AppStarting: "", Hand: "" }));
    },
  });
  await p.set(MODES.AGENT);
  const r = await p.restore();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(p.applied, false);
  const last = scripts[scripts.length - 1];
  assert.ok(last.includes("C:\\old\\arrow.cur"), "original arrow restored verbatim");
  assert.ok(last.includes("Remove-ItemProperty"), "empty slots are removed, not set to ''");
  assert.ok(last.includes(KEY));
});

test("restore is safe when nothing was ever applied", async () => {
  const p = new Pointer({ enabled: true, fsImpl: fakeFs([]), execFileImpl: () => {
    throw new Error("should not run");
  } });
  assert.deepStrictEqual(await p.restore(), { ok: true, skipped: "nothing captured" });
});

test("a stale backup from a crashed run is reused, not overwritten", async () => {
  // Otherwise a crash mid-agent-run would capture the SMILEY as the original.
  const p = new Pointer({
    enabled: true,
    fsImpl: fakeFs(["netie-clicks-cursor-backup", "netie-"]),
    execFileImpl: () => {
      throw new Error("must not re-read the registry when a backup exists");
    },
  });
  const orig = await p.captureOriginal();
  assert.strictEqual(orig.Arrow, "C:\\old\\arrow.cur");
});

test("missing cursor file fails loudly instead of blanking the pointer", async () => {
  const p = new Pointer({ enabled: true, fsImpl: fakeFs([]), execFileImpl: () => {} });
  const r = await p.set(MODES.CLICK);
  assert.strictEqual(r.ok, false);
  assert.ok(/missing cursor/.test(r.error));
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass += 1;
      console.log("PASS " + name);
    } catch (err) {
      fails.push(name);
      console.log("FAIL " + name + " — " + err.message);
    }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
