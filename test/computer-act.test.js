"use strict";
const assert = require("assert");
const { shouldDictateIntoFocus, dictateSecureGoal } = require("../electron/netie/dictate");
const { buildScribeRequest } = require("../electron/netie/scribe");
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

  await test("computer.scribe refuses without a Cortex gate", async () => {
    const { runComputerScribe } = require("../electron/netie/scribe");
    const r = await runComputerScribe({ instruction: "make this formal" }, {});
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.blocked, true);
  });

  await test("computer.scribe rewrites after a green gate and can skip deliver", async () => {
    const { runComputerScribe, nextScribeLanguage, normalizeScribeLanguage } = require("../electron/netie/scribe");
    assert.strictEqual(normalizeScribeLanguage("zh-TW"), "Traditional Chinese");
    assert.strictEqual(nextScribeLanguage("English"), "Traditional Chinese");
    assert.strictEqual(nextScribeLanguage("Traditional Chinese"), "English");
    const r = await runComputerScribe(
      { instruction: "make this formal", selectedText: "hey" },
      {
        secure: async () => ({ ok: true }),
        language: "Traditional Chinese",
        complete: async (req) => {
          assert.match(req.user, /Traditional Chinese/);
          assert.match(req.user, /hey/);
          return { text: "Hello" };
        },
      }
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.gated, true);
    assert.strictEqual(r.text, "Hello");
    assert.strictEqual(r.delivered, false);
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
