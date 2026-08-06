"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-docx-"));
// The coworker only writes inside its sanctioned root (#15). Point that root at
// this test's scratch dir before requiring the module, so these writes are the
// legitimate case rather than the contained-out case — the refusal corpus lives
// in test/safe-path.test.js.
process.env.NETIE_WORD_OUT_DIR = tmp;

const { writeDocx, clipboardMatchesSource } = require("../electron/netie/word-coworker");
const { InputDriver } = require("../electron/netie/driver");

const out = path.join(tmp, "sample.docx");

const dry = writeDocx({ text: "Hello Pointer\nLine 2", path: out, dryRun: true });
assert.strictEqual(dry.dryRun, true);
assert.ok(dry.bytes > 100);
assert.ok(!fs.existsSync(out), "dry-run must not write");

const written = writeDocx({ text: "Hello Pointer\nLine 2", path: out });
assert.ok(fs.existsSync(out));
assert.strictEqual(written.bytes, fs.statSync(out).size);
assert.ok(written.sha256);

const zipMagic = fs.readFileSync(out).subarray(0, 2).toString("binary");
assert.strictEqual(zipMagic, "PK", "docx is a zip");

// ---------------------------------------------------------------------- #14 --
// "It starts with PK" was the ENTIRE correctness assertion on the generated
// document, and it passed happily for a file Word refuses to open. KB R-0001:
// assert on the artifact the customer receives, at the layer they receive it -
// so unzip the package, pull `word/document.xml` back out, and read it.

const zlib = require("zlib");

/**
 * Extract one entry from a zip. Walks the central directory rather than
 * scanning for local headers, so it reads the same structure Word does.
 * stdlib only - `zlib.inflateRawSync` is the mirror of the `deflateRawSync`
 * the module already writes with.
 */
function unzipEntry(buf, wanted) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, "no end-of-central-directory record - not a zip");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i += 1) {
    assert.strictEqual(buf.readUInt32LE(p), 0x02014b50, "bad central directory signature");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (name === wanted) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compSize);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} not found in the package`);
}

/** Pull the paragraph text back out, so a round-trip can be compared. */
function docxText(buf) {
  const xml = unzipEntry(buf, "word/document.xml").toString("utf8");
  const paras = [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) =>
    m[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
  );
  return { xml, text: paras.join("\n") };
}

/** The characters XML 1.0 forbids. If any survives, Word will not open it. */
const XML_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

const CORPUS = [
  { name: "ANSI escape sequences (the terminal_to_word case)", input: "a \u001B[32mPASS\u001B[0m b", expect: "a [32mPASS[0m b" },
  { name: "other forbidden control characters", input: "x\u0000y\u0008z\u000Bw\u001Fv", expect: "xyzwv" },
  { name: "XML metacharacters", input: `a & b < c > d "e" 'f' &amp; &#x1B;`, expect: `a & b < c > d "e" 'f' &amp; &#x1B;` },
  { name: "non-ASCII including CJK", input: "hello 你好 café åäö", expect: "hello 你好 café åäö" },
  { name: "empty input", input: "", expect: "" },
  { name: "multi-line with tabs preserved", input: "one\n\ttwo\nthree", expect: "one\n\ttwo\nthree" },
  { name: "an emoji (surrogate pair must survive intact)", input: "ship it \u{1F680}", expect: "ship it \u{1F680}" },
];

for (const c of CORPUS) {
  const p = path.join(tmp, `corpus-${CORPUS.indexOf(c)}.docx`);
  const r = writeDocx({ text: c.input, path: p });
  assert.strictEqual(r.ok, true, `${c.name}: write refused - ${r.reason}`);
  const { xml, text } = docxText(fs.readFileSync(p));

  assert.ok(!XML_FORBIDDEN.test(xml), `${c.name}: an XML-forbidden character reached document.xml`);
  assert.ok(xml.startsWith("<?xml"), `${c.name}: document.xml lost its declaration`);
  assert.ok(/<w:document[\s>]/.test(xml), `${c.name}: no w:document root`);
  // Every opened tag closes - a cheap well-formedness proxy; the REAL parser
  // check runs against a booted DOMParser in test/smoke/ipc-live.smoke.js.
  const opens = (xml.match(/<w:p>/g) || []).length;
  const closes = (xml.match(/<\/w:p>/g) || []).length;
  assert.strictEqual(opens, closes, `${c.name}: unbalanced <w:p> tags`);
  assert.strictEqual(text, c.expect, `${c.name}: text did not round-trip`);
}

// The production dry-run path: no explicit `path`, so `defaultDocxPath()` runs.
// Every earlier test passed an explicit path, so this branch had never executed.
{
  const probe = path.join(tmp, "dry-run-probe");
  process.env.NETIE_WORD_OUT_DIR = probe;
  assert.ok(!fs.existsSync(probe), "probe dir should not exist yet");
  const before = fs.readdirSync(tmp).sort();
  const r = writeDocx({ text: "nothing should be written", dryRun: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.dryRun, true);
  assert.ok(r.path.startsWith(probe), "dry run must still report where it would land");
  assert.ok(r.bytes > 100, "dry run must still report the resulting size");
  assert.ok(!fs.existsSync(probe), "dry-run created the output directory");
  assert.ok(!fs.existsSync(r.path), "dry-run wrote the file");
  assert.deepStrictEqual(fs.readdirSync(tmp).sort(), before, "dry-run modified the filesystem");
  process.env.NETIE_WORD_OUT_DIR = tmp;
}

console.log("PASS word-coworker: document.xml round-trips the corpus and dry-run touches nothing");

assert.strictEqual(clipboardMatchesSource("abc", "abc").ok, true);
assert.strictEqual(clipboardMatchesSource("abcdef", "ab").ok, false);

const driver = new InputDriver({ dryRun: true });
(async () => {
  const r = await driver.perform({ type: "word_docx_write", value: "via driver", path: path.join(tmp, "drv.docx") });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.dryRun, true);

  // The driver must surface the containment refusal rather than reporting a
  // step that quietly did nothing (KB R-0011).
  const refused = await driver.perform({
    type: "word_docx_write",
    value: "escape",
    path: path.join(os.tmpdir(), "pointer-outside.docx"),
  });
  assert.strictEqual(refused.ok, false, "driver must surface the refusal");
  assert.ok(refused.reason, "refusal must reach the driver result");

  console.log("PASS word-coworker writeDocx + dry-run driver");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
