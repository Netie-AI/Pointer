"use strict";
/**
 * The five governed files, mechanically checked (#13).
 *
 * KB R-0012 requires laptop-ASCII in governed corpus text, and DOCUMENT_SYSTEM.md
 * section 7 repeats it for the five per-repo files. Nothing checked it, which is
 * why em dashes and arrow glyphs shipped in the very batch that added the
 * invariant test meant to make CLAUDE.md self-enforcing.
 *
 * SCOPE, decided deliberately (the ticket's first trap): exactly the five
 * governed files, and no source files. `CHANGELOG.md` is in scope - it had one
 * violation, in a heading, and replacing an em dash with a hyphen preserves the
 * entry's meaning exactly, so append-only is not broken by it. Scoping the rule
 * around a single character would have left the largest governed file
 * unenforced forever.
 *
 * The substitutions are named rather than "reject all non-ASCII", so a failure
 * tells the author what to type instead of just that something is wrong.
 *
 * Run: node test/invariants/governed-docs.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

/** The five per-repo files. There is no sixth (R-0013). */
const GOVERNED = ["CLAUDE.md", "docs/ACTIVE.md", "STATUS.md", "CHANGELOG.md", "PARKING_LOT.md"];

/** What to type instead. Anything above U+007E not listed here is still a failure. */
const SUBSTITUTES = Object.freeze({
  "—": " - ", // em dash
  "–": "-", // en dash
  "‘": "'", // curly quotes
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...", // ellipsis
  "→": "->", // arrows
  "←": "<-",
  "⇒": "=>",
  "⇐": "<=",
  "≤": "<=",
  "≥": ">=",
  "·": "-", // middle dot
  " ": "a plain space", // non-breaking space
  "•": "-", // bullet
});

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

/** @returns {Array<{file:string, line:number, col:number, ch:string, hint:string}>} */
function scan(file) {
  // resolve(), not join(): the self-check below passes an absolute temp path,
  // which may be on another drive on Windows.
  const abs = path.resolve(ROOT, file);
  const found = [];
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    [...line].forEach((ch, col) => {
      const code = ch.codePointAt(0);
      // Tab is fine; everything else outside printable ASCII is not.
      if (code > 126 || (code < 32 && ch !== "\t")) {
        found.push({
          file,
          line: i + 1,
          col: col + 1,
          ch,
          hint: SUBSTITUTES[ch] ? `use ${SUBSTITUTES[ch]}` : "not laptop-ASCII",
        });
      }
    });
  });
  return found;
}

check("every governed file exists - there is no sixth and no missing fifth", () => {
  for (const f of GOVERNED) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is missing`);
  }
});

check("R-0012: the governed files are laptop-ASCII", () => {
  const all = GOVERNED.flatMap(scan);
  const report = all
    .slice(0, 20)
    .map((v) => `${v.file}:${v.line}:${v.col} ${JSON.stringify(v.ch)} (U+${v.ch
      .codePointAt(0)
      .toString(16)
      .toUpperCase()
      .padStart(4, "0")}) - ${v.hint}`)
    .join("\n  ");
  assert.strictEqual(
    all.length,
    0,
    `${all.length} non-laptop-ASCII character(s):\n  ${report}${all.length > 20 ? "\n  ..." : ""}`
  );
});

check("the scanner can actually see a violation (R-0007)", () => {
  // A checker that cannot fail is not a checker. Prove the detector works on a
  // known-bad string rather than trusting a green run over clean files.
  const tmp = path.join(require("os").tmpdir(), `governed-${process.pid}.md`);
  fs.writeFileSync(tmp, "clean line\nthis one has an em dash — right here\n");
  try {
    const hits = scan(tmp);
    assert.strictEqual(hits.length, 1, "the scanner missed a planted em dash");
    assert.strictEqual(hits[0].line, 2);
    assert.ok(hits[0].hint.includes("-"), "the failure must say what to type instead");
  } finally {
    fs.unlinkSync(tmp);
  }
});

check("STATUS.md respects its 60-line cap (R-0013)", () => {
  const lines = fs.readFileSync(path.join(ROOT, "STATUS.md"), "utf8").split(/\r?\n/);
  // Trailing blank lines are not content.
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  assert.ok(lines.length <= 60, `STATUS.md is ${lines.length} lines; the cap is 60`);
});

check("ACTIVE.md tells a cold-start reader where tickets actually live", () => {
  // #13's second half: asserted on ACTIVE.md read ALONE, not on CLAUDE.md.
  const active = fs.readFileSync(path.join(ROOT, "docs/ACTIVE.md"), "utf8");
  assert.ok(/gh issue list/.test(active), "ACTIVE.md never mentions `gh issue list`");
  assert.ok(
    /source of truth/i.test(active),
    "ACTIVE.md does not say GitHub Issues are the source of truth"
  );
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\ngoverned-docs: all passed");
