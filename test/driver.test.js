"use strict";
/**
 * Driver v2 — persistent worker protocol, key combos, wheel scroll,
 * click-to-focus typing, DIP→physical conversion. All against a fake
 * PowerShell worker (no OS calls).
 * Run: node test/driver.test.js
 */

const assert = require("assert");
const { EventEmitter } = require("events");
const { PassThrough } = require("stream");
const { InputDriver, VK, MOD_VK, parseKeyCombo, vkOf } = require("../electron/netie/driver");

let pass = 0;
const fails = [];
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

/**
 * Fake powershell worker: answers the JSON-lines protocol in-process.
 * handler(msg) → extra fields for the ok:true reply (or {__error} to fail the op).
 */
function fakeSpawn(handler, state = {}) {
  state.spawned = 0;
  state.ops = [];
  const impl = () => {
    state.spawned += 1;
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => child.emit("exit", 0);
    child.stdin.on("data", (chunk) => {
      for (const line of String(chunk).split("\n")) {
        if (!line.trim()) continue;
        const m = JSON.parse(line);
        if (m.op === "exit") return;
        state.ops.push(m);
        const extra = handler ? handler(m) : null;
        if (extra && extra.__error) {
          child.stdout.write(`${JSON.stringify({ id: m.id, ok: false, error: extra.__error })}\n`);
        } else {
          child.stdout.write(`${JSON.stringify({ id: m.id, ok: true, ...(extra || {}) })}\n`);
        }
      }
    });
    setImmediate(() => child.stdout.write('{"ready":true}\n'));
    return child;
  };
  return impl;
}

test("parseKeyCombo: plain keys, combos, rejects unknown", () => {
  assert.deepStrictEqual(parseKeyCombo("enter"), { mods: [], vk: VK.enter, key: "enter" });
  assert.deepStrictEqual(parseKeyCombo("s"), { mods: [], vk: 0x53, key: "s" });
  assert.deepStrictEqual(parseKeyCombo("ctrl+s"), { mods: [MOD_VK.ctrl], vk: 0x53, key: "s" });
  assert.deepStrictEqual(parseKeyCombo("Ctrl+Shift+P"), {
    mods: [MOD_VK.ctrl, MOD_VK.shift],
    vk: 0x50,
    key: "p",
  });
  assert.strictEqual(parseKeyCombo("bogus"), null);
  assert.strictEqual(parseKeyCombo("ctrl+bogus"), null);
  assert.strictEqual(parseKeyCombo("wat+s"), null);
  assert.strictEqual(vkOf("f5"), 0x74);
  assert.strictEqual(vkOf("7"), 0x37);
});

test("dry-run keeps v1 contract: xPct math, type without coords, missing coords fail", async () => {
  const d = new InputDriver({ dryRun: true });
  const click = await d.perform(
    { type: "click", xPct: 50, yPct: 50 },
    { region: { x: 100, y: 200, width: 400, height: 300 } }
  );
  assert.strictEqual(click.ok, true);
  assert.strictEqual(Math.round(click.x), 300);
  assert.strictEqual(Math.round(click.y), 350);

  const typed = await d.perform({ type: "type", value: "hello" });
  assert.strictEqual(typed.ok, true);
  assert.strictEqual(typed.typed, 5);
  assert.strictEqual(typed.focused, false);

  const miss = await d.perform(
    { type: "click", target: "Save" },
    { region: { x: 0, y: 0, width: 0, height: 0 } }
  );
  assert.strictEqual(miss.ok, false);
  assert.deepStrictEqual(await d.listWindows(), []);
});

test("one persistent worker serves many ops; coords go through toPhysical", async () => {
  const state = {};
  const d = new InputDriver({
    spawnImpl: fakeSpawn(null, state),
    toPhysical: (pt) => ({ x: pt.x * 2, y: pt.y * 2 }), // fake 200% display
  });
  await d.clickAt(10, 20);
  await d.moveTo(5, 5);
  await d.typeText("héllo");
  await d.press("ctrl+s");
  await d.scroll(-240, { x: 50, y: 60 });

  assert.strictEqual(state.spawned, 1, "worker must be reused across ops");
  const [click, move, type, combo, wheel] = state.ops;
  assert.deepStrictEqual(
    { op: click.op, x: click.x, y: click.y, right: click.right },
    { op: "click", x: 20, y: 40, right: false }
  );
  assert.deepStrictEqual({ op: move.op, x: move.x, y: move.y }, { op: "move", x: 10, y: 10 });
  assert.strictEqual(type.op, "type");
  assert.strictEqual(Buffer.from(type.b64, "base64").toString("utf8"), "héllo");
  assert.deepStrictEqual(
    { op: combo.op, mods: combo.mods, vk: combo.vk },
    { op: "combo", mods: [MOD_VK.ctrl], vk: 0x53 }
  );
  assert.deepStrictEqual(
    { op: wheel.op, delta: wheel.delta, move: wheel.move, x: wheel.x, y: wheel.y },
    { op: "wheel", delta: -240, move: true, x: 100, y: 120 }
  );
  d.dispose();
});

test("type with coords clicks the field first (focus), then types", async () => {
  const state = {};
  const d = new InputDriver({ spawnImpl: fakeSpawn(null, state) });
  const out = await d.perform(
    { type: "fill", target: "Name", value: "Ada", xPct: 25, yPct: 50 },
    { region: { x: 0, y: 0, width: 400, height: 200 } }
  );
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.focused, true);
  assert.strictEqual(out.typed, 3);
  // Animated travel queries cursor pos, eases with move, then clicks the field.
  const click = state.ops.find((o) => o.op === "click");
  const type = state.ops.find((o) => o.op === "type");
  assert.ok(state.ops.some((o) => o.op === "pos" || o.op === "move"), "travels before click");
  assert.ok(click, "clicks field to focus");
  assert.strictEqual(click.x, 100);
  assert.ok(type, "types after focus");
  assert.ok(state.ops.indexOf(click) < state.ops.indexOf(type), "click before type");
  d.dispose();
});

test("listWindows maps screen rects from the worker", async () => {
  const state = {};
  const d = new InputDriver({
    spawnImpl: fakeSpawn(
      (m) =>
        m.op === "windows"
          ? {
              windows: [
                {
                  hwnd: "42",
                  title: "Notepad",
                  proc: "notepad",
                  x: 10,
                  y: 20,
                  width: 300,
                  height: 200,
                },
                { hwnd: "7", title: "Skip box" },
              ],
            }
          : null,
      state
    ),
  });
  const wins = await d.listWindows();
  assert.strictEqual(wins.length, 2);
  assert.deepStrictEqual(wins[0], {
    hwnd: "42",
    title: "Notepad",
    proc: "notepad",
    x: 10,
    y: 20,
    width: 300,
    height: 200,
  });
  assert.deepStrictEqual(wins[1], { hwnd: "7", title: "Skip box", proc: "" });
  const fg = new InputDriver({
    spawnImpl: fakeSpawn((m) =>
      m.op === "fg"
        ? { hwnd: "42", title: "Notepad", proc: "notepad", x: 10, y: 20, width: 300, height: 200 }
        : null
    ),
  });
  assert.deepStrictEqual(await fg.foreground(), {
    hwnd: "42",
    title: "Notepad",
    proc: "notepad",
    x: 10,
    y: 20,
    width: 300,
    height: 200,
  });
  fg.dispose();
  d.dispose();
});

test("foreground rides the worker; dry-run stays offline", async () => {
  const state = {};
  const d = new InputDriver({
    spawnImpl: fakeSpawn((m) => (m.op === "fg" ? { title: "Notepad — todo", proc: "notepad" } : null), state),
  });
  const fg = await d.foreground();
  assert.deepStrictEqual(fg, { hwnd: "0", title: "Notepad — todo", proc: "notepad" });
  d.dispose();

  const dry = new InputDriver({ dryRun: true });
  assert.deepStrictEqual(await dry.foreground(), { hwnd: "0", title: "?", proc: "?" });
});

test("worker op error rejects; worker death fails pending and respawns next op", async () => {
  const state = {};
  const d = new InputDriver({
    spawnImpl: fakeSpawn((m) => (m.op === "tap" ? { __error: "boom" } : null), state),
  });
  await assert.rejects(() => d.press("enter"), /boom/);

  // Kill the worker; the next op should spawn a fresh one and succeed.
  d._worker.kill();
  await d.clickAt(1, 2);
  assert.strictEqual(state.spawned, 2);
  d.dispose();
});

test("press rejects unsupported keys without touching the worker", async () => {
  const state = {};
  const d = new InputDriver({ spawnImpl: fakeSpawn(null, state) });
  await assert.rejects(() => d.press("hyper+q"), /Unsupported key/);
  assert.strictEqual(state.spawned, 0);
  assert.strictEqual(state.ops.length, 0);
});

test("drag / clipboard / open actions ride the worker", async () => {
  const state = {};
  const d = new InputDriver({
    spawnImpl: fakeSpawn((m) => (m.op === "clip_get" ? { text: "hello" } : null), state),
    toPhysical: (pt) => ({ x: pt.x * 2, y: pt.y * 2 }),
  });

  const drag = await d.perform(
    { type: "drag", xPct: 10, yPct: 20, endXPct: 80, endYPct: 60 },
    { region: { x: 0, y: 0, width: 100, height: 100 } }
  );
  assert.strictEqual(drag.ok, true);
  assert.strictEqual(state.ops[0].op, "drag");
  assert.strictEqual(state.ops[0].x1, 20);
  assert.strictEqual(state.ops[0].y1, 40);

  const paste = await d.perform({ type: "clipboard_paste", value: "hi" });
  assert.strictEqual(paste.ok, true);
  assert.ok(state.ops.some((o) => o.op === "clip_set"));
  assert.ok(state.ops.some((o) => o.op === "combo"));

  const copy = await d.perform({ type: "copy" });
  assert.strictEqual(copy.ok, true);

  const opened = await d.perform({ type: "open", url: "https://example.com" });
  assert.strictEqual(opened.ok, true);
  assert.strictEqual(state.ops.filter((o) => o.op === "open").length, 1);

  const got = await d.perform({ type: "clipboard_get" });
  assert.strictEqual(got.text, "hello");

  const badOpen = await d.perform({ type: "open", url: "https://x.com|calc" });
  assert.strictEqual(badOpen.ok, false);
  assert.match(String(badOpen.error || ""), /rejected/);
  d.dispose();
});

test("dry-run supports drag/open/clipboard without spawning", async () => {
  const d = new InputDriver({ dryRun: true });
  assert.strictEqual((await d.perform({ type: "drag", x: 1, y: 2, endX: 3, endY: 4 })).ok, true);
  assert.strictEqual((await d.perform({ type: "clipboard_paste", value: "x" })).ok, true);
  assert.strictEqual((await d.perform({ type: "open", path: "C:\\Windows\\notepad.exe" })).ok, true);
});

test("dry-run uia_set is a no-op success; live miss is a visible no", async () => {
  const dry = new InputDriver({ dryRun: true });
  const ok = await dry.perform({ type: "uia_set", target: "Search", value: "hello" });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.via, "uia-set");
  assert.strictEqual(ok.dryRun, true);
  const missing = await dry.perform({ type: "uia_set", value: "hello" });
  assert.strictEqual(missing.ok, false);
  let called = "";
  const live = new InputDriver({
    uiaSet: async (target, value) => {
      called = `${target}:${value}`;
      return { ok: true, name: target, via: "uia-set" };
    },
  });
  const hit = await live.perform({ type: "uia_set", target: "Search", value: "hello" });
  assert.strictEqual(hit.ok, true);
  assert.strictEqual(called, "Search:hello");
  assert.strictEqual(hit.keepCursor, true);
  const none = new InputDriver({});
  const noFn = await none.perform({ type: "uia_set", target: "Search", value: "hello" });
  assert.strictEqual(noFn.ok, false);
  const failed = new InputDriver({
    uiaSet: async () => ({ ok: false, reason: "no matching control" }),
  });
  const miss = await failed.perform({ type: "uia_set", target: "Search", value: "hello" });
  assert.strictEqual(miss.ok, false);
  assert.match(String(miss.error || ""), /no matching/);
});

test("keysHeld reports the worker down flag", async () => {
  const state = {};
  const d = new InputDriver({
    spawnImpl: fakeSpawn((m) => (m.op === "keys" ? { down: true } : null), state),
  });
  const r = await d.keysHeld([0x11, 0x12, 0x20]);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.down, true);
  assert.ok(state.ops.some((o) => o.op === "keys"));
  d.dispose();
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
