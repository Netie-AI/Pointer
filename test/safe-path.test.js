"use strict";
/**
 * Path containment corpus — EPIC-P02 tickets #15 (write anywhere) and #19
 * (execute anything). Both defects are the same root cause class: a path that
 * came from outside the trust boundary was used without being resolved and
 * compared against a sanctioned root (KB R-0004 — fix the class, not the
 * caller), so they share one resolver and one test file.
 *
 * R-0005 is the other half of every assertion here: the legitimate paths MUST
 * still pass. A containment rule that breaks "Open in Explorer" or the ordinary
 * no-path coworker flow is a failed control, not a win.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-contain-"));
const SANCTIONED = path.join(sandbox, "NetiePointer");
const OUTSIDE = path.join(sandbox, "elsewhere");
// The classic prefix-test escape: shares the sanctioned prefix, is not inside it.
const SIBLING = path.join(sandbox, "NetiePointer-evil");
for (const dir of [SANCTIONED, OUTSIDE, SIBLING]) fs.mkdirSync(dir, { recursive: true });

// NETIE_WORD_OUT_DIR is the sanctioned root for the coworker; set it before the
// module is required so the default path and the containment root agree.
process.env.NETIE_WORD_OUT_DIR = SANCTIONED;

const {
  canonical,
  isContained,
  containPath,
  isExecutableExt,
  classifyOpen,
} = require("../electron/netie/safe-path");
const { writeDocx } = require("../electron/netie/word-coworker");
const { decide } = require("../electron/netie/safety");

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

// ---------------------------------------------------------------- resolver --

check("canonical resolves .. before comparing", () => {
  const traversal = path.join(SANCTIONED, "..", "elsewhere", "x.docx");
  assert.strictEqual(canonical(traversal), canonical(path.join(OUTSIDE, "x.docx")));
});

check("a sibling sharing the sanctioned prefix is outside it", () => {
  assert.strictEqual(isContained(path.join(SIBLING, "x.docx"), SANCTIONED), false);
});

check("a path inside the sanctioned root is contained", () => {
  assert.strictEqual(isContained(path.join(SANCTIONED, "deep", "x.docx"), SANCTIONED), true);
});

check("the root itself is contained in itself", () => {
  assert.strictEqual(isContained(SANCTIONED, SANCTIONED), true);
});

check("containment is case-insensitive on Windows only", () => {
  const upper = SANCTIONED.toUpperCase();
  const expected = process.platform === "win32";
  assert.strictEqual(isContained(path.join(upper, "x.docx"), SANCTIONED), expected);
});

check("UNC paths are refused outright", () => {
  const r = containPath("\\\\server\\share\\x.docx", [SANCTIONED]);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /UNC/i);
});

check("alternate data streams are refused", () => {
  const r = containPath(`${path.join(SANCTIONED, "x.docx")}:evil`, [SANCTIONED]);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /stream/i);
});

check("a refusal names the rejected path", () => {
  const bad = path.join(OUTSIDE, "x.docx");
  const r = containPath(bad, [SANCTIONED]);
  assert.strictEqual(r.ok, false);
  // canonical() lowercases on Windows, so compare the way the filesystem does.
  assert.ok(r.reason.toLowerCase().includes(canonical(bad)), "reason must name the path");
});

// ------------------------------------------------------- #15 docx writes ----

check("writeDocx refuses a path outside the sanctioned root", () => {
  const target = path.join(OUTSIDE, "escape.docx");
  fs.writeFileSync(target, "ORIGINAL");
  const r = writeDocx({ text: "overwritten", path: target });
  assert.strictEqual(r.ok, false, "write outside the root must be refused");
  assert.ok(r.reason, "refusal must carry a reason");
  assert.strictEqual(fs.readFileSync(target, "utf8"), "ORIGINAL", "original must survive");
});

check("writeDocx refuses traversal out of the sanctioned root", () => {
  const r = writeDocx({ text: "x", path: path.join(SANCTIONED, "..", "elsewhere", "t.docx") });
  assert.strictEqual(r.ok, false);
});

check("writeDocx refuses a sibling that shares the prefix", () => {
  const r = writeDocx({ text: "x", path: path.join(SIBLING, "t.docx") });
  assert.strictEqual(r.ok, false);
});

check("writeDocx refuses a UNC destination", () => {
  const r = writeDocx({ text: "x", path: "\\\\evil\\share\\t.docx" });
  assert.strictEqual(r.ok, false);
});

check("R-0005: the ordinary no-path coworker flow still writes", () => {
  const r = writeDocx({ text: "legit", stem: "ok" });
  assert.strictEqual(r.ok, true, "default path must still succeed");
  assert.ok(fs.existsSync(r.path));
});

check("R-0005: an explicit path INSIDE the sanctioned root still writes", () => {
  const target = path.join(SANCTIONED, "inside.docx");
  const r = writeDocx({ text: "legit", path: target });
  assert.strictEqual(r.ok, true);
  assert.ok(fs.existsSync(target));
});

check("dry-run refusal still does not touch disk", () => {
  const target = path.join(OUTSIDE, "dry.docx");
  const r = writeDocx({ text: "x", path: target, dryRun: true });
  assert.strictEqual(r.ok, false);
  assert.ok(!fs.existsSync(target));
});

// ------------------------------------------------- #15 classification -------

check("an explicit destination path is never auto-runnable", () => {
  for (const type of ["word_docx_write", "word_from_clipboard"]) {
    const d = decide({ type, path: path.join(SANCTIONED, "x.docx") }, { autoRunSensible: true });
    assert.notStrictEqual(d.disposition, "auto", `${type} with a path must not auto-run`);
  }
});

check("R-0005: no explicit path stays auto-runnable (contained by construction)", () => {
  const d = decide({ type: "word_docx_write", value: "hi" }, { autoRunSensible: true });
  assert.strictEqual(d.disposition, "auto");
});

// ----------------------------------------------------------- #19 opening ----

check("executable and script extensions are refused inside the root", () => {
  for (const ext of [".exe", ".bat", ".cmd", ".ps1", ".lnk", ".msi", ".scr", ".com", ".vbs", ".js", ".jar", ".hta", ".reg"]) {
    const p = path.join(SANCTIONED, `payload${ext}`);
    fs.writeFileSync(p, "x");
    const r = classifyOpen(p, [SANCTIONED]);
    assert.strictEqual(r.ok, false, `${ext} must be refused`);
    assert.ok(isExecutableExt(ext), `${ext} must be known executable`);
  }
});

check("an unlisted extension defaults to refuse", () => {
  const p = path.join(SANCTIONED, "thing.wacky");
  fs.writeFileSync(p, "x");
  assert.strictEqual(classifyOpen(p, [SANCTIONED]).ok, false);
});

check("a viewable file inside the root opens", () => {
  const p = path.join(SANCTIONED, "doc.docx");
  fs.writeFileSync(p, "x");
  const r = classifyOpen(p, [SANCTIONED]);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mode, "open");
});

check("a viewable file OUTSIDE every root is refused", () => {
  const p = path.join(OUTSIDE, "doc.docx");
  fs.writeFileSync(p, "x");
  const r = classifyOpen(p, [SANCTIONED]);
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason.includes(canonical(p)) || r.reason.includes(p));
});

check("R-0005: a directory under a sanctioned root still opens in Explorer", () => {
  const dir = path.join(SANCTIONED, "recall");
  fs.mkdirSync(dir, { recursive: true });
  const r = classifyOpen(dir, [SANCTIONED]);
  assert.strictEqual(r.ok, true, "Open in Explorer must keep working");
  assert.strictEqual(r.mode, "open");
});

check("a directory outside every root is refused", () => {
  assert.strictEqual(classifyOpen(OUTSIDE, [SANCTIONED]).ok, false);
});

check("a missing path is refused rather than opened", () => {
  assert.strictEqual(classifyOpen(path.join(SANCTIONED, "nope.docx"), [SANCTIONED]).ok, false);
});

check("classifyOpen describes the destination for the confirmation", () => {
  const p = path.join(SANCTIONED, "doc.docx");
  const r = classifyOpen(p, [SANCTIONED]);
  assert.ok(r.display && r.display.length, "must give the customer something to read");
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nsafe-path: all passed");
