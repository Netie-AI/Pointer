"use strict";
/**
 * The session-report fixes: readable errors, nothing left on screen when hidden,
 * a rolling multi-line LIVE bar, spoken capture commands, and no surprise
 * auto-anything.
 *
 * Run: node test/acceptance/live-ux.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertSuite } = require("../harness/mock-peers");

const ROOT = path.join(__dirname, "..", "..");
const { humanizeError, shortError } = require("../../electron/netie/errors");
const { detectCaptureCommand } = require("../../electron/netie/capture-gate");
const live = require("../../electron/netie/hud-live");
const { DEFAULTS } = require("../../electron/netie/settings");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// The exact text the provider chain produced, lightly normalised.
const UPSTREAM_NOISE =
  "request rejected by upstream, non-retryable, type: openvault_non_retryable, " +
  "reason: non_retryable, details: all connection attempts failed; litellm proxy " +
  "seeded; all connections attempted failed; openrouter api key failed";

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    // ── readable failures ──────────────────────────────────────────────────
    T("the provider chain's wall of text becomes one actionable line", async () => {
      const out = humanizeError(UPSTREAM_NOISE);
      assert.strictEqual(out.kind, "no-key");
      assert.ok(/OpenVault/.test(out.title), out.title);
      // The fix has to name the file. "Configure your provider" is not a fix.
      assert.ok(/\.env\.local/.test(out.hint), out.hint);
      assert.ok(out.text.length < 200, "the user reads one line, not a stack");
      // …and the original is kept for the console and the ledger.
      assert.strictEqual(out.raw, UPSTREAM_NOISE);
      assert.ok(shortError(UPSTREAM_NOISE).length <= 44);
    }),

    T("each failure names the thing to restart", async () => {
      assert.strictEqual(humanizeError("ECONNREFUSED 127.0.0.1:5000").kind, "openvault-down");
      assert.strictEqual(humanizeError("cortex-unavailable").kind, "cortex-down");
      assert.strictEqual(humanizeError("429 rate limit exceeded").kind, "rate-limit");
      assert.strictEqual(humanizeError("The operation timed out").kind, "timeout");
      for (const raw of ["ECONNREFUSED", "cortex-unavailable", "429 quota"]) {
        assert.ok(humanizeError(raw).hint, `${raw} must come with an action`);
      }
    }),

    T("an unknown error is clipped, not dumped", async () => {
      const wall = "x".repeat(4000);
      const out = humanizeError(wall);
      assert.ok(out.text.length <= 161, `got ${out.text.length}`);
      assert.ok(out.text.endsWith("…"));
      assert.strictEqual(out.raw.length, 4000, "the full text survives for the log");
      // Never crash on the shapes an IPC boundary actually delivers.
      for (const bad of [null, undefined, "", {}, { message: "boom" }, 42]) {
        assert.ok(typeof humanizeError(bad).text === "string");
      }
    }),

    T("the raw upstream text never reaches the answer pane", async () => {
      const main = read("electron/main.js");
      const ask = main.slice(main.indexOf('ipcMain.handle("hud:ask"'));
      const handler = ask.slice(0, ask.indexOf("\n});"));
      assert.ok(handler.includes("humanizeError"), "hud:ask must humanize before sending");
      assert.ok(
        !/text: r\.ok \? pointed\.text : r\.text/.test(handler),
        "the raw provider text must not be the fallback shown to the user"
      );
      assert.ok(handler.includes("console.error"), "…but it must still reach the console");
    }),

    // ── hide means hide ────────────────────────────────────────────────────
    T("hiding the HUD hides the stage too", async () => {
      // The nod toast lived in a SEPARATE window, so hiding the HUD left
      // "Nod / say yes / press Y" sitting on the desktop with no chrome around
      // it — which reads as the app leaking text onto the screen.
      const main = read("electron/main.js");
      const hideHud = main.slice(main.indexOf("function hideHud()"));
      const body = hideHud.slice(0, hideHud.indexOf("\n}"));
      assert.ok(body.includes("hideStage()"), "hideHud must hide the stage window");
      assert.ok(body.includes("overlayWindow"), "…and the overlay");

      // The renderer's own Show/Hide collapses chrome without touching main, so
      // it needs its own route to the stage.
      const js = read("electron/hud.js");
      const morph = js.slice(js.indexOf("function setMorphHidden"));
      assert.ok(
        morph.slice(0, morph.indexOf("\n}")).includes("hud:hideStage"),
        "morph-hide must reach the stage window"
      );
      assert.ok(read("electron/hud-preload.js").includes("hud:hideStage"), "channel allowlisted");
    }),

    // ── no surprise automation ─────────────────────────────────────────────
    T("nothing runs or sends itself by default", async () => {
      assert.strictEqual(DEFAULTS.autoRunSensible, false, "the agent must not move the mouse unasked");
      assert.strictEqual(DEFAULTS.autoSend, false, "speech waits in the Ask box for Do it");
      assert.strictEqual(DEFAULTS.nodConfirm, true, "…and irreversible steps still need a nod");
      // Both remain reachable — this is a default, not a removal.
      const html = read("electron/hud.html");
      assert.ok(html.includes('id="set-autosend"'), "auto-send stays available in settings");
      assert.ok(html.includes('id="set-auto"'), "auto-run stays available in settings");
    }),

    T("a stored autoRunSensible:true is migrated off for existing installs", async () => {
      // Flipping a DEFAULT does nothing for anyone who has run the app before:
      // load() does `{...DEFAULTS, ...stored}` and the stored value wins. This
      // is why "auto-run is off now" was still auto-running.
      const os = require("os");
      const fsx = require("fs");
      const pathx = require("path");
      const { SettingsStore } = require("../../electron/netie/settings");

      const dir = fsx.mkdtempSync(pathx.join(os.tmpdir(), "netie-settings-"));
      const file = pathx.join(dir, "settings.json");

      fsx.writeFileSync(file, JSON.stringify({ autoRunSensible: true, nodConfirm: true }), "utf8");
      const s1 = new SettingsStore({ path: file });
      assert.strictEqual(s1.get("autoRunSensible"), false, "the stored true must be migrated off");
      assert.strictEqual(s1.get("nodConfirm"), true, "unrelated settings must survive");

      // It has to be written, or the migration re-runs forever…
      const onDisk = JSON.parse(fsx.readFileSync(file, "utf8"));
      assert.strictEqual(onDisk.autoRunSensible, false);
      assert.ok(onDisk.settingsVersion >= 2, "the version must persist");

      // …and once migrated, turning it back on must STICK. A migration that
      // re-applies every boot is a preference the user is not allowed to have.
      s1.set({ autoRunSensible: true });
      const s2 = new SettingsStore({ path: file });
      assert.strictEqual(s2.get("autoRunSensible"), true, "the user's later choice must win");

      fsx.rmSync(dir, { recursive: true, force: true });
    }),

    T("the LIVE bar carries system audio only", async () => {
      // It is what the SCREEN is saying. Your own voice belongs in the Ask box,
      // not mixed into the thing you are reading to follow a video.
      const js = read("electron/hud.js");
      const block = js.slice(js.indexOf('if (event.type === "transcript")'));
      const body = block.slice(0, block.indexOf('if (event.type === "capture")'));
      assert.ok(
        /if \(text && source === "system"\)/.test(body),
        "only system audio may reach the LIVE feed"
      );
      assert.ok(
        !/^\s*appendMessage\("user", text\);/m.test(body),
        "mic speech must not be echoed into the chat log — it reads as already sent"
      );
      assert.ok(/askInput\.value = existing/.test(body), "…it goes to the composer instead");
    }),

    T("speech lands in the Ask box whether or not auto-send is on", async () => {
      const js = read("electron/hud.js");
      const block = js.slice(js.indexOf('if (event.type === "transcript")'));
      const body = block.slice(0, block.indexOf('if (event.type === "capture")'));
      assert.ok(/askInput\.value = existing/.test(body), "final speech must populate the composer");
      // The arm call has to sit behind the setting, not beside it.
      assert.ok(
        /hudSettings\.autoSend && \(appMode/.test(body),
        "auto-send must be gated on the setting"
      );
    }),

    // ── rolling LIVE bar ───────────────────────────────────────────────────
    T("the LIVE bar keeps five lines, newest last", async () => {
      const feed = live.createLiveTranscript({ maxLines: 5 });
      for (let i = 1; i <= 7; i += 1) feed.push("system", `line ${i}`);
      const lines = feed.lines();
      assert.strictEqual(lines.length, 5, "capped at five");
      assert.strictEqual(lines[0].text, "line 3", "oldest dropped");
      assert.strictEqual(lines[4].text, "line 7", "newest last");
      assert.strictEqual(lines[0].label, "Screen", "system audio is labelled as the screen");
    }),

    T("a partial is replaced, not stacked", async () => {
      // Otherwise one sentence being recognised eats the whole window a word
      // at a time and pushes the actual conversation off the top.
      const feed = live.createLiveTranscript({ maxLines: 5 });
      feed.push("system", "the quick", { partial: true });
      feed.push("system", "the quick brown", { partial: true });
      feed.push("system", "the quick brown fox", { partial: false });
      assert.strictEqual(feed.size, 1);
      assert.strictEqual(feed.lines()[0].text, "the quick brown fox");
      assert.strictEqual(feed.lines()[0].partial, false);
    }),

    T("both speakers stay distinguishable in the roll", async () => {
      const feed = live.createLiveTranscript({ maxLines: 5 });
      feed.push("system", "welcome back to the channel");
      feed.push("mic", "wait, go back");
      const lines = feed.lines();
      assert.deepStrictEqual(lines.map((l) => l.label), ["Screen", "You"]);
      assert.ok(feed.render().includes("\n"), "render is multi-line");
      // Clearing one source leaves the other.
      feed.clear("mic");
      assert.strictEqual(feed.size, 1);
      assert.strictEqual(feed.lines()[0].source, "system");
    }),

    T("a very long line is clipped per line, not per bar", async () => {
      const feed = live.createLiveTranscript({ maxLines: 5, maxCharsPerLine: 30 });
      feed.push("system", "y".repeat(200));
      feed.push("system", "short one");
      assert.ok(feed.lines()[0].text.length <= 30);
      assert.strictEqual(feed.lines()[1].text, "short one", "clipping must not eat later lines");
    }),

    T("the bar is built from text nodes, never markup", async () => {
      // Every one of these strings is transcribed from whatever is playing on
      // screen. A video title is not markup we control.
      const js = read("electron/hud.js");
      const fn = js.slice(js.indexOf("function renderSubtitle"));
      const body = fn.slice(0, fn.indexOf("\n}"));
      assert.ok(!/innerHTML/.test(body), "renderSubtitle must not use innerHTML");
      assert.ok(/createTextNode|textContent/.test(body));
    }),

    // ── spoken capture commands ────────────────────────────────────────────
    T("continue / pause / stop are heard as commands", async () => {
      assert.strictEqual(detectCaptureCommand("continue"), "continue");
      assert.strictEqual(detectCaptureCommand("Continue."), "continue");
      assert.strictEqual(detectCaptureCommand("keep going"), "continue");
      assert.strictEqual(detectCaptureCommand("pause"), "pause");
      assert.strictEqual(detectCaptureCommand("stop recording"), "stop");
      assert.strictEqual(detectCaptureCommand("that's all"), "stop");
    }),

    T("the same words mid-sentence are just talking", async () => {
      // "so we continue with the invoice" must never restart a recording the
      // user deliberately stopped.
      assert.strictEqual(detectCaptureCommand("so we continue with the invoice"), null);
      assert.strictEqual(detectCaptureCommand("stop me if you have heard this"), null);
      assert.strictEqual(detectCaptureCommand("I had to pause the video for a second"), null);
      assert.strictEqual(detectCaptureCommand(""), null);
      assert.strictEqual(detectCaptureCommand(null), null);
    }),

    T("stop closes the markdown and says where it went", async () => {
      const main = read("electron/main.js");
      const fn = main.slice(main.indexOf("function applyCaptureCommand"));
      const body = fn.slice(0, fn.indexOf("\nfunction segmenterFor"));
      assert.ok(body.includes("notes.stop()"), "stop must close the transcript file");
      assert.ok(/Transcript saved to/.test(body), "…and tell the user the path");
      assert.ok(body.includes("flushSource"), "the last utterance must not be lost");
      // "continue" must not become a way to arm the mic by talking near it.
      assert.ok(
        /if \(!listenMic && !listenSystem\)/.test(body),
        "continue must refuse when nothing was armed"
      );
    }),

    T("system audio is always written to the transcript", async () => {
      const main = read("electron/main.js");
      assert.ok(
        /getMode\(appMode\)\.autoNotes \|\| source === "system"/.test(main),
        "loopback capture must reach the markdown whatever the mode"
      );
    }),

    // ── capture visibility ─────────────────────────────────────────────────
    T("content protection is off by default and toggleable live", async () => {
      assert.strictEqual(DEFAULTS.captureVisible, false, "hidden from screen shares by default");
      const main = read("electron/main.js");
      assert.ok(main.includes("function applyContentProtection"), "one place flips all windows");
      const fn = main.slice(main.indexOf("function applyContentProtection"));
      const body = fn.slice(0, fn.indexOf("\n}\n"));
      for (const w of ["hudWindow", "stageWindow", "panelWindow", "overlayWindow"]) {
        assert.ok(body.includes(w), `${w} must flip too, or it is left in the wrong state`);
      }
      assert.ok(read("electron/hud.html").includes('id="set-capture-visible"'), "exposed in settings");

      // The toggle was useless without this: every window creation hardcoded
      // setContentProtection(true), so a window created after you turned
      // capture on came back protected and the setting appeared to undo itself.
      // Requires a receiver, so this matches a real call and not the prose in
      // applyContentProtection's own docstring.
      assert.ok(
        !/\w+Window\.setContentProtection\(true\)/.test(main),
        "window creation must read the setting, not hardcode protection on"
      );
      const creations = main.match(/setContentProtection\(!captureVisible\(\)\)/g) || [];
      assert.strictEqual(creations.length, 3, `expected 3 creation sites, got ${creations.length}`);
      // …and an env override, because clicking a toggle inside a window that is
      // invisible to the tool trying to click it is not a workflow.
      assert.ok(main.includes("NETIE_CAPTURE_VISIBLE"), "needs a no-UI escape hatch");
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
