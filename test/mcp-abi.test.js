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
    assert.ok(r.result.tools.includes("desks.ask"));
    assert.ok(r.result.tools.includes("teach.point"));
    assert.ok(r.result.tools.includes("today.brief"));
    assert.ok(r.result.tools.includes("teach.live"));
    assert.ok(r.result.tools.includes("security.review"));
    assert.ok(r.result.tools.includes("security.live"));
    assert.ok(r.result.tools.includes("inbox.live"));
    assert.ok(r.result.tools.includes("document.live"));
    assert.ok(r.result.tools.includes("session.live"));
    assert.ok(r.result.tools.includes("workspace.get"));
    assert.ok(Array.isArray(r.result.catalog));
    assert.deepStrictEqual(
      r.result.catalog.map((t) => t.name),
      TOOLS.slice()
    );
    assert.ok(r.result.catalog.every((t) => t.name && t.description && t.inputSchema));
    const observe = r.result.catalog.find((t) => t.name === "computer.observe");
    assert.ok(observe.inputSchema.properties.screenshot);
    assert.ok(observe.inputSchema.properties.clipboard);
    assert.ok(observe.inputSchema.properties.selection);
    assert.ok(observe.inputSchema.properties.captions);
    assert.match(observe.description, /captions true/);
    const meeting = r.result.catalog.find((t) => t.name === "computer.meeting_assist");
    assert.ok(meeting.inputSchema.properties.kind);
    assert.ok(meeting.inputSchema.properties.screenshot);
    assert.match(meeting.description, /export=1/);
    assert.match(meeting.description, /say=1/);
    assert.match(meeting.description, /email=1/);
    assert.match(meeting.description, /actions=1/);
    assert.match(meeting.description, /pack=1/);
    assert.deepStrictEqual(meeting.inputSchema.properties.kind.enum, [
      "say",
      "recap",
      "followups",
      "email",
      "actions",
    ]);
    const scribe = r.result.catalog.find((t) => t.name === "computer.scribe");
    assert.ok(scribe.inputSchema.properties.retry);
    assert.ok(scribe.inputSchema.properties.dictate);
    const act = r.result.catalog.find((t) => t.name === "computer.act");
    assert.match(act.description, /focus: notepad then type: hello/);
    assert.match(act.description, /wait for:/);
    assert.match(act.description, /use Claude/);
    assert.match(act.description, /use Cursor/);
    assert.ok(act.inputSchema.properties.mode);
    const status = r.result.catalog.find((t) => t.name === "computer.status");
    assert.match(status.description, /token totals/);
    assert.match(status.description, /Claude 5-hour/);
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
    coord.workspace.put({
      id: "live-meeting",
      title: "Live assist",
      desk: "meeting",
      body: "# Meeting brief\nhello",
      cue: "I'll send it Friday.",
      live: { transcript: "them: I'm Sarah Chen\nyou: I will send it Friday." },
    });
    const asked = await mcp.handle(
      {
        jsonrpc: "2.0",
        id: 7.5,
        method: "desks.ask",
        params: { ask: "draft a follow-up email from this meeting" },
      },
      { coordinator: coord }
    );
    assert.strictEqual(asked.result.ok, true);
    assert.strictEqual(asked.result.act, false);
    assert.strictEqual(asked.result.exec, false);
    assert.strictEqual(asked.result.desk, "inbox");
    assert.ok(!asked.result.live);
    assert.match(asked.result.deliverable, /Hi Sarah Chen/);
    coord.workspace.put({
      id: "leak-1",
      desk: "document",
      title: "notes",
      body: "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nhello",
    });
    const fileAsk = await mcp.handle(
      {
        jsonrpc: "2.0",
        id: 7.6,
        method: "desks.ask",
        params: { ask: "Security review this file", id: "leak-1" },
      },
      { coordinator: coord }
    );
    assert.strictEqual(fileAsk.result.act, false);
    assert.strictEqual(fileAsk.result.desk, "security");
    assert.match(fileAsk.result.deliverable, /AKIA\*\*\*\*/);
    assert.doesNotMatch(fileAsk.result.deliverable, /AKIAIOSFODNN7EXAMPLE/);
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
    assert.ok(listed.result.artifacts.length >= 1);
    assert.ok(listed.result.artifacts.some((row) => row.title === "brief"));
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
    assert.match(pointed.result.deliverable, /\[POINT:25,42:\d+ Save\]/);
    assert.match(pointed.result.deliverable, /\[BOX:20,40,10,4:\d+ Save\]/);
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
    coord.workspace.put({
      id: "live-meeting",
      title: "Live assist",
      desk: "meeting",
      body: "# Meeting brief\nSay the date.",
      cue: "I will send it Friday.",
      asked: "What is the launch date?",
      live: {
        transcript: [
          "them: I'm Sarah Chen",
          "them: we're with Acme",
          "them: What is the launch date?",
          "you: I will send it Friday.",
        ].join("\n"),
      },
    });
    const mailed = await mcp.handle(
      {
        jsonrpc: "2.0",
        id: 15.5,
        method: "meeting.live",
        params: { ask: "draft a follow-up email from this meeting" },
      },
      { coordinator: coord }
    );
    assert.strictEqual(mailed.result.ok, true);
    assert.strictEqual(mailed.result.act, false);
    assert.strictEqual(mailed.result.exec, false);
    assert.strictEqual(mailed.result.desk, "inbox");
    assert.ok(!mailed.result.live);
    assert.match(mailed.result.deliverable, /Hi Sarah Chen/);
    const askedTeach = await mcp.handle(
      {
        jsonrpc: "2.0",
        id: 15.6,
        method: "meeting.live",
        params: { ask: "walk me through this on my screen" },
      },
      { coordinator: coord }
    );
    assert.strictEqual(askedTeach.result.ok, false);
    assert.strictEqual(askedTeach.result.act, false);
    assert.strictEqual(askedTeach.result.desk, "teach");
    const stillMeeting = await mcp.handle(
      { jsonrpc: "2.0", id: 15.7, method: "meeting.live" },
      { coordinator: coord }
    );
    assert.match(stillMeeting.result.artifact.asked, /launch date/);
    assert.ok(!stillMeeting.result.artifact.live);
    const reviewed = await mcp.handle(
      {
        jsonrpc: "2.0",
        id: 16,
        method: "security.review",
        params: {
          text: "security review this session",
          files: [{ name: ".env", body: "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n" }],
        },
      }
    );
    assert.strictEqual(reviewed.result.ok, true);
    assert.strictEqual(reviewed.result.act, false);
    assert.strictEqual(reviewed.result.exec, false);
    assert.match(reviewed.result.deliverable, /AKIA\*\*\*\*/);
    assert.doesNotMatch(reviewed.result.deliverable, /AKIAIOSFODNN7EXAMPLE/);
    coord.workspace.put({
      id: "live-teach",
      title: "Live teach",
      desk: "teach",
      body: "# Teach walkthrough\n[POINT:25,42:1 Save]",
      rest: "Click Cancel",
    });
    const teachLive = await mcp.handle(
      { jsonrpc: "2.0", id: 17, method: "teach.live" },
      { coordinator: coord }
    );
    assert.strictEqual(teachLive.result.ok, true);
    assert.strictEqual(teachLive.result.act, false);
    assert.strictEqual(teachLive.result.exec, false);
    assert.match(teachLive.result.artifact.body, /1 Save/);
    assert.match(teachLive.result.artifact.rest, /Click Cancel/);
    assert.deepStrictEqual(teachLive.result.path, []);
    coord.workspace.put({
      id: "live-teach",
      title: "Live teach",
      desk: "teach",
      body: "# Teach walkthrough",
      cue: "1 of 3 Type in Email then Tab",
      live: require("../electron/netie/coworker-desks").teachAssist({
        text: "walk me through this on my screen",
        controls: [
          { name: "Cancel", controlType: "Button", rect: { x: 0, y: 0, width: 100, height: 40 } },
          { name: "Save", controlType: "Button", rect: { x: 200, y: 400, width: 100, height: 40 } },
          { name: "Email", controlType: "Edit", rect: { x: 50, y: 80, width: 200, height: 32 } },
        ],
        screen: { x: 0, y: 0, width: 1000, height: 1000 },
      }).live,
    });
    const taught = await mcp.handle(
      { jsonrpc: "2.0", id: 17.5, method: "teach.live", params: { ask: "got it" } },
      { coordinator: coord }
    );
    assert.strictEqual(taught.result.act, false);
    assert.strictEqual(taught.result.exec, false);
    assert.match(taught.result.cue, /Click Save or press Enter/);
    assert.ok(!taught.result.live);
    assert.ok(Array.isArray(taught.result.path));
    assert.ok(taught.result.path.some((p) => p.now && /Save/.test(p.label)));
    const drawn = await mcp.handle(
      {
        jsonrpc: "2.0",
        id: 17.6,
        method: "teach.live",
        params: { region: { leftPct: 20, topPct: 40, wPct: 10, hPct: 4 } },
      },
      { coordinator: coord }
    );
    assert.strictEqual(drawn.result.ok, true);
    assert.strictEqual(drawn.result.act, false);
    assert.strictEqual(drawn.result.exec, false);
    assert.match(drawn.result.cue, /Click Save/);
    assert.ok(drawn.result.path.some((p) => /Save/.test(p.label)));
    assert.ok(drawn.result.path.some((p) => /region/.test(p.label)));
    assert.ok(!drawn.result.live);
    coord.workspace.put({
      id: "live-security",
      title: "Security review",
      desk: "security",
      body: "# Security review\n- redacted",
      cue: "1 secret pattern(s) - do not approve",
    });
    const securityLive = await mcp.handle(
      { jsonrpc: "2.0", id: 18, method: "security.live" },
      { coordinator: coord }
    );
    assert.strictEqual(securityLive.result.ok, true);
    assert.strictEqual(securityLive.result.act, false);
    assert.strictEqual(securityLive.result.exec, false);
    assert.match(securityLive.result.artifact.cue, /do not approve/);
    coord.workspace.put({
      id: "live-inbox",
      title: "Draft reply",
      desk: "inbox",
      body: "# Draft (not sent)\nhello",
      cue: "not sent - parked P-05",
    });
    const inboxLive = await mcp.handle(
      { jsonrpc: "2.0", id: 19, method: "inbox.live" },
      { coordinator: coord }
    );
    assert.strictEqual(inboxLive.result.ok, true);
    assert.strictEqual(inboxLive.result.act, false);
    assert.match(inboxLive.result.artifact.cue, /not sent/);
    coord.workspace.put({
      id: "live-document",
      title: "Document draft",
      desk: "document",
      body: "# Document draft\nhello",
      cue: "draft only - not a .docx",
    });
    const documentLive = await mcp.handle(
      { jsonrpc: "2.0", id: 20, method: "document.live" },
      { coordinator: coord }
    );
    assert.strictEqual(documentLive.result.ok, true);
    assert.strictEqual(documentLive.result.exec, false);
    assert.match(documentLive.result.artifact.cue, /not a \.docx/);
    const sessionLive = await mcp.handle(
      { jsonrpc: "2.0", id: 21, method: "session.live" },
      { coordinator: coord }
    );
    assert.strictEqual(sessionLive.result.ok, true);
    assert.strictEqual(sessionLive.result.exec, false);
    assert.strictEqual(sessionLive.result.act, false);
    assert.strictEqual(sessionLive.result.empty, false);
    assert.ok(sessionLive.result.files.some((row) => row.id === "live-meeting"));
    assert.ok(sessionLive.result.files.some((row) => row.id === "live-inbox"));
    assert.ok(sessionLive.result.files.some((row) => row.href === "/workspace?id=live-meeting"));
    assert.match(sessionLive.result.markdown, /This session/);
    assert.match(sessionLive.result.markdown, /\/workspace\?id=live-inbox/);
    const missing = await mcp.handle({ jsonrpc: "2.0", id: 22, method: "session.live" });
    assert.ok(missing.error);
    assert.match(missing.error.message, /coordinator missing/);
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

  await test("mode-only computer.act switches without a Cortex gate", async () => {
    const seen = [];
    const mcp = createMcpAbi({
      setMode: (mode) => {
        if (mode !== "scribe" && mode !== "meeting") {
          return { ok: false, reason: "unknown mode" };
        }
        seen.push(mode);
        return { ok: true, mode, gated: false };
      },
    });
    const r = await mcp.handle({
      jsonrpc: "2.0",
      id: 40,
      method: "computer.act",
      params: { mode: "scribe" },
    });
    assert.ok(r.result);
    assert.strictEqual(r.result.ok, true);
    assert.strictEqual(r.result.mode, "scribe");
    assert.strictEqual(r.result.gated, false);
    assert.deepStrictEqual(seen, ["scribe"]);
    const gatedStill = await mcp.handle({
      jsonrpc: "2.0",
      id: 41,
      method: "computer.act",
      params: { mode: "scribe", instruction: "type: hi" },
    });
    assert.ok(gatedStill.error);
    assert.match(gatedStill.error.message, /dms\/secure|gate/i);
    const missing = await createMcpAbi().handle({
      jsonrpc: "2.0",
      id: 42,
      method: "computer.act",
      params: { mode: "meeting" },
    });
    assert.ok(missing.error);
    const bad = await mcp.handle({
      jsonrpc: "2.0",
      id: 43,
      method: "computer.act",
      params: { mode: "doom" },
    });
    assert.ok(bad.error);
    assert.match(bad.error.message, /unknown mode/);
  });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
