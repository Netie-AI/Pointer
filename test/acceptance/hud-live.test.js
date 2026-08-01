"use strict";
/**
 * WP HUD-01..06 — the Cluely LIVE pass.
 *
 * These assert the logic the HUD actually runs (electron/netie/hud-live.js),
 * not the renderer's DOM. The last test is the one that keeps the rest honest:
 * a perfectly-tested module that hud.html never loads is a feature that does
 * not exist, and every behavioural test above it would still be green.
 *
 * Run: node test/acceptance/hud-live.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertSuite } = require("../harness/mock-peers");

const ROOT = path.join(__dirname, "..", "..");
const live = require("../../electron/netie/hud-live");
const modes = require("../../electron/netie/modes");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    // ── HUD-01 ─────────────────────────────────────────────────────────────
    T("HUD-01: LIVE subtitle drags by screen delta, per panel", async () => {
      const drag = live.createDragController();
      assert.strictEqual(drag.dragging, false);

      drag.begin("subtitle", { x: 100, y: 200 });
      assert.strictEqual(drag.dragging, true);
      assert.strictEqual(drag.target, "subtitle");
      const moved = drag.move({ x: 140, y: 175 });
      assert.deepStrictEqual(moved.offset, { x: 40, y: -25 });

      drag.end();
      assert.strictEqual(drag.dragging, false);
      // A move after pointerup must not keep dragging the panel around.
      assert.strictEqual(drag.move({ x: 900, y: 900 }), null);
      assert.deepStrictEqual(drag.offset("subtitle"), { x: 40, y: -25 });

      // Panels are independent, and a second drag resumes from where it stopped.
      drag.begin("insight", { x: 0, y: 0 });
      drag.move({ x: 10, y: 10 });
      assert.deepStrictEqual(drag.offset("insight"), { x: 10, y: 10 });
      assert.deepStrictEqual(drag.offset("subtitle"), { x: 40, y: -25 });
      drag.end();
      drag.begin("subtitle", { x: 0, y: 0 });
      drag.move({ x: 5, y: 5 });
      assert.deepStrictEqual(drag.offset("subtitle"), { x: 45, y: -20 });
    }),

    // ── HUD-02 ─────────────────────────────────────────────────────────────
    T("HUD-02: auto-send fires at the deadline", async () => {
      const fired = [];
      const auto = live.createAutoSend({ delayMs: 4000, onFire: (e) => fired.push(e.text) });

      auto.arm("open the invoice", 1000);
      assert.strictEqual(auto.armed, true);
      assert.strictEqual(auto.remainingMs(1000), 4000);

      assert.strictEqual(auto.tick(3000).fired, false);
      assert.deepStrictEqual(fired, []);

      const out = auto.tick(5000);
      assert.strictEqual(out.fired, true);
      assert.strictEqual(out.text, "open the invoice");
      assert.deepStrictEqual(fired, ["open the invoice"]);
      // Fired once, disarmed — a later tick must not send it a second time.
      assert.strictEqual(auto.tick(9000).fired, false);
      assert.deepStrictEqual(fired, ["open the invoice"]);
    }),

    T("HUD-02: cancel is absolute — no tick can resurrect it", async () => {
      const fired = [];
      const cancels = [];
      const auto = live.createAutoSend({
        delayMs: 4000,
        onFire: (e) => fired.push(e.text),
        onCancel: (e) => cancels.push(e.reason),
      });

      auto.arm("delete everything", 0);
      const res = auto.cancel("user");
      assert.strictEqual(res.cancelled, true);
      assert.strictEqual(auto.armed, false);
      assert.strictEqual(auto.text, "");

      for (const t of [4000, 8000, 100000]) assert.strictEqual(auto.tick(t).fired, false);
      assert.deepStrictEqual(fired, [], "cancelled text must never be sent");
      assert.deepStrictEqual(cancels, ["user"]);
    }),

    T("HUD-02: more speech extends the clock and accumulates", async () => {
      const fired = [];
      const auto = live.createAutoSend({ delayMs: 4000, onFire: (e) => fired.push(e.text) });

      auto.arm("open the invoice", 1000);
      auto.arm("and copy the total", 3000); // second sentence, same instruction
      assert.strictEqual(auto.text, "open the invoice and copy the total");
      // Old deadline was 5000 — it must not fire the truncated first half.
      assert.strictEqual(auto.tick(5000).fired, false);
      assert.deepStrictEqual(fired, []);

      assert.strictEqual(auto.tick(7000).fired, true);
      assert.deepStrictEqual(fired, ["open the invoice and copy the total"]);
    }),

    // ── HUD-03 ─────────────────────────────────────────────────────────────
    T("HUD-03: General and Agent both exist; General never acts", async () => {
      const ids = Object.keys(modes.MODES);
      assert.ok(ids.includes("agent"), "agent mode must exist");
      assert.ok(ids.includes("general"), "General mode must exist (HUD-03)");

      assert.strictEqual(modes.allowsActions("agent"), true);
      assert.strictEqual(modes.allowsActions("general"), false);
      assert.strictEqual(modes.getMode("general").label, "General");
      assert.strictEqual(modes.getMode("general").listens, true);
    }),

    T("HUD-03: voice switches to General without falling through to Agent", async () => {
      assert.strictEqual(modes.detectModeSwitch("general mode"), "general");
      assert.strictEqual(modes.detectModeSwitch("switch to general mode"), "general");
      assert.strictEqual(modes.detectModeSwitch("just listen"), "general");
      assert.strictEqual(modes.detectModeSwitch("agent mode"), "agent");
      assert.strictEqual(modes.detectModeSwitch("nothing to see here"), null);
    }),

    // ── HUD-04 ─────────────────────────────────────────────────────────────
    T("HUD-04: Do it re-arms capture, unless the human paused it", async () => {
      assert.deepStrictEqual(live.shouldRearmAfterAct({ listening: true, mode: "agent" }), {
        mic: true,
        system: false,
        reason: "was-listening",
      });
      // Pause is an explicit "stop hearing me" and outranks convenience.
      const paused = live.shouldRearmAfterAct({ listening: true, paused: true, mode: "agent" });
      assert.strictEqual(paused.mic, false);
      assert.strictEqual(paused.reason, "paused");
      // Never switch the mic on for someone who never turned it on.
      assert.strictEqual(live.shouldRearmAfterAct({ listening: false, mode: "agent" }).mic, false);
      // Meeting brings system audio back too.
      const meeting = live.shouldRearmAfterAct({ listening: true, mode: "meeting" });
      assert.strictEqual(meeting.system, true);
    }),

    // ── HUD-05 ─────────────────────────────────────────────────────────────
    T("HUD-05: insights are debounced until the talking stops", async () => {
      const seen = [];
      const feed = live.createInsightFeed({
        windowMs: 3500,
        minChars: 10,
        onInsight: (i) => seen.push(i),
      });

      feed.push("we need to reconcile the invoice", 1000);
      feed.push("the invoice total looks wrong", 2000);
      // Still talking — summarising mid-sentence repaints the panel as noise.
      assert.strictEqual(feed.due(3000), false);
      assert.strictEqual(feed.flush(3000), null);
      assert.deepStrictEqual(seen, []);

      assert.strictEqual(feed.due(6000), true);
      const insight = feed.flush(6000);
      assert.ok(insight && insight.summary, "flush must yield a summary");
      assert.ok(insight.keywords.includes("invoice"), "topic should track what was said");
      assert.strictEqual(seen.length, 1);
      // Drained — a second flush with nothing new must stay quiet.
      assert.strictEqual(feed.flush(20000), null);
      assert.strictEqual(seen.length, 1);
    }),

    T("HUD-05: a stray syllable is not an insight", async () => {
      const feed = live.createInsightFeed({ windowMs: 1000, minChars: 24 });
      feed.push("um", 0);
      assert.strictEqual(feed.due(50000), false);
      assert.strictEqual(live.summarizeSpeech([]), null);
      assert.strictEqual(live.summarizeSpeech(["   "]), null);
    }),

    // ── HUD-06 ─────────────────────────────────────────────────────────────
    T("HUD-06: mic + system audio render as one LIVE line", async () => {
      const line = live.createLiveLine();
      assert.strictEqual(line.render(), "");

      line.push("mic", "can you open the deck");
      let out = line.push("system", "sure, one second");
      // Both sides visible in a single line — this is the whole point of HUD-06.
      assert.ok(out.includes("You: can you open the deck"), out);
      assert.ok(out.includes("Screen: sure, one second"), out);
      assert.deepStrictEqual(line.sources, ["mic", "system"]);

      // Newest last: whoever just spoke reads at the end of the line.
      out = line.push("mic", "thanks");
      assert.ok(out.endsWith("You: thanks"), out);
      assert.deepStrictEqual(line.sources, ["system", "mic"]);

      // Dropping one source must not blank the other.
      out = line.clear("system");
      assert.strictEqual(out, "You: thanks");
      assert.strictEqual(line.clear(), "");
    }),

    T("HUD-06: a long LIVE line is truncated from the front, never blanked", async () => {
      const line = live.createLiveLine({ maxChars: 40 });
      const out = line.push("mic", "x".repeat(200));
      assert.ok(out.length <= 40, `expected <=40 chars, got ${out.length}`);
      assert.ok(out.startsWith("…"), out);
    }),

    // ── wiring ─────────────────────────────────────────────────────────────
    T("HUD-01..06: the renderer actually loads and uses hud-live", async () => {
      const html = read("electron/hud.html");
      assert.ok(
        html.includes("netie/hud-live.js"),
        "hud.html must load netie/hud-live.js or none of the above ships"
      );
      assert.ok(
        html.indexOf("netie/hud-live.js") < html.indexOf("hud.js"),
        "hud-live.js must load before hud.js"
      );

      const js = read("electron/hud.js");
      for (const fn of [
        "createDragController",
        "createAutoSend",
        "createLiveLine",
        "createInsightFeed",
        "shouldRearmAfterAct",
      ]) {
        assert.ok(js.includes(fn), `hud.js must use ${fn} (HUD-01..06)`);
      }
      // HUD-03 pill has to offer the mode, not just the module.
      assert.ok(html.includes('data-mode="general"'), "hud.html needs the General pill");

      // Source-level, and said plainly: nothing in this repo boots Electron, so
      // the decision (modes.allowsActions) is unit-tested above and only its
      // presence at the IPC chokepoint is checked here. Hiding the button in
      // CSS is not a control; refusing in main is.
      const main = read("electron/main.js");
      assert.ok(
        /hud:act[\s\S]{0,600}allowsActions\(appMode\)/.test(main),
        "main.js hud:act must refuse to act in a non-acting mode"
      );
      // …and at the real chokepoint. hud:act is one of seven maybeRunPlan
      // callers, and clicks:approvePlan skips maybeRunPlan entirely and calls
      // executeApproved directly — so that is where "General cannot act" has to
      // be true. Guarding only the entry points is guarding the wrong layer.
      assert.ok(
        /async function maybeRunPlan[\s\S]{0,900}allowsActions\(appMode\)/.test(main),
        "maybeRunPlan must refuse"
      );
      assert.ok(
        /async function executeApproved[\s\S]{0,700}allowsActions\(appMode\)/.test(main),
        "executeApproved is the last layer before the driver and must refuse too"
      );
      // FIX-C18 — every IPC that can reach the driver must gate mode somehow.
      // approvePlan skips maybeRunPlan and calls executeApproved directly.
      assert.ok(
        /ipcMain\.handle\("clicks:approvePlan"[\s\S]{0,2500}executeApproved/.test(main),
        "approvePlan reaches executeApproved (which must refuse non-acting modes)"
      );
      const setChatFn = js.match(/function setChatOpen\(open\)\s*\{[\s\S]*?\n\}/);
      assert.ok(setChatFn, "setChatOpen must exist");
      assert.ok(
        !/syncClickThrough\s*\(\s*true\s*\)/.test(setChatFn[0]),
        "FIX-C15: setChatOpen must not force global click capture"
      );
      assert.ok(
        /innerWidth\s*<=\s*900/.test(js),
        "FIX-C16: drag transforms must honour the narrow breakpoint centring"
      );
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
