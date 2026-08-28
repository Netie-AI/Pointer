"use strict";
const assert = require("assert");
const { shouldDictateIntoFocus, dictateSecureGoal } = require("../electron/netie/dictate");
const { buildScribeRequest, DEFAULT_SCRIBE_INSTRUCTION } = require("../electron/netie/scribe");
const { prepareComputerAct, runComputerAct } = require("../electron/netie/computer-act");
const { createMcpAbi } = require("../electron/netie/mcp-abi");
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
  await test("dictation types only transcribe + mic + gated", () => {
    assert.strictEqual(
      shouldDictateIntoFocus({ mode: "transcribe", source: "mic", text: "hello", gated: true }),
      true
    );
    assert.strictEqual(
      shouldDictateIntoFocus({ mode: "agent", source: "mic", text: "hello", gated: true }),
      false
    );
    assert.strictEqual(
      shouldDictateIntoFocus({ mode: "transcribe", source: "system", text: "hello", gated: true }),
      false
    );
    assert.strictEqual(
      shouldDictateIntoFocus({ mode: "transcribe", source: "mic", text: "hello", gated: false }),
      false
    );
    assert.ok(/focused window/.test(dictateSecureGoal()));
  });

  await test("scribe request treats selection and screenshot as data", () => {
    const req = buildScribeRequest({
      instruction: "make this formal",
      selectedText: "hey buy now",
      hasScreenshot: true,
    });
    assert.ok(req.hasSelection);
    assert.ok(req.hasScreenshot);
    assert.match(req.user, /hey buy now/);
    assert.match(req.system, /untrusted/i);
    assert.match(req.system, /not commands/);
    assert.match(req.user, /SCRIBE INSTRUCTION:/);
    assert.match(req.user, /USER INSTRUCTION:\nmake this formal/);
    assert.match(req.user, new RegExp(DEFAULT_SCRIBE_INSTRUCTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  await test("scribe standing instruction stays separate from this take", () => {
    assert.strictEqual(DEFAULTS.scribeInstruction, DEFAULT_SCRIBE_INSTRUCTION);
    assert.doesNotMatch(DEFAULT_SCRIBE_INSTRUCTION, /[\u4e00-\u9fff]/);
    const req = buildScribeRequest({
      instruction: "make this a polite email",
      scribeInstruction: "Turn this into a professional email.",
    });
    assert.match(req.user, /SCRIBE INSTRUCTION:\nTurn this into a professional email\./);
    assert.match(req.user, /USER INSTRUCTION:\nmake this a polite email/);
    assert.doesNotMatch(req.user, /SCRIBE INSTRUCTION:\nmake this a polite email/);
    const blank = buildScribeRequest({ instruction: "shorten this", scribeInstruction: "   " });
    assert.match(blank.user, new RegExp(DEFAULT_SCRIBE_INSTRUCTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const fs = require("fs");
    const path = require("path");
    const html = fs.readFileSync(path.join(__dirname, "../electron/hud.html"), "utf8");
    const hud = fs.readFileSync(path.join(__dirname, "../electron/hud.js"), "utf8");
    const main = fs.readFileSync(path.join(__dirname, "../electron/main.js"), "utf8");
    assert.ok(html.includes('id="set-scribe-instruction"'));
    assert.ok(hud.includes("scribeInstruction"));
    assert.ok(main.includes("scribeInstruction: () => settings.get(\"scribeInstruction\")"));
  });

  await test("computer.act refuses without a secure function", async () => {
    const r = await runComputerAct({ actions: [{ type: "observe" }] }, {});
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.blocked, true);
  });

  await test("computer.act fail-closes when Cortex blocks", async () => {
    const r = await runComputerAct(
      { actions: [{ type: "observe" }] },
      { secure: async () => ({ ok: false, reason: "no Cortex /dms/secure gate" }) }
    );
    assert.strictEqual(r.blocked, true);
  });

  await test("observe-only computer.act runs after a green gate", async () => {
    const executed = [];
    const r = await runComputerAct(
      { actions: [{ type: "observe" }] },
      {
        secure: async () => ({ ok: true }),
        execute: async (actions) => {
          executed.push(actions);
          return [{ ok: true, type: "observe" }];
        },
      }
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.ran, true);
    assert.strictEqual(executed.length, 1);
  });

  await test("click computer.act needs approved:true", async () => {
    const executed = [];
    const r = await prepareComputerAct(
      { actions: [{ type: "click", xPct: 40, yPct: 40 }] },
      { secure: async () => ({ ok: true }) }
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.needsApproval, true);
    const ran = await runComputerAct(
      { actions: [{ type: "click", xPct: 40, yPct: 40 }] },
      {
        secure: async () => ({ ok: true }),
        execute: async (a) => {
          executed.push(a);
          return [{ ok: true }];
        },
      }
    );
    assert.strictEqual(ran.ran, false);
    assert.strictEqual(executed.length, 0);
    const ok = await runComputerAct(
      { actions: [{ type: "click", xPct: 40, yPct: 40 }], approved: true },
      {
        secure: async () => ({ ok: true }),
        execute: async (a) => {
          executed.push(a);
          return [{ ok: true }];
        },
      }
    );
    assert.strictEqual(ok.ran, true);
    assert.strictEqual(executed.length, 1);
  });

  await test("toggle computer.act needs approved:true", async () => {
    const r = await prepareComputerAct(
      { instruction: "toggle: Remember me" },
      { secure: async () => ({ ok: true }) }
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.needsApproval, true);
    assert.strictEqual(r.actions[0].type, "uia_toggle");
    const ok = await runComputerAct(
      { instruction: "check: Remember me", approved: true },
      {
        secure: async () => ({ ok: true }),
        execute: async (a) => [{ ok: true, type: a[0].type, want: a[0].want }],
      }
    );
    assert.strictEqual(ok.ran, true);
    assert.strictEqual(ok.actions[0].want, "on");
  });

  await test("expand computer.act needs approved:true", async () => {
    const r = await prepareComputerAct(
      { instruction: "expand: Documents" },
      { secure: async () => ({ ok: true }) }
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.needsApproval, true);
    assert.strictEqual(r.actions[0].type, "uia_expand");
    const ok = await runComputerAct(
      { instruction: "collapse: Documents", approved: true },
      {
        secure: async () => ({ ok: true }),
        execute: async (a) => [{ ok: true, type: a[0].type, want: a[0].want }],
      }
    );
    assert.strictEqual(ok.ran, true);
    assert.strictEqual(ok.actions[0].want, "collapse");
  });

  await test("MCP computer.act with a runner still fail-closes by default", async () => {
    const mcp = createMcpAbi();
    const act = await mcp.handle({
      jsonrpc: "2.0",
      id: 9,
      method: "computer.act",
      params: { actions: [{ type: "click", xPct: 1, yPct: 1 }] },
    });
    assert.ok(act.error);
  });

  await test("MCP computer.act observe runs when wired and gated", async () => {
    const mcp = createMcpAbi({
      act: (params) =>
        runComputerAct(params, {
          secure: async () => ({ ok: true }),
          execute: async () => [{ ok: true, noop: true }],
        }),
    });
    const r = await mcp.handle({
      jsonrpc: "2.0",
      id: 10,
      method: "computer.act",
      params: { actions: [{ type: "observe" }] },
    });
    assert.ok(r.result);
    assert.strictEqual(r.result.ran, true);
  });

  await test("dictateIntoFocus is on by default", () => {
    assert.strictEqual(DEFAULTS.dictateIntoFocus, true);
    assert.strictEqual(DEFAULTS.scribeIntoFocus, true);
    assert.strictEqual(DEFAULTS.scribeScreenContext, false);
    assert.strictEqual(DEFAULTS.sttUrl, "");
    assert.strictEqual(DEFAULTS.llmUrl, "");
    assert.strictEqual(DEFAULTS.llmModel, "");
    assert.strictEqual(DEFAULTS.recordingHotkey, "Control+Alt+Space");
    assert.strictEqual(DEFAULTS.modeHotkey, "Control+Alt+M");
    assert.strictEqual(DEFAULTS.languageHotkey, "Control+Alt+L");
    assert.strictEqual(DEFAULTS.autostart, false);
    assert.strictEqual(DEFAULTS.meetingAutoSuggest, true);
  });

  await test("planFromInstruction uses recipes then type/click/observe", () => {
    const { planFromInstruction } = require("../electron/netie/computer-act");
    const typed = planFromInstruction("type: hello there");
    assert.strictEqual(typed.ok, true);
    assert.strictEqual(typed.actions[0].type, "type");
    assert.strictEqual(typed.actions[0].value, "hello there");
    const clicked = planFromInstruction("click 40 50");
    assert.strictEqual(clicked.actions[0].xPct, 40);
    const rewrite = planFromInstruction("rewrite this");
    assert.strictEqual(rewrite.id, "rewrite_selection");
    const word = planFromInstruction("write hello in Word");
    assert.ok(word.ok);
    assert.ok(word.actions.some((a) => a.type === "word_docx_write"));
    const opened = planFromInstruction("open: notepad");
    assert.strictEqual(opened.source, "open");
    assert.strictEqual(opened.actions[0].type, "open");
    const claude = planFromInstruction("use claude");
    assert.strictEqual(claude.id, "use_claude");
    assert.ok(claude.actions.some((a) => a.type === "open" && a.target === "claude"));
    const cursor = planFromInstruction("the 5-hour limit is done");
    assert.strictEqual(cursor.id, "use_cursor");
    assert.ok(cursor.actions.some((a) => a.type === "open" && a.target === "Cursor"));
    const focused = planFromInstruction("focus hwnd: 99");
    assert.strictEqual(focused.actions[0].type, "focus_hwnd");
    const byTitle = planFromInstruction("focus: notepad", {
      windows: [{ hwnd: "77", title: "Untitled - Notepad", proc: "notepad" }],
    });
    assert.strictEqual(byTitle.ok, true);
    assert.strictEqual(byTitle.actions[0].hwnd, "77");
    const named = planFromInstruction("click: Save");
    assert.strictEqual(named.actions[0].type, "click");
    assert.strictEqual(named.actions[0].target, "Save");
    const invoked = planFromInstruction("invoke: Save");
    assert.strictEqual(invoked.ok, true);
    assert.strictEqual(invoked.source, "invoke");
    assert.strictEqual(invoked.actions[0].type, "uia_invoke");
    assert.strictEqual(invoked.actions[0].target, "Save");
    const please = planFromInstruction("please invoke: OK");
    assert.strictEqual(please.actions[0].type, "uia_invoke");
    assert.strictEqual(please.actions[0].target, "OK");
    const filled = planFromInstruction("fill: Search: hello");
    assert.strictEqual(filled.ok, true);
    assert.strictEqual(filled.source, "fill");
    assert.strictEqual(filled.actions[0].type, "fill");
    assert.strictEqual(filled.actions[0].target, "Search");
    assert.strictEqual(filled.actions[0].value, "hello");
    const typedIn = planFromInstruction("type in: Search: hello");
    assert.strictEqual(typedIn.actions[0].type, "fill");
    assert.strictEqual(typedIn.actions[0].target, "Search");
    const setOnly = planFromInstruction("set: Search: hello");
    assert.strictEqual(setOnly.actions[0].type, "uia_set");
    assert.strictEqual(setOnly.actions[0].value, "hello");
    const stillType = planFromInstruction("type: hello");
    assert.strictEqual(stillType.actions[0].type, "type");
    assert.strictEqual(stillType.actions[0].value, "hello");
    const toggled = planFromInstruction("toggle: Remember me");
    assert.strictEqual(toggled.ok, true);
    assert.strictEqual(toggled.source, "toggle");
    assert.strictEqual(toggled.actions[0].type, "uia_toggle");
    assert.strictEqual(toggled.actions[0].target, "Remember me");
    assert.strictEqual(toggled.actions[0].want, "flip");
    const checked = planFromInstruction("check: Remember me");
    assert.strictEqual(checked.actions[0].type, "uia_toggle");
    assert.strictEqual(checked.actions[0].want, "on");
    const unchecked = planFromInstruction("please uncheck: Remember me");
    assert.strictEqual(unchecked.actions[0].type, "uia_toggle");
    assert.strictEqual(unchecked.actions[0].want, "off");
    const expanded = planFromInstruction("expand: Documents");
    assert.strictEqual(expanded.ok, true);
    assert.strictEqual(expanded.source, "expand");
    assert.strictEqual(expanded.actions[0].type, "uia_expand");
    assert.strictEqual(expanded.actions[0].target, "Documents");
    assert.strictEqual(expanded.actions[0].want, "expand");
    const collapsed = planFromInstruction("please collapse: Documents");
    assert.strictEqual(collapsed.actions[0].type, "uia_expand");
    assert.strictEqual(collapsed.actions[0].want, "collapse");
    const waited = planFromInstruction("wait 400");
    assert.strictEqual(waited.actions[0].type, "wait");
    assert.strictEqual(waited.actions[0].ms, 400);
    const scrolled = planFromInstruction("scroll down");
    assert.strictEqual(scrolled.actions[0].type, "scroll");
    assert.strictEqual(scrolled.actions[0].deltaY, 120);
    const dbl = planFromInstruction("doubleclick 40 50");
    assert.strictEqual(dbl.actions[0].type, "doubleclick");
    assert.strictEqual(dbl.actions[0].xPct, 40);
    const namedRight = planFromInstruction("rightclick: Close");
    assert.strictEqual(namedRight.actions[0].type, "rightclick");
    assert.strictEqual(namedRight.actions[0].target, "Close");
    const winClick = planFromInstruction("click window: notepad", {
      windows: [
        { hwnd: "77", title: "Untitled - Notepad", proc: "notepad", x: 100, y: 200, width: 640, height: 480 },
      ],
    });
    assert.strictEqual(winClick.ok, true);
    assert.strictEqual(winClick.source, "click-window");
    assert.strictEqual(winClick.actions[0].type, "click");
    assert.strictEqual(winClick.actions[0].x, 420);
    assert.strictEqual(winClick.actions[0].y, 440);
    const miss = planFromInstruction("click window: missing", { windows: [] });
    assert.strictEqual(miss.ok, false);
    const noBox = planFromInstruction("click window: notepad", {
      windows: [{ hwnd: "77", title: "Untitled - Notepad", proc: "notepad" }],
    });
    assert.strictEqual(noBox.ok, false);
    assert.strictEqual(noBox.reason, "no window rect");
    const { windowClickPoint } = require("../electron/netie/computer-act");
    const fromBox = windowClickPoint({
      x: 100,
      y: 200,
      width: 640,
      height: 480,
      cx: 1,
      cy: 2,
    });
    assert.deepStrictEqual(fromBox, { x: 420, y: 440 });
    const fromCenter = windowClickPoint({ cx: 15, cy: 25 });
    assert.deepStrictEqual(fromCenter, { x: 15, y: 25 });
  });

  await test("planFromInstruction chains local verbs and keeps type: then as one step", () => {
    const { planFromInstruction, splitInstructionSteps } = require("../electron/netie/computer-act");
    const chained = planFromInstruction("focus: notepad then type: hello", {
      windows: [{ hwnd: "77", title: "Untitled - Notepad", proc: "notepad" }],
    });
    assert.strictEqual(chained.ok, true);
    assert.strictEqual(chained.source, "chain");
    assert.strictEqual(chained.actions[0].type, "focus_hwnd");
    assert.strictEqual(chained.actions[0].hwnd, "77");
    assert.strictEqual(chained.actions[1].type, "type");
    assert.strictEqual(chained.actions[1].value, "hello");
    const typedThen = planFromInstruction("type: hello then world");
    assert.strictEqual(typedThen.ok, true);
    assert.strictEqual(typedThen.source, "type");
    assert.strictEqual(typedThen.actions.length, 1);
    assert.strictEqual(typedThen.actions[0].value, "hello then world");
    assert.deepStrictEqual(splitInstructionSteps("type: hello then world"), ["type: hello then world"]);
    assert.deepStrictEqual(splitInstructionSteps("focus: notepad then type: hello"), [
      "focus: notepad",
      "type: hello",
    ]);
    const aimed = planFromInstruction("click window: notepad then type: hello", {
      windows: [
        { hwnd: "77", title: "Untitled - Notepad", proc: "notepad", x: 0, y: 0, width: 100, height: 40 },
      ],
    });
    assert.strictEqual(aimed.ok, true);
    assert.strictEqual(aimed.source, "chain");
    assert.strictEqual(aimed.actions[0].type, "click");
    assert.strictEqual(aimed.actions[0].x, 50);
    assert.strictEqual(aimed.actions[0].y, 20);
    assert.strictEqual(aimed.actions[1].type, "type");
    assert.strictEqual(aimed.actions[1].value, "hello");
    const toggleThen = planFromInstruction("toggle: Word wrap then type: hello");
    assert.strictEqual(toggleThen.ok, true);
    assert.strictEqual(toggleThen.source, "chain");
    assert.strictEqual(toggleThen.actions[0].type, "uia_toggle");
    assert.strictEqual(toggleThen.actions[0].target, "Word wrap");
    assert.strictEqual(toggleThen.actions[1].type, "type");
    const expandThen = planFromInstruction("expand: Documents then type: hello");
    assert.strictEqual(expandThen.ok, true);
    assert.strictEqual(expandThen.source, "chain");
    assert.strictEqual(expandThen.actions[0].type, "uia_expand");
    assert.strictEqual(expandThen.actions[0].target, "Documents");
    assert.strictEqual(expandThen.actions[1].type, "type");
    const invokeThen = planFromInstruction("invoke: Save then type: hello");
    assert.strictEqual(invokeThen.ok, true);
    assert.strictEqual(invokeThen.source, "chain");
    assert.strictEqual(invokeThen.actions[0].type, "uia_invoke");
    assert.strictEqual(invokeThen.actions[0].target, "Save");
    assert.strictEqual(invokeThen.actions[1].type, "type");
    assert.strictEqual(invokeThen.actions[1].value, "hello");
    const fillThen = planFromInstruction("fill: Search: hello then click: Save");
    assert.strictEqual(fillThen.ok, true);
    assert.strictEqual(fillThen.source, "chain");
    assert.strictEqual(fillThen.actions[0].type, "fill");
    assert.strictEqual(fillThen.actions[0].target, "Search");
    assert.strictEqual(fillThen.actions[1].type, "click");
    assert.strictEqual(fillThen.actions[1].target, "Save");
  });

  await test("computer.act click window: uses observed rects and keeps named click: Save", async () => {
    const { planFromInstruction } = require("../electron/netie/computer-act");
    const named = planFromInstruction("click: Save");
    assert.strictEqual(named.ok, true);
    assert.strictEqual(named.actions[0].target, "Save");
    assert.strictEqual(named.actions[0].x, undefined);
    const r = await runComputerAct(
      { instruction: "click window: notepad", approved: true },
      {
        secure: async () => ({ ok: true }),
        windows: [
          {
            hwnd: "88",
            title: "Untitled - Notepad",
            proc: "notepad",
            x: 0,
            y: 0,
            width: 100,
            height: 40,
          },
        ],
        execute: async (actions) => actions,
      }
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.ran, true);
    assert.strictEqual(r.actions[0].type, "click");
    assert.strictEqual(r.actions[0].x, 50);
    assert.strictEqual(r.actions[0].y, 20);
  });

  await test("executor treats absolute x/y as aimed so click window: is not vision re-aimed", () => {
    const fs = require("fs");
    const src = fs.readFileSync(require.resolve("../electron/main.js"), "utf8");
    assert.ok(/hasScreenPoint/.test(src), "mustReaim must use hasScreenPoint");
    assert.ok(
      !/action\.xPct == null && action\.yPct == null/.test(src),
      "xPct-only reaim would strip window-center clicks"
    );
    const { hasScreenPoint } = require("../electron/netie/targeting");
    assert.strictEqual(hasScreenPoint({ type: "click", x: 420, y: 440 }), true);
    assert.strictEqual(hasScreenPoint({ type: "click", xPct: 40, yPct: 50 }), true);
    assert.strictEqual(hasScreenPoint({ type: "click", target: "Save" }), false);
  });

  await test("computer.act uses deps.windows when planning focus:", async () => {
    const r = await runComputerAct(
      { instruction: "focus: notepad", approved: true },
      {
        secure: async () => ({ ok: true }),
        windows: [{ hwnd: "88", title: "Untitled - Notepad", proc: "notepad" }],
        execute: async (actions) => actions,
      }
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.ran, true);
    assert.strictEqual(r.actions[0].type, "focus_hwnd");
    assert.strictEqual(r.actions[0].hwnd, "88");
  });

  await test("computer.act instruction type: runs after a green gate and approval", async () => {
    const executed = [];
    const r = await runComputerAct(
      { instruction: "type: hi", approved: true },
      {
        secure: async () => ({ ok: true }),
        execute: async (actions) => {
          executed.push(actions);
          return [{ ok: true }];
        },
      }
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.ran, true);
    assert.strictEqual(executed[0][0].type, "type");
    assert.strictEqual(executed[0][0].value, "hi");
  });

  await test("scribe cleans think tags and treats filler as noise", () => {
    const { cleanScribeOutput, cleanTranscript, shouldScribeIntoFocus } = require("../electron/netie/scribe");
    assert.strictEqual(
      cleanScribeOutput("<THINK>private</THINK>\n\nHello\nWorld\n<think>more</think>"),
      "Hello\nWorld"
    );
    assert.strictEqual(cleanTranscript("um hello you know world"), "hello world");
    assert.strictEqual(
      shouldScribeIntoFocus({ mode: "scribe", source: "mic", text: "rewrite this", gated: true }),
      true
    );
    assert.strictEqual(
      shouldScribeIntoFocus({ mode: "transcribe", source: "mic", text: "rewrite this", gated: true }),
      false
    );
  });

  await test("delivery skips Pointer chrome and pastes into a remembered hwnd", () => {
    const {
      snapshotTarget,
      isPointerChrome,
      deliverTextActions,
      publicTarget,
    } = require("../electron/netie/delivery");
    assert.strictEqual(isPointerChrome({ title: "Netie Pointer HUD" }), true);
    assert.strictEqual(snapshotTarget({ title: "Netie Pointer HUD", hwnd: "1" }).ok, false);
    const snap = snapshotTarget({ hwnd: "12345", title: "Untitled - Notepad", proc: "notepad" });
    assert.strictEqual(snap.ok, true);
    const plan = deliverTextActions("hello", { target: snap });
    assert.strictEqual(plan.actions[0].type, "focus_hwnd");
    assert.strictEqual(plan.actions[0].hwnd, "12345");
    assert.strictEqual(plan.actions[1].type, "clipboard_paste");
    assert.strictEqual(publicTarget(snap).hwnd, true);
    const { parseWindowSourceHwnd, pickWindowSource } = require("../electron/netie/delivery");
    assert.strictEqual(parseWindowSourceHwnd("window:12345:0"), "12345");
    const picked = pickWindowSource(
      [
        { id: "window:1:0", name: "Netie Pointer HUD" },
        { id: "window:12345:0", name: "Untitled - Notepad" },
        { id: "screen:0:0", name: "Entire Screen" },
      ],
      snap
    );
    assert.strictEqual(picked.id, "window:12345:0");
    assert.strictEqual(
      pickWindowSource([{ id: "window:1:0", name: "Netie Pointer HUD" }], snap),
      null
    );
    const byTitle = pickWindowSource(
      [{ id: "window:77:0", name: "Report - Word" }],
      { hwnd: "0", title: "Word" }
    );
    assert.strictEqual(byTitle.id, "window:77:0");
  });

  await test("deliver: instruction restores the remembered hwnd then pastes", () => {
    const { planFromInstruction } = require("../electron/netie/computer-act");
    const plan = planFromInstruction("deliver: hello agent", {
      target: { hwnd: "99", title: "Notepad" },
    });
    assert.strictEqual(plan.ok, true);
    assert.strictEqual(plan.source, "deliver");
    assert.strictEqual(plan.actions[0].type, "focus_hwnd");
    assert.strictEqual(plan.actions[0].hwnd, "99");
    assert.strictEqual(plan.actions[1].type, "clipboard_paste");
    assert.strictEqual(plan.actions[1].value, "hello agent");
  });

  await test("replace: backspaces then pastes into the remembered hwnd", () => {
    const { planFromInstruction } = require("../electron/netie/computer-act");
    const plan = planFromInstruction("replace: 你好", {
      target: { hwnd: "55", title: "Notepad" },
    });
    assert.strictEqual(plan.ok, true);
    assert.strictEqual(plan.source, "replace");
    assert.strictEqual(plan.actions[0].type, "focus_hwnd");
    assert.strictEqual(plan.actions[1].type, "press");
    assert.strictEqual(plan.actions[1].value, "backspace");
    assert.strictEqual(plan.actions[2].type, "clipboard_paste");
    assert.strictEqual(plan.actions[2].value, "你好");
  });

  await test("computer.scribe refuses without a Cortex gate", async () => {
    const { runComputerScribe } = require("../electron/netie/scribe");
    const r = await runComputerScribe({ instruction: "make this formal" }, {});
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.blocked, true);
  });

  await test("computer.scribe rewrites after a green gate and can skip deliver", async () => {
    const {
      runComputerScribe,
      nextScribeLanguage,
      normalizeScribeLanguage,
      sttLanguageCode,
      SCRIBE_LANGUAGES,
      HOTKEY_LANGUAGES,
    } = require("../electron/netie/scribe");
    assert.strictEqual(SCRIBE_LANGUAGES.length, 12);
    assert.ok(SCRIBE_LANGUAGES.includes("Spanish"));
    assert.deepStrictEqual([...HOTKEY_LANGUAGES], ["English", "Traditional Chinese"]);
    assert.strictEqual(normalizeScribeLanguage("zh-TW"), "Traditional Chinese");
    assert.strictEqual(normalizeScribeLanguage("es"), "Spanish");
    assert.strictEqual(normalizeScribeLanguage("es-MX"), "Spanish");
    assert.strictEqual(normalizeScribeLanguage("Portuguese"), "Portuguese");
    assert.strictEqual(normalizeScribeLanguage("pt-BR"), "Portuguese");
    assert.notStrictEqual(normalizeScribeLanguage("Portuguese"), "Spanish");
    assert.strictEqual(sttLanguageCode("English"), "auto");
    assert.strictEqual(sttLanguageCode("Traditional Chinese"), "zh");
    assert.strictEqual(sttLanguageCode("Spanish"), "es");
    assert.strictEqual(sttLanguageCode("Portuguese"), "pt");
    assert.strictEqual(nextScribeLanguage("English"), "Traditional Chinese");
    assert.strictEqual(nextScribeLanguage("Traditional Chinese"), "English");
    assert.strictEqual(nextScribeLanguage("Spanish"), "English");
    const r = await runComputerScribe(
      { instruction: "make this formal", selectedText: "hey" },
      {
        secure: async () => ({ ok: true }),
        language: "Traditional Chinese",
        scribeInstruction: "Turn this into a professional email.",
        complete: async (req) => {
          assert.match(req.user, /Traditional Chinese/);
          assert.match(req.user, /hey/);
          assert.match(req.user, /SCRIBE INSTRUCTION:\nTurn this into a professional email\./);
          assert.match(req.user, /USER INSTRUCTION:\nmake this formal/);
          return { text: "Hello" };
        },
      }
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.gated, true);
    assert.strictEqual(r.text, "Hello");
    assert.strictEqual(r.delivered, false);
  });

  await test("pending scribe keeps the transcript for retry or raw paste", () => {
    const { createPendingScribe } = require("../electron/netie/pending-scribe");
    const store = createPendingScribe();
    assert.strictEqual(store.public().present, false);
    const saved = store.save({
      transcript: "make this a polite email",
      target: { hwnd: "42", title: "Notepad" },
      reason: "no Cortex /dms/secure gate",
    });
    assert.strictEqual(saved.ok, true);
    assert.strictEqual(store.public().present, true);
    assert.strictEqual(store.public().hwnd, true);
    assert.match(store.transcript().text, /polite email/);
    assert.match(store.transcript().note, /untrusted/);
    const taken = store.take();
    assert.strictEqual(taken.hwnd, "42");
    assert.strictEqual(store.public().present, false);
    assert.strictEqual(store.save({ transcript: "" }).ok, false);
  });

  await test("MCP computer.scribe and meeting_assist refuse without runners", async () => {
    const mcp = createMcpAbi();
    const scribe = await mcp.handle({
      jsonrpc: "2.0",
      id: 21,
      method: "computer.scribe",
      params: { instruction: "rewrite this" },
    });
    assert.ok(scribe.error);
    assert.match(scribe.error.message, /dms\/secure|gate/i);
    const meeting = await mcp.handle({
      jsonrpc: "2.0",
      id: 22,
      method: "computer.meeting_assist",
      params: { notes: "ship Friday" },
    });
    assert.ok(meeting.error);
    assert.match(meeting.error.message, /dms\/secure|gate/i);
  });

  await test("MCP computer.scribe runs when gated", async () => {
    const { runComputerScribe } = require("../electron/netie/scribe");
    const mcp = createMcpAbi({
      scribe: (params) =>
        runComputerScribe(params, {
          secure: async () => ({ ok: true }),
          complete: async () => ({ text: "Drafted note" }),
        }),
    });
    const r = await mcp.handle({
      jsonrpc: "2.0",
      id: 23,
      method: "computer.scribe",
      params: { instruction: "compose a note" },
    });
    assert.ok(r.result);
    assert.strictEqual(r.result.ok, true);
    assert.strictEqual(r.result.text, "Drafted note");
  });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
