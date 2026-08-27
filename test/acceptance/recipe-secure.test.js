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
      assert.ok(/function planLocalInstruction/.test(main), "HUD and MCP must share one local verb planner");
      assert.ok(/planLocalInstruction\(rawMessage\)/.test(main), "hud:act must plan local verbs from Ask text, not attachments");
      assert.ok(/secureBeforeAct\(message,\s*"local"\)/.test(main), "local verbs must still hit Cortex");
      assert.ok(/function localPlanMiss/.test(main), "a window miss must not fall through to the LLM planner");
      assert.ok(/runScribeTurn/.test(main), "Scribe must complete then paste");
      assert.ok(/deliverIntoTarget/.test(main), "dictation/scribe must restore the remembered window");
      assert.ok(/Control\+Alt\+Space/.test(main), "global dictation hotkey must snapshot the current app");
      assert.ok(/recordingHotkey/.test(main), "OpenWillow recording hotkey must be a setting");
      assert.ok(/modeHotkey/.test(main), "OpenWillow mode hotkey must be a setting");
      assert.ok(/languageHotkey/.test(main), "OpenWillow language hotkey must be a setting");
      assert.ok(/normalizeDictateHotkeys/.test(main), "hotkeys must be canonicalized and kept distinct");
      assert.ok(/registerHotkey\(\)/.test(main), "saving settings must rebind global shortcuts");
      assert.ok(/runComputerScribe/.test(main), "loopback computer.scribe must use the gated runner");
      assert.ok(/runMeetingAssist/.test(main), "loopback computer.meeting_assist must use the gated runner");
      assert.ok(/listWindows/.test(main), "computer.observe must list live windows");
      assert.ok(/syncDictateCancelHotkey/.test(main), "Esc must cancel dictation only while listening");
      assert.ok(/scribeScreenContext/.test(main), "Scribe may attach optional screen context");
      assert.ok(/sanitizeSttUrl/.test(main), "BYOK STT URL must be sanitized before use");
      assert.ok(/next\.sttUrl/.test(main), "settings save must refresh the STT sidecar URL");
      assert.ok(/sanitizeLlmUrl/.test(main), "BYOK LLM URL must be sanitized before use");
      assert.ok(/incoming\.llmUrl/.test(main), "settings save must sanitize the LLM URL");
      assert.ok(/chatUrl:\s*\(\)\s*=>\s*settings\.get\("llmUrl"\)/.test(main), "chat hop must read live llmUrl");
      assert.ok(/sttLanguageCode/.test(main), "language hotkey must pin STT as well as Scribe");
      assert.ok(/language:\s*\(\)\s*=>\s*sttLanguageCode/.test(main), "Transcriber must read live STT language");
      assert.ok(/async function captureRememberedWindow/.test(main), "Scribe screen must prefer the remembered window");
      assert.ok(/captureRememberedWindow\(/.test(main), "Scribe screen context must call captureRememberedWindow");
      assert.ok(/pickWindowSource/.test(main), "window capture must match hwnd/title, not dump PrintWindow");
      assert.ok(/dumpForeground/.test(main), "computer.observe may dump UIA controls");
      const observeFn = main.slice(main.indexOf("observe: async (params)"));
      const observeBody = observeFn.slice(0, observeFn.indexOf("act: (params)"));
      assert.ok(/params\.screenshot === true/.test(observeBody), "observe must capture a PNG when asked");
      assert.ok(/captureDisplayCrop/.test(observeBody), "observe screenshot uses the live display crop");
      assert.ok(/params\.clipboard === true/.test(observeBody), "observe must read clipboard when asked");
      assert.ok(/clipboardGet/.test(observeBody), "observe clipboard uses the driver pasteboard");
      assert.ok(/params\.selection === true/.test(observeBody), "observe must read focused selection when asked");
      assert.ok(/readSelection/.test(observeBody), "observe selection uses UIA TextPattern");
      assert.ok(/async function copySelectionText/.test(main), "Scribe must share one selection reader");
      assert.ok(/reason === "password"/.test(main), "password fields must never be Ctrl+C copied");
      assert.ok(/applyAutostart/.test(main), "OpenWillow autostart must reach login items");
      assert.ok(/buildMeetingAssist/.test(main), "meeting mode must offer Cluely-class assist");
      assert.ok(/meetingNotes/.test(main), "GET /api/meeting?notes=1 must read live notes");
      assert.ok(/exportMeetingNotes/.test(main), "Copy notes must export from the live file in main");
      assert.ok(/exportMeetingRecap/.test(main), "Copy recap must export the last recap in main");
      assert.ok(/rememberMeetingShare/.test(main), "a Recap or Say answer must be remembered in main");
      assert.ok(/exportMeetingSay/.test(main), "Copy say must export the last Say in main");
      assert.ok(/action === "say"/.test(main), "hud:meetingNotes say must not take renderer text");
      assert.ok(/action === "recap"/.test(main), "hud:meetingNotes recap must not take renderer text");
      assert.ok(/ipcMain\.handle\("hud:meetingNotes"/.test(main), "hud:meetingNotes must exist");
      const assistFn = main.slice(main.indexOf("meetingAssist: async"));
      assert.ok(/params\.screenshot !== false/.test(assistFn), "meeting_assist must capture unless screenshot is false");
      assert.ok(/screenshot: false/.test(main), "live suggest must not recapture every debounce");
      assert.ok(/payload && payload.kind/.test(main), "hud:ask must pass recap/followups kind");
      assert.ok(/createPendingScribe/.test(main), "failed Scribe must keep a pending transcript");
      assert.ok(/retryPendingScribe/.test(main), "OpenWillow retry must re-run the pending take");
      assert.ok(/usePendingDictation/.test(main), "pending dictation must paste the raw transcript");
      assert.ok(/function trayTemplate/.test(main), "OpenWillow tray must list modes");
      assert.ok(/reason: "tray"/.test(main), "tray mode switch must call applyAppMode");
      assert.ok(/reason: "mcp"/.test(main), "loopback mode switch must call applyAppMode");
      assert.ok(/modeItem\("transcribe", "Transcribe"\)/.test(main), "tray must offer Transcribe");
      assert.ok(/modeItem\("scribe", "Scribe"\)/.test(main), "tray must offer Scribe");
      assert.ok(/modeItem\("meeting", "Meeting"\)/.test(main), "tray must offer Meeting");
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

    T("hud:act local verb branch calls secureBeforeAct before maybeRunPlan", () => {
      const hudAct = main.slice(main.indexOf('ipcMain.handle("hud:act"'));
      const localIdx = hudAct.indexOf("planLocalInstruction(rawMessage)");
      const secureIdx = hudAct.indexOf('secureBeforeAct(message, "local")', localIdx);
      const runIdx = hudAct.indexOf("maybeRunPlan(plan)", secureIdx);
      assert.ok(localIdx > 0, "hud:act must call planLocalInstruction");
      assert.ok(secureIdx > 0 && secureIdx < runIdx, "local verbs must secure before run");
    }),

    T("clicks:go local verb branch calls secureBeforeAct", () => {
      const go = main.slice(main.indexOf('ipcMain.handle("clicks:go"'));
      assert.ok(/planLocalInstruction\(message\)/.test(go), "clicks:go must plan local verbs");
      assert.ok(/secureBeforeAct\(message,\s*"local"\)/.test(go), "clicks:go local ungated");
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
