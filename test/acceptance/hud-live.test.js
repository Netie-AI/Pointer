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
      assert.strictEqual(modes.detectModeSwitch("dictation mode"), "transcribe");
      assert.strictEqual(modes.detectModeSwitch("switch to dictation"), "transcribe");
      assert.strictEqual(modes.detectModeSwitch("scribe mode"), "scribe");
      assert.strictEqual(modes.allowsActions("scribe"), false);
      assert.strictEqual(modes.getMode("scribe").listens, true);
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

    T("compact cue captions skip They asked / Them and ignore mic", async () => {
      const feed = live.createLiveTranscript({ maxLines: 5 });
      feed.push("mic", "I can do Friday");
      feed.push("system", "Can we ship Friday?");
      feed.push("system", "Do not send the contract yet.");
      feed.push("system", "Can we also do London?", { partial: true });
      const rows = live.cueCaptionLines(feed.lines(), {
        asked: "Can we ship Friday?",
        them: "Can we ship Friday?",
        max: 2,
      });
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0].text, "Do not send the contract yet.");
      assert.strictEqual(rows[0].partial, false);
      assert.strictEqual(rows[1].text, "Can we also do London?");
      assert.strictEqual(rows[1].partial, true);
      assert.deepStrictEqual(
        live.cueCaptionLines([{ source: "mic", text: "hello" }], { max: 2 }),
        []
      );
      const fromTurns = live.cueCaptionTurns(
        [
          { speaker: "them", text: "We shipped last week." },
          { speaker: "you", text: "I can do Friday." },
          { speaker: "them", text: "Can we ship Friday?" },
        ],
        { asked: "Can we ship Friday?", them: "Can we ship Friday?", max: 2 }
      );
      assert.strictEqual(fromTurns.length, 1);
      assert.strictEqual(fromTurns[0].text, "We shipped last week.");
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
        "createLiveTranscript",
        "cueCaptionLines",
        "cueCaptionTurns",
        "createInsightFeed",
        "shouldRearmAfterAct",
      ]) {
        assert.ok(js.includes(fn), `hud.js must use ${fn} (HUD-01..06)`);
      }
      // HUD-03 pill has to offer the mode, not just the module.
      assert.ok(html.includes('data-mode="general"'), "hud.html needs the General pill");
      assert.ok(html.includes('data-mode="scribe"'), "hud.html needs the Scribe pill");

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
    // ── #25 · hold-to-talk lifecycle ────────────────────────────────────────
    // The gesture is trivial. Every assertion below is about the release paths,
    // because a hold that loses its keyup leaves the microphone open.
    T("#25 a hold opens capture and a release closes it", async () => {
      const log = [];
      const h = live.createHoldToTalk({
        engineAvailable: async () => ({ ok: true }),
        start: async () => { log.push("start"); return { ok: true }; },
        stop: async () => { log.push("stop"); },
      });
      await h.begin();
      assert.strictEqual(h.holding, true);
      await h.end();
      assert.strictEqual(h.holding, false);
      assert.deepStrictEqual(log, ["start", "stop"]);
    }),

    T("#25 no engine means no capture at all, and the control is told why", async () => {
      const log = [];
      const states = [];
      const h = live.createHoldToTalk({
        engineAvailable: async () => ({ ok: false, reason: "no transcription engine" }),
        start: async () => { log.push("start"); return { ok: true }; },
        stop: async () => { log.push("stop"); },
        onState: (s) => states.push(s),
      });
      const r = await h.begin();
      assert.strictEqual(r.ok, false);
      assert.deepStrictEqual(log, [], "audio was captured with nowhere to send it");
      assert.strictEqual(h.holding, false);
      const said = states.find((s) => s.state === "unavailable");
      assert.ok(said && /engine/i.test(said.detail), "the control was never told why");
    }),

    T("#25 blur, visibilitychange and pointercancel are all hard stops", async () => {
      for (const reason of ["blur", "visibilitychange", "pointercancel", "pointerleave"]) {
        const log = [];
        const h = live.createHoldToTalk({
          engineAvailable: async () => ({ ok: true }),
          start: async () => { log.push("start"); return { ok: true }; },
          stop: async () => { log.push(`stop:${reason}`); },
        });
        await h.begin();
        await h.end(reason);
        assert.strictEqual(h.holding, false, `${reason} left the mic open`);
        assert.deepStrictEqual(log, ["start", `stop:${reason}`]);
      }
    }),

    T("#25 end() is idempotent, so overlapping hard stops cannot double-stop", async () => {
      let stops = 0;
      const h = live.createHoldToTalk({
        engineAvailable: async () => ({ ok: true }),
        start: async () => ({ ok: true }),
        stop: async () => { stops += 1; },
      });
      await h.begin();
      await Promise.all([h.end("blur"), h.end("pointerup"), h.end("visibilitychange")]);
      assert.strictEqual(stops, 1, "the mic was stopped more than once");
      assert.strictEqual(h.holding, false);
    }),

    T("#25 a watchdog closes a hold whose release never arrives", async () => {
      let stops = 0;
      let fire = null;
      const h = live.createHoldToTalk({
        engineAvailable: async () => ({ ok: true }),
        start: async () => ({ ok: true }),
        stop: async () => { stops += 1; },
        maxMs: 50,
        setTimer: (fn) => { fire = fn; return 1; },
        clearTimer: () => { fire = null; },
      });
      await h.begin();
      assert.ok(fire, "no watchdog was armed");
      await fire();
      assert.strictEqual(stops, 1, "the watchdog did not close the microphone");
      assert.strictEqual(h.holding, false);
    }),

    T("#25 releasing while capture is still opening does not strand the mic", async () => {
      let stops = 0;
      let releaseStart;
      let sawStart;
      const startCalled = new Promise((res) => { sawStart = res; });
      const h = live.createHoldToTalk({
        engineAvailable: async () => ({ ok: true }),
        start: () => {
          sawStart();
          return new Promise((r) => { releaseStart = () => r({ ok: true }); });
        },
        stop: async () => { stops += 1; },
      });
      const begun = h.begin();
      await startCalled;          // capture is opening, not yet open
      await h.end("pointerup");   // ...and the customer lets go right now
      releaseStart();             // the mic finally opens, for a gesture that is over
      await begun;
      assert.strictEqual(h.holding, false);
      assert.ok(stops >= 1, "capture opened after release and was never closed");
    }),

    T("#25 a release during the engine probe cancels the hold entirely", async () => {
      // A fast tap: pointerdown and pointerup inside one frame, while the STT
      // probe is still in flight. The mic must never open at all.
      const log = [];
      let finishProbe;
      const probing = new Promise((res) => { finishProbe = () => res({ ok: true }); });
      const h = live.createHoldToTalk({
        engineAvailable: () => probing,
        start: async () => { log.push("start"); return { ok: true }; },
        stop: async () => { log.push("stop"); },
      });
      const begun = h.begin();
      await h.end("pointerup");
      finishProbe();
      const r = await begun;
      assert.strictEqual(r.ok, false);
      assert.deepStrictEqual(log, [], "the mic opened after the gesture was over");
      assert.strictEqual(h.holding, false);
    }),

    T("#25 a failed mic does not leave the control claiming it is recording", async () => {
      const states = [];
      const h = live.createHoldToTalk({
        engineAvailable: async () => ({ ok: true }),
        start: async () => ({ ok: false, error: "mic in use" }),
        stop: async () => {},
        onState: (s) => states.push(s),
      });
      const r = await h.begin();
      assert.strictEqual(r.ok, false);
      assert.strictEqual(h.holding, false);
      assert.ok(states.some((s) => s.state === "unavailable"));
    }),

    T("#25 the renderer binds every hard stop the module declares", () => {
      const js = read("electron/hud.js");
      assert.ok(/createHoldToTalk\(/.test(js), "hold-to-talk is not wired into the HUD at all");
      assert.ok(/hud:snapshotDelivery/.test(js), "hold-to-talk must refresh the remembered target window");
      for (const evt of ["pointerup", "pointercancel", "pointerleave"]) {
        assert.ok(js.includes(`"${evt}"`), `${evt} is not bound in the renderer`);
      }
      assert.ok(/addEventListener\("blur"/.test(js), "window blur is not a hard stop");
      assert.ok(/visibilitychange/.test(js), "visibilitychange is not a hard stop");
    }),

    T("Cluely Assist: Ctrl+Enter asks; Shift+Enter stays a newline", () => {
      const js = read("electron/hud.js");
      assert.ok(/event\.assist/.test(js), "open-ask assist never reaches doAsk");
      assert.ok(/opts\.assist === true/.test(js), "empty general Ask must not fire without Assist");
      assert.ok(/event\.shiftKey/.test(js), "Shift+Enter must stay a newline");
      assert.ok(
        /doAsk\(\{\s*assist:\s*true/.test(js),
        "Ctrl+Enter in the Ask box must Assist, not insert a newline"
      );
    }),

    T("Cluely notes: Copy notes copies from main, chip opens the live file", () => {
      const js = read("electron/hud.js");
      const html = read("electron/hud.html");
      assert.ok(/hud:meetingNotes/.test(js), "Copy notes is not wired");
      assert.ok(/action:\s*"copy"/.test(js), "Copy notes must not send renderer text");
      assert.ok(/action:\s*"open"/.test(js), "Notes live chip must open the live file");
      assert.ok(/id="btn-copy-notes"/.test(html), "Copy notes pill missing from HUD");
      assert.ok(/id="btn-copy-recap"/.test(html), "Copy recap pill missing from HUD");
      assert.ok(/id="btn-copy-say"/.test(html), "Copy say pill missing from HUD");
      assert.ok(/id="btn-email"/.test(html), "Email pill missing from HUD");
      assert.ok(/id="btn-copy-email"/.test(html), "Copy email pill missing from HUD");
      assert.ok(/id="btn-actions"/.test(html), "Actions pill missing from HUD");
      assert.ok(/id="btn-copy-actions"/.test(html), "Copy actions pill missing from HUD");
      assert.ok(/id="privacy-chip"/.test(html), "privacy chip missing from HUD");
      assert.ok(/id="session-chip"/.test(html), "session chip missing from HUD");
      assert.ok(/id="bugReportBtn"/.test(html), "Report a problem missing from HUD");
      assert.ok(/Report a problem/.test(html), "founder-facing Report a problem label missing");
      assert.ok(/action:\s*"recap"/.test(js), "Copy recap must not send renderer text");
      assert.ok(/action:\s*"say"/.test(js), "Copy say must not send renderer text");
      assert.ok(/action:\s*"email"/.test(js), "Copy email must not send renderer text");
      assert.ok(/action:\s*"actions"/.test(js), "Copy actions must not send renderer text");
      assert.ok(/doAsk\(\{\s*kind:\s*"email"/.test(js), "Email pill must Ask through Cortex");
      assert.ok(/doAsk\(\{\s*kind:\s*"actions"/.test(js), "Actions pill must Ask through Cortex");
      assert.ok(/kind === "email"/.test(js), "empty Email click must still send kind");
      assert.ok(/kind === "actions"/.test(js), "empty Actions click must still send kind");
    }),

    T("Cluely meeting LIVE captions are fixed chrome, not cursor-following", () => {
      const js = read("electron/hud.js");
      const css = read("electron/hud.css");
      const html = read("electron/hud.html");
      assert.ok(/function syncMeetingCaption/.test(js), "meeting captions must sync visibility");
      assert.ok(/subtitleBar\.hidden = !show/.test(js), "Agent boot must keep the LIVE bar hidden");
      assert.ok(
        /appMode !== "meeting"/.test(js) && /positionSubtitle\(event\.x/.test(js),
        "cursor events must not drive meeting captions"
      );
      assert.ok(/has-live-caption/.test(js), "caption state must be a HUD class, not an orb");
      assert.ok(/\.hud\.mode-meeting \.subtitle-grip/.test(css), "meeting captions drop the drag grip");
      assert.ok(/has-live-caption \.suggest-strip/.test(css), "Say strip must sit below LIVE captions");
      assert.ok(/id="subtitle-bar"/.test(html) && /hidden/.test(html), "LIVE bar ships hidden");
    }),

    T("Cluely follow-ups become clickable Ask chips, not raw HTML", () => {
      const items = live.parseFollowupItems(
        "1. What is the timeline for Friday?\n2. Who owns QA this week?\nNot a question\n- Can we ship without Sam?"
      );
      assert.deepStrictEqual(items, [
        "What is the timeline for Friday?",
        "Who owns QA this week?",
        "Can we ship without Sam?",
      ]);
      assert.deepStrictEqual(live.parseFollowupItems("just a say line"), []);
      const js = read("electron/hud.js");
      assert.ok(/followup-chip/.test(js), "Follow-ups must render as chips");
      assert.ok(/btn\.textContent = q/.test(js), "chip label must be text, not HTML");
      assert.ok(/doAsk\(\{\s*kind:\s*"say"/.test(js), "a chip click must Ask through Cortex");
      assert.ok(
        /applySuggest\(result\.reply[^,]+,\s*\{\s*clickable:\s*true/.test(js),
        "Follow-ups reply must become chips"
      );
      assert.ok(
        /kind === "followups" && result && result\.ok/.test(js),
        "only Follow-ups replies become chips"
      );
      assert.ok(
        !/kind === "email"[\s\S]{0,40}applySuggest/.test(js),
        "Email must stay in the answer pane, not Follow-ups chips"
      );
      assert.ok(
        !/kind === "actions"[\s\S]{0,40}applySuggest/.test(js),
        "Actions must stay in the answer pane, not Follow-ups chips"
      );
      const css = read("electron/hud.css");
      assert.ok(/\.followup-chip/.test(css), "chips need a classy type rule");
    }),

    // ── #23 · attachments reach the payload ─────────────────────────────────
    T("#23 the renderer sends attachment content, not just a chip", () => {
      const js = read("electron/hud.js");
      assert.ok(/attachmentPayload\(\)/.test(js), "no attachment payload is built");
      assert.ok(
        /invoke\("hud:ask",\s*\{\s*message(?::\s*asked)?,\s*attachments/.test(js),
        "hud:ask does not carry attachments"
      );
      assert.ok(
        /invoke\("hud:act",\s*\{\s*message,\s*attachments/.test(js),
        "hud:act does not carry attachments"
      );
      assert.ok(/readAsText/.test(js), "file content is never read");
      assert.ok(/clearAttachments\(\)/.test(js), "attachments leak into the next intent");
    }),

    T("#23 main includes attachment content and forces the approval beat", () => {
      const main = read("electron/main.js");
      assert.ok(/buildAttachmentBlock\(/.test(main), "attachments never reach the request");
      assert.ok(/forcesApproval\(/.test(main), "attachments can still auto-run");
      assert.ok(
        /autoRunSensible:\s*false[\s\S]{0,60}autoRunBenign:\s*false/.test(main),
        "the attachment policy override does not actually disable auto-run"
      );
    }),

    T("#23 attachments.js is loaded by the HUD, not just by the tests", () => {
      const html = read("electron/hud.html");
      assert.ok(
        /<script src="netie\/attachments\.js">/.test(html),
        "the attachment policy module is never loaded by the renderer"
      );
      assert.ok(
        html.indexOf("netie/attachments.js") < html.indexOf("hud.js\"></script>"),
        "attachments.js must load before hud.js reads it"
      );
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
