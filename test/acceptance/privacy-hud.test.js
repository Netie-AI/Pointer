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
      assert.strictEqual(MODES.scribe.listens, true);
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

    // ── solid HUD (no liquid glass) ────────────────────────────────────────
    T("core HUD panels are solid type, not backdrop-filter glass", async () => {
      const css = read("electron/hud.css");
      assert.ok(!/backdrop-filter/.test(css), "PRODUCT_SURFACE forbids backdrop-filter on core HUD");
      assert.ok(/Pointer Display/.test(css), "classy display face must be declared");
      assert.ok(/IBMPlexSerif/.test(css), "IBM Plex Serif files must be referenced");
      assert.ok(/background:\s*var\(--panel\)/.test(css), "panels use a solid fill");
    }),

    T("the HUD stays tight: CSP unweakened, no floating companion", async () => {
      const html = read("electron/hud.html");
      assert.ok(/style-src 'self'/.test(html), "CSP style-src must stay 'self'");
      assert.ok(!/style-src[^;"]*unsafe-inline/.test(html), "no inline styles in the HUD CSP");
      assert.ok(
        !/id="clicky-orb"|class="[^"]*clicky-orb|stage-orb|peek-drop/.test(html),
        "the floating Clicky ring / stage orb must not come back as identity"
      );
      assert.ok(html.includes('id="btn-recap"'), "meeting Recap stays in fixed top chrome");
      assert.ok(html.includes('id="btn-followups"'), "meeting Follow-ups stays in fixed top chrome");
      assert.ok(html.includes('id="btn-scribe-retry"'), "Scribe Retry stays in fixed top chrome");
      assert.ok(html.includes('id="btn-scribe-paste"'), "Scribe Paste as-is stays in fixed top chrome");
      const css = read("electron/hud.css");
      assert.ok(/\.hud\.mode-meeting #btn-recap/.test(css), "Recap is meeting-only");
      assert.ok(/\.hud\.mode-meeting #btn-followups/.test(css), "Follow-ups is meeting-only");
      assert.ok(/\.hud\.mode-scribe\.has-pending #btn-scribe-retry/.test(css), "Retry is pending-Scribe only");
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
