"use strict";
const assert = require("assert");
const { createMcpAbi, TOOLS } = require("../electron/netie/mcp-abi");
const { createCoordinator } = require("../electron/netie/coordinator");
const { searchThenCraft, craftHint } = require("../electron/netie/skill-search");
const { RECIPES } = require("../electron/netie/recipes");

let pass = 0;
const fails = [];
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      return r.then(() => {
        pass += 1;
        console.log("PASS " + name);
      }).catch((err) => {
        fails.push(name);
        console.log("FAIL " + name + " -- " + err.message);
      });
    }
    pass += 1;
    console.log("PASS " + name);
    return Promise.resolve();
  } catch (err) {
    fails.push(name);
    console.log("FAIL " + name + " -- " + err.message);
    return Promise.resolve();
  }
}

(async () => {
  await test("unknown MCP method is refused", async () => {
    const mcp = createMcpAbi();
    const r = await mcp.handle({ jsonrpc: "2.0", id: 1, method: "fs.write", params: {} });
    assert.ok(r.error);
    assert.match(r.error.message, /unknown tool/);
  });

  await test("tools.list is the allowlist and only the allowlist", async () => {
    const mcp = createMcpAbi();
    const r = await mcp.handle({ jsonrpc: "2.0", id: 2, method: "tools.list" });
    assert.deepStrictEqual(r.result.tools, TOOLS.slice());
    assert.ok(!r.result.tools.includes("shell.exec"));
    assert.ok(Array.isArray(r.result.catalog));
    assert.deepStrictEqual(
      r.result.catalog.map((t) => t.name),
      TOOLS.slice()
    );
    assert.ok(r.result.catalog.every((t) => t.name && t.description && t.inputSchema));
    const observe = r.result.catalog.find((t) => t.name === "computer.observe");
    assert.ok(observe.inputSchema.properties.screenshot);
    assert.ok(observe.inputSchema.properties.clipboard);
    const meeting = r.result.catalog.find((t) => t.name === "computer.meeting_assist");
    assert.ok(meeting.inputSchema.properties.kind);
    const scribe = r.result.catalog.find((t) => t.name === "computer.scribe");
    assert.ok(scribe.inputSchema.properties.retry);
    assert.ok(scribe.inputSchema.properties.dictate);
  });

  await test("lanes.claim goes through MCP and conflicts", async () => {
    const coord = createCoordinator({ clock: () => 5 });
    const mcp = createMcpAbi();
    const a = await mcp.handle(
      { jsonrpc: "2.0", id: 3, method: "lanes.claim", params: { lane: "cortex", owner: "cortex-sidecar" } },
      { coordinator: coord }
    );
    assert.strictEqual(a.result.ok, true);
    const b = await mcp.handle(
      { jsonrpc: "2.0", id: 4, method: "lanes.claim", params: { lane: "cortex", owner: "cursor-cloud" } },
      { coordinator: coord }
    );
    assert.strictEqual(b.result.ok, false);
    assert.strictEqual(b.result.conflict, true);
  });

  await test("skills.craft cannot smuggle actions", async () => {
    const coord = createCoordinator();
    const mcp = createMcpAbi({
      craft: () => ({ ok: true, id: "evil", actions: [{ type: "click", target: "Buy" }] }),
    });
    const r = await mcp.handle(
      { jsonrpc: "2.0", id: 5, method: "skills.craft", params: { goal: "buy it" } },
      { coordinator: coord }
    );
    assert.ok(r.error);
    assert.match(r.error.message, /cannot emit executable actions/);
  });

  await test("search miss crafts a hint with empty actions", async () => {
    const found = await searchThenCraft("flibbertigibbet the spreadsheet", {
      findSkills: async () => ({ ok: true, hits: [] }),
      recipes: RECIPES,
    });
    assert.strictEqual(found.source, "craft-hint");
    assert.ok(found.draft);
    assert.deepStrictEqual(found.draft.actions, []);
    assert.strictEqual(found.draft.tier, "hint");
    const hint = craftHint("open the warp drive");
    assert.deepStrictEqual(hint.actions, []);
  });

  await test("local recipe search still hits fill right", async () => {
    const found = await searchThenCraft("fill right in excel", {
      findSkills: async () => ({ ok: true, hits: [] }),
      recipes: RECIPES,
    });
    assert.ok(found.hits.some((h) => h.id === "fill_right" || /fill/.test(h.id)));
    assert.strictEqual(found.draft, null);
  });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
