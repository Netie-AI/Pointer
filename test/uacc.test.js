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
    const shown = computerStatus({
      captureVisible: true,
      uacc: { installed: true, version: "1.1.0" },
      actAvailable: true,
    });
    assert.strictEqual(shown.detectable, true);
    assert.strictEqual(shown.uacc.installed, true);
    assert.ok(shown.api.includes("/api/computer"));
    assert.strictEqual(shown.act.available, true);
    assert.strictEqual(shown.act.gated, true);
    assert.strictEqual(shown.delivery.present, false);
    assert.strictEqual(shown.mode, "agent");
    assert.strictEqual(shown.hotkeys.recording, "Control+Alt+Space");
    assert.strictEqual(shown.hotkeys.assist, "Control+Enter");
    assert.strictEqual(shown.stt.local, true);
    assert.strictEqual(shown.llm.local, true);
    assert.strictEqual(shown.llm.model, "gemini-2.0-flash");
    assert.strictEqual(shown.scribe.language, "English");
    assert.ok(shown.drive.instructions.includes("POST /api/computer {\"mode\":\"scribe\"}"));
    assert.strictEqual(shown.scribe.available, true);
    assert.strictEqual(shown.scribe.gated, true);
    assert.strictEqual(shown.scribe.api, "/api/scribe");
    assert.strictEqual(shown.scribe.pending.present, false);
    assert.ok(shown.drive.instructions.includes("POST /api/scribe {\"retry\":true}"));
    assert.strictEqual(shown.meeting.available, true);
    assert.strictEqual(shown.meeting.api, "/api/meeting");
    assert.strictEqual(shown.meeting.notes, "GET /api/meeting?notes=1");
    assert.strictEqual(shown.meeting.export, "GET /api/meeting?export=1");
    assert.strictEqual(shown.meeting.recap, "GET /api/meeting?recap=1");
    assert.deepStrictEqual(shown.meeting.kinds, ["say", "recap", "followups"]);
    assert.ok(shown.drive.instructions.includes("GET /api/meeting?notes=1"));
    assert.ok(shown.drive.instructions.includes("GET /api/meeting?export=1"));
    assert.ok(shown.drive.instructions.includes("GET /api/meeting?recap=1"));
    assert.ok(shown.drive.instructions.includes("POST /api/meeting screenshot false"));
    assert.ok(shown.drive.instructions.includes("focus: notepad"));
    assert.ok(shown.drive.instructions.includes("focus: notepad then type: hello"));
    assert.ok(shown.drive.instructions.includes("click: Save"));
    assert.ok(shown.drive.instructions.includes("wait 400"));
    assert.ok(shown.drive.instructions.includes("replace: hello"));
    assert.ok(shown.drive.instructions.includes("GET /api/observe?screenshot=1"));
    assert.ok(shown.drive.instructions.includes("GET /api/observe?clipboard=1"));
    assert.ok(shown.drive.instructions.includes("GET /api/observe?selection=1"));
    assert.strictEqual(shown.drive.tools, "GET /api/tools");
    assert.match(shown.drive.gated, /dms\/secure/);
  });

  await test("computer.status publishes live mode, hotkeys, STT, and LLM", () => {
    const live = computerStatus({
      captureVisible: true,
      mode: "meeting",
      scribeLanguage: "Traditional Chinese",
      recordingHotkey: "Control+Shift+D",
      stt: { url: "https://stt.example.com", local: false },
      llm: { url: "https://llm.example.com/v1", local: false, model: "openai/gpt-4o" },
    });
    assert.strictEqual(live.mode, "meeting");
    assert.strictEqual(live.scribe.language, "Traditional Chinese");
    assert.strictEqual(live.hotkeys.recording, "Control+Shift+D");
    assert.strictEqual(live.stt.local, false);
    assert.strictEqual(live.stt.url, "https://stt.example.com");
    assert.strictEqual(live.llm.local, false);
    assert.strictEqual(live.llm.url, "https://llm.example.com/v1");
    assert.strictEqual(live.llm.model, "openai/gpt-4o");
  });

  await test("computer.observe reports visibility without leaking clicks", () => {
    const obs = computerObserve({ captureVisible: true, uacc: { installed: false } });
    assert.strictEqual(obs.ok, true);
    assert.strictEqual(obs.detectable, true);
    assert.deepStrictEqual(obs.elements, []);
    assert.strictEqual(obs.foreground, null);
    assert.deepStrictEqual(obs.windows, []);
    assert.strictEqual(obs.screenshot, null);
    assert.strictEqual(obs.clipboard, null);
    assert.strictEqual(obs.selection, null);
  });

  await test("computer.observe can publish a PNG and clipboard as untrusted data", () => {
    const obs = computerObserve({
      captureVisible: true,
      screenshot: "data:image/png;base64,AAA",
      clipboard: "paste me",
    });
    assert.strictEqual(obs.screenshot.present, true);
    assert.strictEqual(obs.screenshot.mime, "image/png");
    assert.strictEqual(obs.screenshot.truncated, false);
    assert.strictEqual(obs.screenshot.dataUrl, "data:image/png;base64,AAA");
    assert.strictEqual(obs.clipboard.present, true);
    assert.strictEqual(obs.clipboard.text, "paste me");
    assert.match(obs.clipboard.note, /untrusted/);
    const selected = computerObserve({
      captureVisible: true,
      selection: { ok: true, text: "Please move Friday.", via: "uia" },
    });
    assert.strictEqual(selected.selection.present, true);
    assert.strictEqual(selected.selection.text, "Please move Friday.");
    assert.match(selected.selection.note, /untrusted/);
    const secret = computerObserve({
      captureVisible: true,
      selection: { ok: false, reason: "password", blocked: true },
    });
    assert.strictEqual(secret.selection.present, false);
    assert.strictEqual(secret.selection.reason, "password");
    const tooBig = computerObserve({
      captureVisible: true,
      screenshot: "data:image/png;base64," + "A".repeat(1300000),
    });
    assert.strictEqual(tooBig.screenshot.truncated, true);
    assert.strictEqual(tooBig.screenshot.dataUrl, "");
  });

  await test("computer.observe includes foreground and window list for agents", () => {
    const obs = computerObserve({
      captureVisible: true,
      uacc: { installed: false },
      foreground: { hwnd: "42", title: "Untitled - Notepad", proc: "notepad" },
      windows: [
        { hwnd: "42", title: "Untitled - Notepad", proc: "notepad" },
        { hwnd: "0", title: "", proc: "?" },
      ],
    });
    assert.strictEqual(obs.foreground.hwnd, "42");
    assert.strictEqual(obs.foreground.title, "Untitled - Notepad");
    assert.strictEqual(obs.windows.length, 1);
    assert.strictEqual(obs.windows[0].proc, "notepad");
  });

  await test("MCP computer.act refuses without a secure gate", async () => {
    const mcp = createMcpAbi({
      status: () => computerStatus({ captureVisible: true, uacc: { installed: false } }),
      observe: () => computerObserve({ captureVisible: true }),
    });
    assert.ok(TOOLS.includes("computer.status"));
    assert.ok(TOOLS.includes("computer.observe"));
    assert.ok(TOOLS.includes("computer.act"));
    assert.ok(TOOLS.includes("computer.scribe"));
    assert.ok(TOOLS.includes("computer.meeting_assist"));
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
