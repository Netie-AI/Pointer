"use strict";
const assert = require("assert");
const {
  UACC_SKILLS,
  searchUaccSkills,
  detectUacc,
  parseProbe,
  computerStatus,
  computerObserve,
} = require("../electron/netie/uacc");
const { RECIPES, matchRecipe } = require("../electron/netie/recipes");
const { searchThenCraft } = require("../electron/netie/skill-search");
const { createMcpAbi, TOOLS } = require("../electron/netie/mcp-abi");
const { DEFAULTS } = require("../electron/netie/settings");

let pass = 0;
const fails = [];
function test(name, fn) {
  const run = Promise.resolve().then(fn);
  return run
    .then(() => {
      pass += 1;
      console.log("PASS " + name);
    })
    .catch((err) => {
      fails.push(name);
      console.log("FAIL " + name + " -- " + err.message);
    });
}

(async () => {
  await test("UACC catalog covers the READ tools agents need first", () => {
    const ids = UACC_SKILLS.map((s) => s.id);
    assert.ok(ids.includes("uacc_screen_info"));
    assert.ok(ids.includes("uacc_find_element"));
    assert.ok(ids.includes("uacc_planner"));
    assert.ok(UACC_SKILLS.every((s) => s.id && s.title && s.risk));
  });

  await test("search hits UACC for screen-info goals and misses unrelated prose", () => {
    const hits = searchUaccSkills("get screen info with uacc");
    assert.ok(hits.some((h) => h.id === "uacc_screen_info"));
    assert.ok(hits.every((h) => h.source === "uacc-skill"));
    assert.deepStrictEqual(hits[0].actions, []);
    assert.deepStrictEqual(searchUaccSkills("write hello in Word"), []);
  });

  await test("skill search surfaces UACC without a Cortex catalog", async () => {
    const found = await searchThenCraft("uacc screen info", {
      findSkills: async () => ({ ok: true, hits: [] }),
      recipes: RECIPES,
    });
    assert.ok(found.hits.some((h) => h.id === "uacc_screen_info" || h.source === "uacc-skill"));
  });

  await test("uacc screen-info recipe is observe-only", () => {
    const r = matchRecipe("what is on the screen");
    assert.ok(r, "screen-info phrase must match");
    assert.strictEqual(r.id, "uacc_screen_info");
    assert.ok(r.actions.every((a) => a.type === "observe" || a.type === "read"));
    assert.ok(RECIPES.uacc_screen_info);
    assert.ok(RECIPES.uacc_find_element);
  });

  await test("probe parses install vs missing", () => {
    assert.deepStrictEqual(parseProbe("uacc 1.1.0\n", "", 0).installed, true);
    assert.strictEqual(parseProbe("", "No module named 'uacc'", 1).installed, false);
  });

  await test("NETIE_UACC=0 disables the probe", () => {
    const d = detectUacc({
      env: { NETIE_UACC: "0" },
      run: () => {
        throw new Error("must not spawn");
      },
    });
    assert.strictEqual(d.installed, false);
    assert.strictEqual(d.reason, "disabled");
  });

  await test("injected runner can claim uacc is installed", () => {
    const d = detectUacc({
      env: {},
      run: () => ({ status: 0, stdout: "uacc 1.1.0", stderr: "" }),
    });
    assert.strictEqual(d.installed, true);
    assert.strictEqual(d.version, "1.1.0");
  });

  await test("HUD is screenshotable by default so UACC can see it", () => {
    assert.strictEqual(DEFAULTS.captureVisible, true);
  });

  await test("computer.status is detectable only when captureVisible is on", () => {
    const hidden = computerStatus({ captureVisible: false, uacc: { installed: false } });
    assert.strictEqual(hidden.detectable, false);
    const shown = computerStatus({ captureVisible: true, uacc: { installed: true, version: "1.1.0" } });
    assert.strictEqual(shown.detectable, true);
    assert.strictEqual(shown.uacc.installed, true);
    assert.ok(shown.api.includes("/api/computer"));
    assert.strictEqual(shown.act.available, false);
  });

  await test("computer.observe reports visibility without leaking clicks", () => {
    const obs = computerObserve({ captureVisible: true, uacc: { installed: false } });
    assert.strictEqual(obs.ok, true);
    assert.strictEqual(obs.detectable, true);
    assert.deepStrictEqual(obs.elements, []);
  });

  await test("MCP computer.act refuses without a secure gate", async () => {
    const mcp = createMcpAbi({
      status: () => computerStatus({ captureVisible: true, uacc: { installed: false } }),
      observe: () => computerObserve({ captureVisible: true }),
    });
    assert.ok(TOOLS.includes("computer.status"));
    assert.ok(TOOLS.includes("computer.observe"));
    assert.ok(TOOLS.includes("computer.act"));
    const st = await mcp.handle({ jsonrpc: "2.0", id: 1, method: "computer.status" });
    assert.strictEqual(st.result.detectable, true);
    const act = await mcp.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "computer.act",
      params: { actions: [{ type: "click", xPct: 50, yPct: 50 }] },
    });
    assert.ok(act.error);
    assert.match(act.error.message, /dms\/secure|gate/i);
  });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
