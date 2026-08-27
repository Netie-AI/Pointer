"use strict";
/**
 * A-0007 / FIX-C09 — recipe and skills act paths must fail-closed on /dms/secure.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

function T(name, fn) {
  return { name, fn };
}

async function run() {
  const main = fs.readFileSync(path.join(ROOT, "electron/main.js"), "utf8");

  const tests = [
    T("secureBeforeAct helper exists and fail-closes", () => {
      assert.ok(/async function secureBeforeAct/.test(main), "helper missing");
      assert.ok(/failClosed:\s*true/.test(main), "must failClosed");
      assert.ok(/clicks\.blocked/.test(main), "must audit blocks");
      assert.ok(/runComputerAct/.test(main), "loopback computer.act must use the gated runner");
      assert.ok(/ignoreHudMode/.test(main), "MCP act must not be muted by HUD mode");
      assert.ok(/planFromInstruction/.test(main), "computer.act must plan from an instruction");
      assert.ok(/runScribeTurn/.test(main), "Scribe must complete then paste");
      assert.ok(/deliverIntoTarget/.test(main), "dictation/scribe must restore the remembered window");
      assert.ok(/Control\+Alt\+Space/.test(main), "global dictation hotkey must snapshot the current app");
      assert.ok(/Control\+Alt\+M/.test(main), "Ctrl+Alt+M must flip transcribe and scribe");
      assert.ok(/Control\+Alt\+L/.test(main), "Ctrl+Alt+L must toggle Scribe language");
      assert.ok(/runComputerScribe/.test(main), "loopback computer.scribe must use the gated runner");
      assert.ok(/runMeetingAssist/.test(main), "loopback computer.meeting_assist must use the gated runner");
      assert.ok(/listWindows/.test(main), "computer.observe must list live windows");
      assert.ok(/syncDictateCancelHotkey/.test(main), "Esc must cancel dictation only while listening");
      assert.ok(/scribeScreenContext/.test(main), "Scribe may attach optional screen context");
      assert.ok(/dumpForeground/.test(main), "computer.observe may dump UIA controls");
      const observeFn = main.slice(main.indexOf("observe: async (params)"));
      const observeBody = observeFn.slice(0, observeFn.indexOf("act: (params)"));
      assert.ok(/params\.screenshot === true/.test(observeBody), "observe must capture a PNG when asked");
      assert.ok(/captureDisplayCrop/.test(observeBody), "observe screenshot uses the live display crop");
      assert.ok(/params\.clipboard === true/.test(observeBody), "observe must read clipboard when asked");
      assert.ok(/clipboardGet/.test(observeBody), "observe clipboard uses the driver pasteboard");
      assert.ok(/applyAutostart/.test(main), "OpenWillow autostart must reach login items");
      assert.ok(/buildMeetingAssist/.test(main), "meeting mode must offer Cluely-class assist");
      assert.ok(/meetingNotes/.test(main), "GET /api/meeting?notes=1 must read live notes");
      assert.ok(/exportMeetingNotes/.test(main), "Copy notes must export from the live file in main");
      assert.ok(/ipcMain\.handle\("hud:meetingNotes"/.test(main), "hud:meetingNotes must exist");
      const assistFn = main.slice(main.indexOf("meetingAssist: async"));
      assert.ok(/params\.screenshot !== false/.test(assistFn), "meeting_assist must capture unless screenshot is false");
      assert.ok(/screenshot: false/.test(main), "live suggest must not recapture every debounce");
      assert.ok(/payload && payload.kind/.test(main), "hud:ask must pass recap/followups kind");
      assert.ok(/createPendingScribe/.test(main), "failed Scribe must keep a pending transcript");
      assert.ok(/retryPendingScribe/.test(main), "OpenWillow retry must re-run the pending take");
      assert.ok(/usePendingDictation/.test(main), "pending dictation must paste the raw transcript");
      assert.ok(/async function captureNowForAsk/.test(main), "Ask must capture the live screen");
      const hudAsk = main.slice(main.indexOf('ipcMain.handle("hud:ask"'));
      const hudAskBody = hudAsk.slice(0, hudAsk.indexOf('ipcMain.handle("hud:bgList"'));
      const retryIdx = hudAskBody.indexOf("retryScribe");
      const captureIdx = hudAskBody.indexOf("captureNowForAsk");
      assert.ok(retryIdx >= 0 && captureIdx > retryIdx, "retry/dictate must not recapture");
      assert.ok(/captureNowForAsk\(/.test(hudAskBody), "hud:ask must grab a fresh screenshot");
      assert.ok(/globalShortcut\.register\("Control\+Enter"/.test(main), "Cluely Assist must be a global Ctrl+Enter");
      assert.ok(/showHud\(\{\s*assist:\s*true\s*\}\)/.test(main), "Ctrl+Enter must open Ask as Assist");
    }),

    T("hud:act recipe branch calls secureBeforeAct before maybeRunPlan", () => {
      const hudAct = main.slice(main.indexOf('ipcMain.handle("hud:act"'));
      const recipeIdx = hudAct.indexOf("expandRecipe(matchRecipe");
      const secureIdx = hudAct.indexOf("secureBeforeAct(message, \"recipe\")", recipeIdx);
      const runIdx = hudAct.indexOf("maybeRunPlan(plan)", recipeIdx);
      assert.ok(secureIdx > 0 && secureIdx < runIdx, "recipe must secure before run");
    }),

    T("clicks:go recipe branch calls secureBeforeAct", () => {
      const go = main.slice(main.indexOf('ipcMain.handle("clicks:go"'));
      assert.ok(/secureBeforeAct\(message,\s*"recipe"\)/.test(go), "go recipe ungated");
    }),

    T("skills expansion calls secureBeforeAct before maybeRunPlan", () => {
      assert.ok(/secureBeforeAct\(message,\s*"skills"\)/.test(main), "skills ungated");
      const skillsSecure = main.indexOf('secureBeforeAct(message, "skills")');
      const skillsRun = main.indexOf("maybeRunPlan(plan)", skillsSecure);
      assert.ok(skillsSecure > 0 && skillsRun > skillsSecure && skillsRun - skillsSecure < 2000,
        "skills secure must precede maybeRunPlan");
    }),

    T("mutation: removing secureBeforeAct from recipe would be detectable", () => {
      // Gate that can fail: count of secureBeforeAct call sites for recipe/skills.
      const hits = main.match(/secureBeforeAct\(message,\s*"(recipe|skills)"\)/g) || [];
      assert.ok(hits.length >= 3, `expected >=3 gated call sites, got ${hits.length}`);
    }),
  ];

  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`PASS  ${t.name}`);
    } catch (err) {
      failed += 1;
      console.log(`FAIL  ${t.name}`);
      console.log(`  ${err.message || err}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

run();
