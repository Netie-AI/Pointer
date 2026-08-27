"use strict";
/**
 * Pointer #29 - HUD report-a-problem control must exist on the painted chrome.
 *
 * AirGPT already has `#bugReportBtn` / `startBugReport` / "Report a problem".
 * Pointer HUD on main had zero matches, so a real-use Word sink had no in-app
 * way to mark it. This gate fails if the control disappears, if it is buried
 * in Settings, if it ships `hidden`, or if the local flow auto-sends off-box.
 *
 * Asserts source the founder can see (R-0001): top-bar button text, not a
 * settings-only label. Electron smoke is a separate lane; this file is the
 * node invariant that CI runs without booting the app.
 *
 * Run: node test/invariants/hud-bug-report.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const html = read("electron/hud.html");
const css = read("electron/hud.css");
const hud = read("electron/hud.js");
const modSrc = read("electron/netie/bug-report.js");
const bugReport = require("../../electron/netie/bug-report");

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle);
  assert.ok(start >= 0, `missing ${startNeedle}`);
  assert.ok(end > start, `missing ${endNeedle} after ${startNeedle}`);
  return source.slice(start, end);
}

check("the painted HUD names Report a problem on #bugReportBtn", () => {
  assert.ok(/id="bugReportBtn"/.test(html), "hud.html lost id=bugReportBtn");
  const btn = html.match(/<button[^>]*id="bugReportBtn"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(btn, "bugReportBtn is not a <button>");
  assert.ok(
    />[\s\S]*Report a problem[\s\S]*</.test(btn[0]),
    "the founder-facing label Report a problem is gone from the button"
  );
  assert.ok(
    /aria-label="Report a problem"/.test(btn[0]),
    "aria-label Report a problem missing"
  );
  assert.ok(!/\bhidden\b/.test(btn[0]), "bugReportBtn ships hidden - the founder cannot see it");
});

check("the control lives in top chrome, not Settings", () => {
  const top = sliceBetween(html, 'id="top-bar"', 'id="subtitle-bar"');
  assert.ok(/id="bugReportBtn"/.test(top), "bugReportBtn is not in the top bar");
  const between = sliceBetween(html, 'id="settings-menu"', 'id="bugReportBtn"');
  const opens = (between.match(/<div\b/g) || []).length;
  const closes = (between.match(/<\/div>/g) || []).length;
  assert.ok(
    closes > opens,
    `bugReportBtn is still inside settings/menu markup (div open=${opens} close=${closes})`
  );
});

check("startBugReport exists and the button calls it", () => {
  assert.ok(typeof bugReport.startBugReport === "function", "module lost startBugReport");
  assert.strictEqual(bugReport.startBugReport().send, false, "startBugReport must not send");
  assert.ok(/function startBugReport\(/.test(hud), "hud.js lost startBugReport");
  assert.ok(
    /bugReportBtn[\s\S]{0,200}startBugReport/.test(hud),
    "the HUD button is not wired to startBugReport"
  );
});

check("a local form copies diagnostics only after confirm", () => {
  assert.ok(/id="bug-report-panel"/.test(html), "the local form is gone");
  assert.ok(
    /<form[^>]*id="bug-report-panel"[^>]*\bhidden\b/.test(html),
    "the form must start hidden so it is not in the way at boot"
  );
  assert.ok(/id="btn-bug-copy"/.test(html), "Copy diagnostics control missing");
  assert.ok(/Copy diagnostics/.test(html), "Copy diagnostics label missing");
  assert.ok(/confirmCopyBugReport/.test(hud), "hud.js lost the confirm-copy path");
  assert.ok(
    /copyDiagnostics\([^)]*confirmed:\s*true/.test(hud),
    "copy must pass confirmed:true from a human click"
  );
});

check("nothing in the report flow auto-sends off-box", () => {
  const surfaces = [modSrc, hud];
  for (const src of surfaces) {
    const code = src.replace(/^\s*(\/\/).*$/gm, "");
    assert.ok(!/\bfetch\s*\(/.test(code), "report flow must not fetch");
    assert.ok(!/mailto:/i.test(code), "report flow must not open mailto");
    assert.ok(!/XMLHttpRequest/.test(code), "report flow must not XHR");
    assert.ok(!/WebSocket/.test(code), "report flow must not open a socket");
  }
  const form = html.match(/<form[^>]*id="bug-report-panel"[^>]*>/);
  assert.ok(form, "form tag missing");
  assert.ok(!/\baction\s*=/.test(form[0]), "the form must not have an action URL");
});

check("copyDiagnostics is fail-closed without human confirm", () => {
  const text = bugReport.buildDiagnostics({
    when: "2026-08-27T00:00:00.000Z",
    version: "0.1.0",
    mode: "agent",
    platform: "Win32",
    note: "recovered selection landed in Documents",
  });
  assert.ok(/Netie Pointer/.test(text));
  assert.ok(/recovered selection/.test(text));
  assert.ok(!/Authorization|Bearer |api[_-]?key/i.test(text));
  const refused = bugReport.copyDiagnostics(text, {});
  assert.strictEqual(refused.ok, false);
  assert.strictEqual(refused.blocked, "unconfirmed");
  assert.strictEqual(refused.send, false);
  const allowed = bugReport.copyDiagnostics(text, { confirmed: true });
  assert.strictEqual(allowed.ok, true);
  assert.strictEqual(allowed.send, false);
  assert.strictEqual(allowed.text, text);
});

check("CSS does not hide the control, and [hidden] still wins for the form", () => {
  assert.ok(
    !/#bugReportBtn[^{]*\{[^}]*display:\s*none/.test(css),
    "#bugReportBtn is display:none in CSS - the founder cannot see it"
  );
  assert.ok(
    /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css),
    "[hidden] !important is gone - the form will paint while claimed hidden"
  );
});

check("hud.html loads bug-report.js before hud.js", () => {
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const mod = scripts.indexOf("netie/bug-report.js");
  const renderer = scripts.indexOf("hud.js");
  assert.ok(mod >= 0, "hud.html does not load netie/bug-report.js");
  assert.ok(renderer > mod, "bug-report.js must load before hud.js");
});

check("this gate fails if the button is deleted (the test can actually fail)", () => {
  const stripped = html.replace(/id="bugReportBtn"/g, 'id="goneReportBtn"');
  assert.ok(
    !/id="bugReportBtn"/.test(stripped),
    "the mutation did not remove the control - the failure case is broken"
  );
  assert.throws(
    () => assert.ok(/id="bugReportBtn"/.test(stripped), "missing"),
    /missing/,
    "assert.ok would not fire if the control disappeared"
  );
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nhud-bug-report: all passed");
