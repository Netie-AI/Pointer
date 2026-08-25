"use strict";
/**
 * Tests must not write Word fixtures into the customer sink (R-0001 / R-0002).
 *
 * Live laptop 22 Aug 2026: C:\Users\OoiJianHong\Documents\NetiePointer\
 * from-clipboard-1787382254896.docx body was exactly "recovered selection",
 * the retry fixture at test/clipboard-integrity.test.js:121 (af25bb0).
 * sanctionedRoot (word-coworker.js:133-141 on that commit) defaulted to
 * Documents\NetiePointer because NETIE_WORD_OUT_DIR was unset. The suite
 * asserted only r.ok.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const {
  writeDocx,
  zipRead,
  customerWordRoot,
  isTestProcess,
} = require("../../electron/netie/word-coworker");

function fromClipboardNames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n.startsWith("from-clipboard-") && n.endsWith(".docx")).sort();
}

function docxBody(file) {
  const pkg = zipRead(fs.readFileSync(file));
  assert.strictEqual(pkg.ok, true, pkg.reason);
  const doc = pkg.entries.find((e) => e.name === "word/document.xml");
  return [...doc.data.toString("utf8").matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => m[1])
    .join("\n");
}

function walkJs(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkJs(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

assert.strictEqual(isTestProcess(), true, "this file must count as a test process");

{
  const customer = customerWordRoot();
  const before = fromClipboardNames(customer);
  const prev = process.env.NETIE_WORD_OUT_DIR;
  delete process.env.NETIE_WORD_OUT_DIR;
  const r = writeDocx({ text: "recovered selection", stem: "from-clipboard" });
  if (prev === undefined) delete process.env.NETIE_WORD_OUT_DIR;
  else process.env.NETIE_WORD_OUT_DIR = prev;
  assert.strictEqual(r.ok, false, "uncontained test write was accepted");
  assert.ok(/NETIE_WORD_OUT_DIR/.test(r.reason), `unhelpful reason: ${r.reason}`);
  assert.deepStrictEqual(
    fromClipboardNames(customer),
    before,
    "an uncontained test write created a from-clipboard-*.docx in the customer Word folder"
  );
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-word-sink-"));
  process.env.NETIE_WORD_OUT_DIR = dir;
  const r = writeDocx({ text: "recovered selection", stem: "from-clipboard" });
  assert.strictEqual(r.ok, true, `contained write refused: ${r.reason}`);
  assert.ok(r.path.startsWith(dir), `wrote outside the test sink: ${r.path}`);
  assert.ok(!r.path.startsWith(customerWordRoot()), `wrote into the customer sink: ${r.path}`);
  assert.strictEqual(docxBody(r.path), "recovered selection");
}

{
  const files = walkJs(path.join(ROOT, "test"));
  const offenders = [];
  for (const file of files) {
    if (path.basename(file) === "word-sink.test.js") continue;
    const src = fs.readFileSync(file, "utf8");
    if (!/writeDocx\s*\(|appendDocx\s*\(|type:\s*["']word_from_clipboard["']/.test(src)) continue;
    if (!/NETIE_WORD_OUT_DIR/.test(src)) {
      offenders.push(path.relative(ROOT, file).replace(/\\/g, "/"));
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    "these suites write a .docx without naming NETIE_WORD_OUT_DIR, so they can hit the customer sink: " +
      offenders.join(", ")
  );
}

console.log("PASS word-sink: uncontained test writes refuse; fixture stays out of Documents/NetiePointer");
