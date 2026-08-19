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

/**
 * Pull the paragraph text back out, so a round-trip can be compared.
 *
 * The tag match is `<w:t` followed by whitespace-or-close, NOT `<w:t[^>]*>`:
 * real Word documents carry `<w:type w:val="nextPage"/>` inside their section
 * properties, and the looser pattern reads that as a text run and returns
 * markup as if it were the customer's prose (found by the #17 fixtures).
 */
function docxText(buf) {
  const xml = unzipEntry(buf, "word/document.xml").toString("utf8");
  const paras = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) =>
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

// ---------------------------------------------------------------------- #17 --
// Append. Acceptance: paragraphs already in the document survive, a missing
// target is created, and dry-run reports the path and byte length without
// modifying the file. Asserted at the layer the customer receives (KB R-0001) -
// unzip the package and read `word/document.xml` back - never on zip magic.

const crypto = require("crypto");
const { appendDocx, zipRead } = require("../electron/netie/word-coworker");

/**
 * A zip writer that is NOT this module's, using STORE where the module uses
 * DEFLATE. Round-tripping a package written by something else is what separates
 * "the reader parses the format" from "the reader recognises its own output" -
 * and a real .docx from Word is exactly the foreign case.
 */
function foreignCrc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c;
}

function foreignZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, "utf8");
    const crc = foreignCrc32(raw) >>> 0;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // store, not deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(raw.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10); // store
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(raw.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    locals.push(local, raw);
    centrals.push(central);
    offset += local.length + raw.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

function docShell(bodyInner) {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${bodyInner}</w:body></w:document>`
  );
}

const para = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;

// -- the reader round-trips the module's own package -------------------------
{
  const src = path.join(tmp, "roundtrip.docx");
  writeDocx({ text: "alpha", path: src });
  const pkg = zipRead(fs.readFileSync(src));
  assert.strictEqual(pkg.ok, true, `zipRead refused its own writer: ${pkg.reason}`);
  assert.deepStrictEqual(
    pkg.entries.map((e) => e.name),
    ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels"],
    "the reader lost or reordered the parts"
  );
}

// -- appending twice keeps every earlier paragraph ---------------------------
{
  const doc = path.join(tmp, "append-twice.docx");
  writeDocx({ text: "first", path: doc });
  const a = appendDocx({ text: "second", path: doc });
  assert.strictEqual(a.ok, true, `first append refused: ${a.reason}`);
  assert.strictEqual(a.appended, true);
  const b = appendDocx({ text: "third", path: doc });
  assert.strictEqual(b.ok, true, `second append refused: ${b.reason}`);

  const { xml, text } = docxText(fs.readFileSync(doc));
  assert.strictEqual(text, "first\nsecond\nthird", "an earlier paragraph did not survive the append");
  assert.ok(!XML_FORBIDDEN.test(xml), "append smuggled an XML-forbidden character into document.xml");
  // Word treats content after the body-level sectPr as malformed, so the
  // section properties must still be the last child of the body.
  assert.ok(
    /<w:sectPr\s*\/>\s*<\/w:body>/.test(xml),
    "the section properties are no longer the last child of the body"
  );
}

// -- a sectPr INSIDE a paragraph is not the body's ---------------------------
// The body-level sectPr is the last child of w:body, but a paragraph may carry
// its own inside <w:pPr>. Anchoring on "the last <w:sectPr in the string" would
// splice the new text into that paragraph's properties, producing a corrupt
// document whose old text still round-trips - so a text-only assertion would
// pass while Word refused the file. This asserts the position, not just the text.
{
  const doc = path.join(tmp, "para-sectpr.docx");
  const inner =
    para("kept") +
    `<w:p><w:pPr><w:sectPr w:rsidR="00A"><w:type w:val="nextPage"/></w:sectPr></w:pPr>` +
    `<w:r><w:t xml:space="preserve">last</w:t></w:r></w:p>`;
  fs.writeFileSync(doc, foreignZip([
    { name: "[Content_Types].xml", data: "<Types/>" },
    { name: "word/document.xml", data: docShell(inner) },
  ]));

  const r = appendDocx({ text: "added", path: doc });
  assert.strictEqual(r.ok, true, `append refused: ${r.reason}`);
  const { xml, text } = docxText(fs.readFileSync(doc));
  assert.strictEqual(text, "kept\nlast\nadded", "text did not survive the append");
  assert.ok(
    xml.indexOf("added") > xml.lastIndexOf("</w:sectPr>"),
    "the new paragraph was spliced inside a paragraph's own section properties"
  );
}

// -- parts this module never authors survive an append -----------------------
{
  const doc = path.join(tmp, "foreign.docx");
  const styles = `<w:styles><w:style w:styleId="Heading1"/></w:styles>`;
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x7f]);
  fs.writeFileSync(doc, foreignZip([
    { name: "[Content_Types].xml", data: "<Types/>" },
    { name: "word/styles.xml", data: styles },
    { name: "word/media/image1.png", data: image },
    { name: "word/document.xml", data: docShell(para("original")) },
  ]));

  const r = appendDocx({ text: "appended", path: doc });
  assert.strictEqual(r.ok, true, `append refused a foreign package: ${r.reason}`);
  assert.strictEqual(r.parts, 4, "append changed how many parts the package has");

  const after = fs.readFileSync(doc);
  assert.strictEqual(docxText(after).text, "original\nappended");
  assert.strictEqual(
    unzipEntry(after, "word/styles.xml").toString("utf8"),
    styles,
    "a styles part this module did not author was not preserved"
  );
  assert.ok(
    unzipEntry(after, "word/media/image1.png").equals(image),
    "a binary image part was not preserved byte-for-byte"
  );
}

// -- refuse rather than hand back a lossy document (KB R-0011) ---------------
{
  const notZip = path.join(tmp, "notzip.docx");
  fs.writeFileSync(notZip, Buffer.from("this is not a zip at all, it is just prose"));
  const r1 = appendDocx({ text: "x", path: notZip });
  assert.strictEqual(r1.ok, false, "appended to something that is not a zip");
  assert.ok(/not a \.docx package/.test(r1.reason), `unhelpful reason: ${r1.reason}`);

  const noDoc = path.join(tmp, "nodoc.docx");
  fs.writeFileSync(noDoc, foreignZip([{ name: "word/styles.xml", data: "<w:styles/>" }]));
  const r2 = appendDocx({ text: "x", path: noDoc });
  assert.strictEqual(r2.ok, false, "appended to a package with no document.xml");
  assert.ok(/word\/document\.xml/.test(r2.reason), `unhelpful reason: ${r2.reason}`);

  const noBody = path.join(tmp, "nobody.docx");
  fs.writeFileSync(noBody, foreignZip([{ name: "word/document.xml", data: "<w:document/>" }]));
  const r3 = appendDocx({ text: "x", path: noBody });
  assert.strictEqual(r3.ok, false, "appended to a document with no body");
  assert.ok(/w:body/.test(r3.reason), `unhelpful reason: ${r3.reason}`);

  // A package that fails its own CRC is already damaged. Appending would
  // preserve the damage faithfully and report ok: true - #14's failure one
  // layer up, where the corruption arrives from disk rather than from input.
  const damaged = path.join(tmp, "damaged.docx");
  const good = foreignZip([{ name: "word/document.xml", data: docShell(para("original")) }]);
  const bad = Buffer.from(good);
  const at = bad.indexOf(Buffer.from("original", "utf8"));
  assert.ok(at > 0, "fixture: payload not located");
  bad[at] = 0x58;
  fs.writeFileSync(damaged, bad);
  const r4 = appendDocx({ text: "x", path: damaged });
  assert.strictEqual(r4.ok, false, "appended to a package that failed its own CRC");
  assert.ok(/CRC/.test(r4.reason), `unhelpful reason: ${r4.reason}`);
}

// -- a missing target is created, not refused --------------------------------
{
  const fresh = path.join(tmp, "created-by-append.docx");
  assert.ok(!fs.existsSync(fresh));
  const r = appendDocx({ text: "brand new", path: fresh });
  assert.strictEqual(r.ok, true, `append refused to create: ${r.reason}`);
  assert.strictEqual(r.created, true, "creating must be reported, not conflated with appending");
  assert.strictEqual(r.appended, false);
  assert.strictEqual(docxText(fs.readFileSync(fresh)).text, "brand new");

  const ghost = path.join(tmp, "ghost.docx");
  const d = appendDocx({ text: "x", path: ghost, dryRun: true });
  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.dryRun, true);
  assert.ok(!fs.existsSync(ghost), "dry-run on a missing target still created the file");
}

// -- dry-run reports the target and the size, and touches nothing ------------
{
  const doc = path.join(tmp, "dry-append.docx");
  writeDocx({ text: "kept", path: doc });
  const before = crypto.createHash("sha256").update(fs.readFileSync(doc)).digest("hex");
  const listing = fs.readdirSync(tmp).sort();

  const r = appendDocx({ text: "must not be written", path: doc, dryRun: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(r.path, doc, "dry-run must report the target path");
  assert.ok(r.bytes > 100, "dry-run must report the resulting byte length");

  const after = crypto.createHash("sha256").update(fs.readFileSync(doc)).digest("hex");
  assert.strictEqual(after, before, "dry-run modified the document");
  assert.deepStrictEqual(fs.readdirSync(tmp).sort(), listing, "dry-run modified the directory");
  assert.strictEqual(docxText(fs.readFileSync(doc)).text, "kept", "dry-run changed the content");
}

// -- append is not a write-anywhere primitive (#15) --------------------------
{
  const outside = path.join(os.tmpdir(), "pointer-append-escape.docx");
  const r = appendDocx({ text: "x", path: outside });
  assert.strictEqual(r.ok, false, "append escaped the sanctioned root");
  assert.ok(r.reason, "the refusal must carry a reason");
  assert.ok(!fs.existsSync(outside), "a refused append still created the file");
}


// Containment must be enforced by appendDocx ITSELF, not inherited from the
// create branch. An append whose target already exists never reaches writeDocx,
// so the missing-path case above proves nothing about the branch that modifies
// a file the customer already has - which is the one that can destroy data.
{
  const outsideExisting = path.join(os.tmpdir(), "pointer-append-existing.docx");
  const realRoot = process.env.NETIE_WORD_OUT_DIR;
  process.env.NETIE_WORD_OUT_DIR = os.tmpdir(); // read at call time, by design
  const seeded = writeDocx({ text: "a file the customer already had", path: outsideExisting });
  process.env.NETIE_WORD_OUT_DIR = realRoot;
  assert.strictEqual(seeded.ok, true, `fixture: could not seed outside the root - ${seeded.reason}`);

  const before = crypto.createHash("sha256").update(fs.readFileSync(outsideExisting)).digest("hex");
  const r = appendDocx({ text: "should never land", path: outsideExisting });
  assert.strictEqual(r.ok, false, "append modified an existing file outside the sanctioned root");
  const after = crypto.createHash("sha256").update(fs.readFileSync(outsideExisting)).digest("hex");
  assert.strictEqual(after, before, "the refused append still changed the file on disk");
  fs.unlinkSync(outsideExisting);
}

// A ZIP64 package must be refused rather than half-read. Its 32-bit size and
// offset fields are sentinels, so reading them literally aims the parser at the
// wrong bytes - and "mostly parsed" is how parts go missing silently (R-0011).
{
  const z64 = path.join(tmp, "zip64.docx");
  const buf = Buffer.from(foreignZip([{ name: "word/document.xml", data: docShell(para("x")) }]));
  buf.writeUInt32LE(0xffffffff, buf.length - 22 + 16); // central directory offset sentinel
  fs.writeFileSync(z64, buf);
  const r = appendDocx({ text: "x", path: z64 });
  assert.strictEqual(r.ok, false, "a ZIP64 package was accepted");
  assert.ok(/ZIP64/.test(r.reason), `unhelpful reason: ${r.reason}`);
}

// -- the verb is declared, and approval calls it Append, not Write -----------
{
  const { isSupported } = require("../electron/netie/plan-guard");
  assert.strictEqual(
    isSupported("word_docx_append"),
    true,
    "plan-guard must support the verb - an unsupported verb is refused, so this is the fail-closed direction"
  );

  const { describeAction } = require("../electron/netie/plan-describe");
  const d = describeAction({ type: "word_docx_append", path: path.join(tmp, "report.docx") });
  assert.strictEqual(d.verb, "Append", "approval must not describe an append as a Write (#20)");
  assert.ok(d.text.includes("report.docx"), `approval must name the destination - got: ${d.text}`);
}

console.log("PASS word-coworker #17: append preserves, creates, refuses, and dry-runs clean");

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

  // #17: the same two properties through the driver - the dry run reports and
  // does not write, and a contained-out append surfaces its refusal.
  const app = await driver.perform({
    type: "word_docx_append",
    value: "via driver",
    path: path.join(tmp, "drv-append.docx"),
  });
  assert.strictEqual(app.ok, true, `driver append failed: ${app.reason}`);
  assert.strictEqual(app.dryRun, true, "driver dryRun must reach appendDocx");
  assert.ok(!fs.existsSync(path.join(tmp, "drv-append.docx")), "driver dry-run wrote a file");

  const appRefused = await driver.perform({
    type: "word_docx_append",
    value: "escape",
    path: path.join(os.tmpdir(), "pointer-append-outside.docx"),
  });
  assert.strictEqual(appRefused.ok, false, "driver must surface the append refusal");
  assert.ok(appRefused.reason, "append refusal must reach the driver result");

  console.log("PASS word-coworker writeDocx + dry-run driver");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
