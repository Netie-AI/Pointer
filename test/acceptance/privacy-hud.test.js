"use strict";
/**
 * Arm-to-listen + glass HUD acceptance.
 *
 * The product position against the always-on demos is that Netie's microphone
 * starts off, a human arms it, transcription happens on-device, and only gated
 * bursts leave the machine. That was true in the code and asserted nowhere,
 * which makes it a claim rather than an invariant. This file holds it.
 *
 * Run: node test/acceptance/privacy-hud.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertSuite } = require("../harness/mock-peers");

const ROOT = path.join(__dirname, "..", "..");
const { shouldAcceptFrame, DISARMED } = require("../../electron/netie/capture-gate");
const { MODES } = require("../../electron/netie/modes");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    // ── arm-to-listen ──────────────────────────────────────────────────────
    T("capture is off until a human arms it", async () => {
      assert.deepStrictEqual(DISARMED, { listenMic: false, listenSystem: false, paused: false });
      assert.strictEqual(shouldAcceptFrame({ source: "mic", ...DISARMED }).accept, false);
      assert.strictEqual(shouldAcceptFrame({ source: "system", ...DISARMED }).accept, false);
      assert.strictEqual(shouldAcceptFrame({ source: "mic", ...DISARMED }).reason, "mic-disarmed");
      // main.js must start disarmed too — the module default is worth nothing
      // if the process initialises the flags the other way.
      const main = read("electron/main.js");
      assert.ok(/let listenMic = false;/.test(main), "listenMic must start false");
      assert.ok(/let listenSystem = false;/.test(main), "listenSystem must start false");
    }),

    T("arming one source does not arm the other", async () => {
      const micOnly = { listenMic: true, listenSystem: false };
      assert.strictEqual(shouldAcceptFrame({ source: "mic", ...micOnly }).accept, true);
      assert.strictEqual(
        shouldAcceptFrame({ source: "system", ...micOnly }).accept,
        false,
        "arming the mic must not start capturing everything the machine plays"
      );
    }),

    T("pause outranks armed — it is the user saying stop", async () => {
      const armed = { listenMic: true, listenSystem: true, paused: true };
      assert.strictEqual(shouldAcceptFrame({ source: "mic", ...armed }).accept, false);
      assert.strictEqual(shouldAcceptFrame({ source: "system", ...armed }).accept, false);
      assert.strictEqual(shouldAcceptFrame({ source: "mic", ...armed }).reason, "paused");
    }),

    T("an unknown source is treated as the microphone, not waved through", async () => {
      // Fail closed on a value we do not recognise.
      assert.strictEqual(shouldAcceptFrame({ source: "bluetooth", listenSystem: true }).accept, false);
      assert.strictEqual(shouldAcceptFrame({}).accept, false);
      assert.strictEqual(shouldAcceptFrame(null).accept, false);
    }),

    T("the frame handler goes through the gate", async () => {
      const main = read("electron/main.js");
      const handler = main.slice(main.indexOf('ipcMain.on("hud:audioFrame"'), main.indexOf('ipcMain.on("hud:audioFrame"') + 900);
      assert.ok(handler.includes("shouldAcceptFrame"), "audio frames must pass the arm gate");
      assert.ok(
        !/if \(source === "mic" && !listenMic\) return;/.test(handler),
        "the inline duplicate of the gate must be gone, or the two will drift"
      );
    }),

    T("no mode silently opts into always-on capture", async () => {
      // A listening mode arms the mic — that is a deliberate, user-chosen act.
      // Agent, the default, must not.
      assert.strictEqual(MODES.agent.listens, false, "the default mode must not listen");
      assert.strictEqual(MODES.general.listens, true);
      assert.strictEqual(MODES.transcribe.listens, true);
      assert.strictEqual(MODES.meeting.listens, true);
    }),

    T("no raw audio path to a cloud endpoint exists", async () => {
      // Transcription is on-device (STT sidecar / Windows speech). If a frame
      // ever gets POSTed somewhere, this is where we find out.
      for (const rel of ["electron/main.js", "electron/hud-audio.js", "electron/netie/stt.js"]) {
        const src = read(rel);
        assert.ok(
          !/https:\/\/(?!127\.0\.0\.1)/.test(src.replace(/^\s*(\/\/|\*).*$/gm, "")),
          `${rel} must not reach a non-loopback host`
        );
      }
      const capture = read("electron/hud-audio.js");
      assert.ok(
        capture.includes("sendFrame") || capture.includes("onFrame"),
        "frames go to the main process, which owns gating"
      );
    }),

    // ── glass HUD ──────────────────────────────────────────────────────────
    T("glass degrades to something readable where backdrop-filter is missing", async () => {
      const css = read("electron/hud.css");
      assert.ok(/backdrop-filter/.test(css), "the liquid-glass look needs backdrop-filter");
      assert.ok(
        /@supports not \(\(backdrop-filter/.test(css),
        "…and a fallback, or the HUD is unreadable text on a transparent window"
      );
      assert.ok(/-webkit-backdrop-filter/.test(css), "Chromium in Electron still wants the prefix");
    }),

    T("the HUD stays tight: CSP unweakened, no floating companion", async () => {
      const html = read("electron/hud.html");
      assert.ok(/style-src 'self'/.test(html), "CSP style-src must stay 'self'");
      assert.ok(!/style-src[^;"]*unsafe-inline/.test(html), "no inline styles in the HUD CSP");
      assert.ok(
        !/id="clicky-orb"|class="[^"]*clicky-orb|stage-orb|peek-drop/.test(html),
        "the floating Clicky ring / stage orb must not come back as identity"
      );
    }),

    T("meeting Do it cannot reach Act - it asks instead", async () => {
      const js = read("electron/hud.js");
      const act = js.slice(js.indexOf("async function doAct"), js.indexOf("async function doAct") + 900);
      assert.ok(/appMode !== "agent"/.test(act), "non-agent modes must not call hud:act");
      assert.ok(/doAsk\(\)/.test(act), "meeting Do it must assist, not click");
      assert.ok(/MEETING_SUGGESTS/.test(js), "meeting mode needs Recap/Assist/Next");
      assert.ok(/Recap this meeting/.test(js));
      assert.ok(/What should I say\?/.test(js));
      assert.ok(/event\.type === "live-brief"/.test(js), "live meeting brief must paint in HUD");
      assert.ok(/paintLiveBrief/.test(js));
      assert.ok(/coworker-brief/.test(read("electron/hud.html")), "live brief lives in fixed insight chrome");
      assert.ok(/id="meeting-cue"/.test(read("electron/hud.html")), "say-this cue is fixed chrome, not a bubble");
      assert.ok(/id="meeting-also"/.test(read("electron/hud.html")), "Also lives in fixed insight chrome");
      assert.ok(/id="meeting-avoid"/.test(read("electron/hud.html")), "Don't say lives in fixed insight chrome");
      assert.ok(/id="meeting-talk"/.test(read("electron/hud.html")), "You/Them talk lives in fixed insight chrome");
      assert.ok(/id="live-cue-bar"/.test(read("electron/hud.html")), "live cue bar is fixed top chrome, not a bubble");
      assert.ok(/id="live-cue-also"/.test(read("electron/hud.html")), "Also lives on the live cue bar");
      assert.ok(/id="live-cue-avoid"/.test(read("electron/hud.html")), "Don't say lives on the live cue bar");
      assert.ok(/id="live-cue-them"/.test(read("electron/hud.html")), "Them lives on the live cue bar");
      assert.ok(/id="live-cue-you"/.test(read("electron/hud.html")), "You lives on the live cue bar");
      assert.ok(/id="live-cue-captions"/.test(read("electron/hud.html")), "Live captions live on the cue bar");
      assert.ok(/id="live-cue-rail"/.test(read("electron/hud.html")), "remaining walk rail lives on the cue bar");
      assert.ok(/id="live-cue-chips"/.test(read("electron/hud.html")), "desk chips live on the cue bar");
      assert.ok(/id="live-cue-dock"/.test(read("electron/hud.html")), "filed desk docks on the cue bar");
      assert.ok(/live-cue-dock-copy/.test(js) && /hud:copyText/.test(js), "HUD dock Copy is clipboard, never send");
      assert.ok(/paintLiveCueDock/.test(js) && /Unsent mail/.test(js), "HUD docks Unsent mail, never send");
      assert.ok(/Draft email/.test(read("electron/hud.html")) && !/Send mail|Approve/.test(read("electron/hud.html")), "cue chips Ask, never send");
      assert.ok(/id="btn-live-next"/.test(read("electron/hud.html")), "Got it lives in the top cue bar");
      const css = read("electron/hud.css");
      assert.ok(/\.live-cue-bar/.test(css), "live cue bar has chrome");
      assert.ok(/\.live-cue-caption/.test(css), "Live captions have chrome");
      assert.ok(/\.live-cue-rail/.test(css) && /\.live-cue-chips/.test(css), "cue rail and chips have chrome");
      assert.ok(/\.live-cue-dock/.test(css) && /live-cue-dock\[hidden\]/.test(css), "cue dock stays unless hidden");
      assert.ok(!/\.hud\.chat-open \.live-cue-bar/.test(css), "live cue bar must not wait for chat");
      assert.ok(/\.hud\.morph-hidden \.live-cue-bar/.test(css), "compact HUD still positions the cue bar");
      assert.ok(
        !/\.hud\.morph-hidden \.live-cue-bar[\s\S]{0,80}display:\s*none/.test(css),
        "cue bar stays when HUD chrome hides"
      );
      assert.ok(/\.hud\.morph-hidden \.subtitle-live/.test(css), "floating LIVE bar stays hidden when compact");
      assert.ok(/id="btn-copy-cue"/.test(read("electron/hud.html")), "copy say-this is a button in the insight panel");
      const copy = js.slice(js.indexOf("const btnCopyCue"), js.indexOf('$("mode-pill")'));
      assert.ok(/hud:copyText/.test(copy), "copy uses clipboard, not Act");
      assert.ok(!/hud:act/.test(copy), "copy must not Act");
      assert.ok(/id="desk-pill"/.test(read("electron/hud.html")), "desk chips are fixed chrome");
      const desk = js.slice(js.indexOf('$("desk-pill")'), js.indexOf('$("mode-pill")'));
      assert.ok(/doAsk\(\)/.test(desk), "desk chips must Ask");
      assert.ok(!/doAct\(\)/.test(desk), "desk chips must not Act");
      const liveFn = js.slice(js.indexOf("function paintLiveBrief"), js.indexOf("const hudSettings"));
      assert.ok(/textContent/.test(liveFn));
      assert.ok(/paintMeetingTalk/.test(liveFn));
      assert.ok(/paintLiveCueCaptions/.test(liveFn));
      assert.ok(/event\.turns/.test(js));
      assert.ok(!/innerHTML/.test(liveFn));
      const capFn = js.slice(js.indexOf("function paintLiveCueCaptions"), js.indexOf("function paintMeetingTalk"));
      assert.ok(/cueCaptionLines/.test(capFn));
      assert.ok(/textContent/.test(capFn));
      assert.ok(!/innerHTML/.test(capFn));
    }),

    T("every enquire input is labelled and reachable", async () => {
      // Accessibility is not a rung on any laziness ladder.
      const js = read("electron/hud.js");
      assert.ok(/label\.htmlFor = id/.test(js), "each input needs a bound <label>");
      assert.ok(/input\.id = id/.test(js), "…which needs the input to have that id");
      assert.ok(/focus\(\)/.test(js), "the first field should take focus");
      const css = read("electron/hud.css");
      assert.ok(/focus-visible/.test(css), "keyboard focus must be visible");
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
