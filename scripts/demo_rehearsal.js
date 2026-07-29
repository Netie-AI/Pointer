/**
 * Pointer demo rehearsal (no Electron GUI) — stack + recipes + OSR + dry plan gate.
 * Run: node scripts/demo_rehearsal.js
 */
"use strict";

const { NetieEcosystem } = require("../electron/netie/ecosystem");
const { matchRecipe, expandRecipe } = require("../electron/netie/recipes");
const { reviewPlan } = require("../electron/netie/safety");
const { needsAppFork, appForkPrompt, plannerGrounding } = require("../electron/netie/coworker");
const { DemoDebugTrail } = require("../electron/netie/demo-debug");
const fs = require("fs");
const os = require("os");
const path = require("path");

async function main() {
  const eco = new NetieEcosystem({});
  const fails = [];

  const gate = await eco.secure("type Hello from Netie", { failClosed: true });
  if (gate.blocked) fails.push(`secure blocked: ${JSON.stringify(gate.reasons)}`);
  else console.log("OK secure gate");

  const osr = await eco.classifyOsr("type Hello from Netie then save");
  if (!osr.ok || !osr.band) console.log(`WARN osr soft-fail: ${osr.error || "none"}`);
  else console.log(`OK osr band=${osr.band} tip=${(osr.assumptions || [])[0] || ""}`);

  const skills = await eco.findSkills("copy text into microsoft word");
  if (!skills.ok) console.log(`WARN find-skills soft-fail: ${skills.error || "none"}`);
  else console.log(`OK find-skills hits=${(skills.hits || []).length}`);

  const word = expandRecipe(matchRecipe("copy this into word"), {});
  if (!word || word.id !== "terminal_to_word") fails.push("terminal_to_word recipe missing");
  else {
    const reviewed = reviewPlan(word.actions, { autoRunSensible: true, autoRunBenign: true });
    const launch = reviewed.actions.find((a) => a.type === "open");
    if (!launch || !launch._requireConfirm) fails.push("open must require confirm after guard");
    console.log(
      `OK recipe terminal_to_word steps=${reviewed.actions.length} needsApproval=${reviewed.needsApproval}`
    );
  }

  if (!needsAppFork("create a camera hand detection web app")) {
    fails.push("app fork should trigger for hand-detection app");
  } else {
    const fork = appForkPrompt("create a camera hand detection web app");
    console.log(`OK app fork: ${fork.options.map((o) => o.id).join("|")}`);
  }

  const ground = plannerGrounding("continue cortex project");
  if (!ground || !/STATUS\.md|Coworker rules/i.test(ground)) {
    fails.push("planner grounding missing STATUS/rules");
  } else console.log("OK planner grounding");

  const trailRoot = path.join(os.tmpdir(), "netie-demo-debug-test");
  const trail = new DemoDebugTrail({ enabled: true, root: trailRoot });
  const dir = trail.beginRun("rehearsal");
  trail.recordStep({ phase: "before", type: "press" }, null);
  trail.endRun({ steps: 1 });
  if (!dir || !fs.existsSync(path.join(dir, "steps.jsonl"))) fails.push("demo debug trail failed");
  else console.log(`OK demo debug trail ${dir}`);

  const save = expandRecipe(matchRecipe("save"), { coords: { x: 100, y: 200 } });
  if (!save || save.id !== "save") fails.push("save recipe missing");
  else {
    const reviewed = reviewPlan(save.actions, { autoRunSensible: true, autoRunBenign: true });
    console.log(`OK recipe save steps=${reviewed.actions.length} needsApproval=${reviewed.needsApproval}`);
  }

  if (fails.length) {
    console.error("FAIL\n" + fails.join("\n"));
    process.exit(1);
  }
  console.log("\nRehearsal green.");
  console.log("Live demo: enable Demo screenshots in HUD menu, then Act:");
  console.log('  "copy this into word"  → recipe (confirms open winword)');
  console.log('  "create camera hand detection web app" → which-app fork');
  console.log("OpenVault /v1/chat may be 503 until keys are set — recipes still run.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
