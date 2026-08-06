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
