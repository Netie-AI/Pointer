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
    assert.ok(r.result.tools.includes("workspace.exec"));
    assert.ok(r.result.tools.includes("desks.list"));
    assert.ok(r.result.tools.includes("teach.point"));
    assert.ok(r.result.tools.includes("today.brief"));
    assert.ok(r.result.tools.includes("meeting.live"));
    assert.ok(r.result.tools.includes("workspace.get"));
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

  await test("desks.pick and workspace.exec stay first-party and exec-refused", async () => {
    const coord = createCoordinator();
    const mcp = createMcpAbi();
    const desks = await mcp.handle({ jsonrpc: "2.0", id: 6, method: "desks.list" });
    assert.ok(desks.result.desks.some((d) => d.id === "meeting"));
    const pick = await mcp.handle(
      { jsonrpc: "2.0", id: 7, method: "desks.pick", params: { goal: "what should I say" } }
    );
    assert.strictEqual(pick.result.desk.id, "meeting");
    const exec = await mcp.handle(
      { jsonrpc: "2.0", id: 8, method: "workspace.exec", params: { backend: "container" } },
      { coordinator: coord }
    );
    assert.ok(exec.error);
    assert.match(exec.error.message, /no runtime/);
    const put = await mcp.handle(
      {
        jsonrpc: "2.0",
        id: 9,
        method: "workspace.put",
        params: { title: "brief", body: "# Meeting brief\n- done", desk: "meeting" },
      },
      { coordinator: coord }
    );
    assert.strictEqual(put.result.ok, true);
    const listed = await mcp.handle(
      { jsonrpc: "2.0", id: 10, method: "workspace.list" },
      { coordinator: coord }
    );
    assert.strictEqual(listed.result.exec, false);
    assert.strictEqual(listed.result.artifacts.length, 1);
    const brief = await mcp.handle(
      { jsonrpc: "2.0", id: 11, method: "today.brief" },
      { coordinator: coord }
    );
    assert.strictEqual(brief.result.act, false);
    assert.strictEqual(brief.result.exec, false);
    assert.match(brief.result.deliverable, /# Today/);
    assert.match(brief.result.deliverable, /P-06/);
    const got = await mcp.handle(
      { jsonrpc: "2.0", id: 12, method: "workspace.get", params: { id: put.result.artifact.id } },
      { coordinator: coord }
    );
    assert.strictEqual(got.result.ok, true);
    assert.strictEqual(got.result.act, false);
    assert.strictEqual(got.result.exec, false);
    assert.match(got.result.artifact.body, /Meeting brief/);
    const pointed = await mcp.handle(
      {
        jsonrpc: "2.0",
        id: 13,
        method: "teach.point",
        params: {
          text: "walk me through this on my screen",
          screen: { x: 0, y: 0, width: 1000, height: 1000 },
          controls: [
            { name: "Save", controlType: "Button", rect: { x: 200, y: 400, width: 100, height: 40 } },
          ],
        },
      }
    );
    assert.strictEqual(pointed.result.ok, true);
    assert.strictEqual(pointed.result.act, false);
    assert.strictEqual(pointed.result.exec, false);
    assert.match(pointed.result.deliverable, /\[POINT:25,42:Save\]/);
    assert.match(pointed.result.deliverable, /\[BOX:20,40,10,4:Save\]/);
    coord.workspace.put({
      id: "live-meeting",
      title: "Live assist",
      desk: "meeting",
      body: "# Meeting brief\nSay the date.",
      cue: "I will send it Friday.",
    });
    const live = await mcp.handle(
      { jsonrpc: "2.0", id: 15, method: "meeting.live" },
      { coordinator: coord }
    );
    assert.strictEqual(live.result.ok, true);
    assert.strictEqual(live.result.act, false);
    assert.strictEqual(live.result.exec, false);
    assert.match(live.result.artifact.cue, /Friday/);
    const unknown = await mcp.handle({ jsonrpc: "2.0", id: 14, method: "browser.run" });
    assert.ok(unknown.error);
    assert.match(unknown.error.message, /unknown tool/);
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
