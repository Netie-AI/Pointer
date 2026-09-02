"use strict";
const assert = require("assert");
const {
  CLAUDE_WINDOW_MS,
  extractUsage,
  addUsage,
  formatTokens,
  emptyClaudeRoute,
  markClaudeSession,
  markClaudeExhausted,
  claudeWindowOpen,
  remainingMs,
  wantsCodingApp,
  isRoutingCommand,
  pickCodingApp,
  publicRoute,
  resolveCodingRoute,
} = require("../electron/netie/agent-route");

let pass = 0;
const fails = [];
function test(name, fn) {
  try {
    fn();
    pass += 1;
    console.log("PASS " + name);
  } catch (err) {
    fails.push(name);
    console.log("FAIL " + name + " -- " + err.message);
  }
}

test("extractUsage reads OpenAI-shaped totals", () => {
  assert.deepStrictEqual(
    extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } }),
    { prompt: 10, completion: 4, total: 14 }
  );
  assert.deepStrictEqual(extractUsage("not json"), { prompt: 0, completion: 0, total: 0 });
  assert.deepStrictEqual(
    extractUsage(JSON.stringify({ usage: { promptTokens: 2, completionTokens: 3 } })),
    { prompt: 2, completion: 3, total: 5 }
  );
});

test("addUsage caps and keeps lastTotal", () => {
  const next = addUsage({ prompt: 1, completion: 1, total: 2 }, { prompt: 3, completion: 4, total: 7 });
  assert.strictEqual(next.prompt, 4);
  assert.strictEqual(next.completion, 5);
  assert.strictEqual(next.total, 9);
  assert.strictEqual(next.lastTotal, 7);
  assert.strictEqual(formatTokens(1500), "1.5k");
});

test("Claude window prefers Claude until exhausted or elapsed", () => {
  const t0 = 1_000_000;
  const fresh = emptyClaudeRoute();
  assert.strictEqual(claudeWindowOpen(fresh, t0), true);
  assert.strictEqual(remainingMs(fresh, t0), CLAUDE_WINDOW_MS);
  const started = markClaudeSession(fresh, t0);
  assert.strictEqual(claudeWindowOpen(started, t0 + 60_000), true);
  assert.strictEqual(claudeWindowOpen(started, t0 + CLAUDE_WINDOW_MS), false);
  const used = markClaudeExhausted(started, t0 + 90_000);
  assert.strictEqual(claudeWindowOpen(used, t0 + 90_000), false);
  assert.strictEqual(claudeWindowOpen(used, t0 + CLAUDE_WINDOW_MS), true);
  const refreshed = markClaudeSession(used, t0 + CLAUDE_WINDOW_MS);
  assert.strictEqual(refreshed.startedAt, t0 + CLAUDE_WINDOW_MS);
  assert.strictEqual(refreshed.exhausted, false);
});

test("instruction wins: use Claude / use Cursor", () => {
  const t0 = 5_000;
  assert.deepStrictEqual(pickCodingApp("use Claude", emptyClaudeRoute(), t0).app, "claude");
  assert.deepStrictEqual(pickCodingApp("open Cursor", emptyClaudeRoute(), t0).app, "cursor");
  assert.strictEqual(pickCodingApp("use Claude please", emptyClaudeRoute(), t0).reason, "instruction");
});

test("5-hour limit routes to Cursor and marks exhausted", () => {
  const hit = pickCodingApp("the 5-hour limit is done", emptyClaudeRoute(), 10);
  assert.strictEqual(hit.app, "cursor");
  assert.strictEqual(hit.reason, "claude-limit");
  assert.strictEqual(hit.markExhausted, true);
  const alt = pickCodingApp("five hour limit used, go to Cursor", emptyClaudeRoute(), 10);
  assert.strictEqual(alt.app, "cursor");
  assert.strictEqual(alt.markExhausted, true);
});

test("use Claude falls back to Cursor when the window is closed", () => {
  const t0 = 1_000;
  const used = markClaudeExhausted(markClaudeSession(emptyClaudeRoute(), t0), t0 + 1);
  const pick = pickCodingApp("use Claude", used, t0 + 1);
  assert.strictEqual(pick.app, "cursor");
  assert.strictEqual(pick.reason, "claude-limit");
});

test("routing commands collapse; build goals keep their text", () => {
  const t0 = 20;
  const open = resolveCodingRoute("use Claude Code", emptyClaudeRoute(), t0);
  assert.strictEqual(open.nextInstruction, "use claude");
  assert.strictEqual(open.routing, true);
  const limit = resolveCodingRoute("5 hour limit is over", emptyClaudeRoute(), t0);
  assert.strictEqual(limit.nextInstruction, "use cursor");
  const build = resolveCodingRoute(
    "implement a python camera app in Claude",
    emptyClaudeRoute(),
    t0
  );
  assert.strictEqual(build.nextInstruction, "implement a python camera app in Claude");
  assert.strictEqual(build.app, "claude");
  assert.strictEqual(isRoutingCommand("copy this in Cursor"), false);
  assert.strictEqual(wantsCodingApp("copy this in Cursor"), true);
  const copy = resolveCodingRoute("copy this in Cursor", emptyClaudeRoute(), t0);
  assert.strictEqual(copy.nextInstruction, "copy this in Cursor");
  assert.strictEqual(copy.app, "cursor");
});

test("non-coding asks do not pick an app", () => {
  const skip = resolveCodingRoute("type: hello", emptyClaudeRoute(), 1);
  assert.strictEqual(skip.app, null);
  assert.strictEqual(skip.nextInstruction, "type: hello");
});

test("publicRoute publishes token totals and window state", () => {
  const t0 = 50;
  const open = publicRoute(emptyClaudeRoute(), { prompt: 10, completion: 5, total: 15 }, t0);
  assert.strictEqual(open.claude, "open");
  assert.strictEqual(open.tokens.total, 15);
  assert.strictEqual(open.tokens.text, "15 tokens");
  const used = publicRoute(markClaudeExhausted(markClaudeSession(emptyClaudeRoute(), t0), t0), { total: 0 }, t0);
  assert.strictEqual(used.claude, "limit");
  assert.strictEqual(used.remainingMs, 0);
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  console.log("FAILURES:\n  " + fails.join("\n  "));
  process.exit(1);
}
