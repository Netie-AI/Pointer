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
      assert.ok(/applyAutostart/.test(main), "OpenWillow autostart must reach login items");
      assert.ok(/buildMeetingAssist/.test(main), "meeting mode must offer Cluely-class assist");
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
