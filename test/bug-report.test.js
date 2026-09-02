"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildReport, writeReport, MAX_NOTE } = require("../electron/netie/bug-report");

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

test("buildReport is local text with mode, session, and a clipped note", () => {
  const r = buildReport({
    note: "  Word wrote recovered selection  ",
    mode: "scribe",
    session: "Ready",
  });
  assert.ok(r.text.includes("Pointer problem report"));
  assert.ok(r.text.includes("mode: scribe"));
  assert.ok(r.text.includes("session: Ready"));
  assert.ok(r.text.includes("note: Word wrote recovered selection"));
  assert.strictEqual(r.noteLen, "Word wrote recovered selection".length);
});

test("buildReport drops newlines in mode/session and clips the note", () => {
  const r = buildReport({
    note: "x".repeat(MAX_NOTE + 40),
    mode: "agent\nopen vault",
    session: "Error\nsecret",
  });
  assert.ok(!r.text.includes("\nopen vault"));
  assert.ok(!r.text.includes("secret"));
  assert.strictEqual(r.noteLen, MAX_NOTE);
  assert.ok(!r.text.includes("x".repeat(MAX_NOTE + 1)));
});

test("writeReport stores a local markdown file and refuses empty", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-report-"));
  const empty = writeReport("  ", { root, id: "aa" });
  assert.strictEqual(empty.ok, false);
  const built = buildReport({ note: "HUD had no report control", mode: "agent" });
  const saved = writeReport(built.text, { root, id: "deadbeef" });
  assert.strictEqual(saved.ok, true);
  assert.strictEqual(path.basename(saved.path), "report-deadbeef.md");
  const body = fs.readFileSync(saved.path, "utf8");
  assert.ok(body.includes("HUD had no report control"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("HUD paints a Report a problem control and a panel, not a settings-only path", () => {
  const html = fs.readFileSync(path.join(__dirname, "../electron/hud.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "../electron/hud.js"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "../electron/hud-preload.js"), "utf8");
  const main = fs.readFileSync(path.join(__dirname, "../electron/main.js"), "utf8");
  assert.ok(html.includes('id="btn-report"'), "control must be on the painted HUD");
  assert.ok(html.includes("Report a problem"), "founder-facing label missing");
  assert.ok(html.includes('id="report-panel"'), "report panel missing");
  assert.ok(html.indexOf('id="btn-report"') < html.indexOf("</header>"), "control must sit in fixed top chrome");
  assert.ok(html.indexOf('id="btn-report"') < html.indexOf('id="btn-hide-top"'), "control sits with the top actions");
  assert.ok(
    !html.slice(html.indexOf('id="settings-menu"'), html.indexOf('id="btn-report"')).includes("btn-report"),
    "control must not live only inside settings"
  );
  assert.ok(/invoke\(\s*"hud:reportProblem"/.test(js), "renderer must start the report");
  assert.ok(preload.includes('"hud:reportProblem"'), "preload must allow the channel");
  assert.ok(/ipcMain\.handle\(\s*"hud:reportProblem"/.test(main), "main must handle the channel");
  assert.ok(
    !/syncFleet/.test(fs.readFileSync(path.join(__dirname, "../electron/netie/bug-report.js"), "utf8")),
    "no cloud relay in the report module"
  );
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
