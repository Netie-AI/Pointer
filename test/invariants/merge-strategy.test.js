"use strict";
/**
 * The governed documents must not be able to block a merge on their own.
 *
 * Twelve PRs were open on this repo and every one of them was CONFLICTING.
 * Test-merging all nine reviewable ones onto main produced conflicts in exactly
 * these files and no others:
 *
 *     CHANGELOG.md  STATUS.md  PARKING_LOT.md  docs/ACTIVE.md
 *     docs/subagents_findings/INDEX.md
 *
 * Zero code conflicts. The capability in those branches never disagreed - the
 * narrative around it did, because every branch adds an entry at the top of the
 * same changelog. A backlog that cannot land for that reason is a tooling gap
 * wearing the costume of an integration crisis.
 *
 * `.gitattributes` gives the append-only ones a `union` merge, and this file is
 * the gate. It does not read `.gitattributes` and check the spelling - a typo'd
 * path would pass that. It builds a throwaway repository, forks it, appends a
 * different entry on each side, merges, and asserts the merge came back clean
 * with BOTH entries present. If union ever stops applying, this goes red.
 *
 * It also asserts the other direction, which matters more: STATUS.md,
 * PARKING_LOT.md and docs/ACTIVE.md must KEEP conflicting. Those are state, not
 * history - entries are replaced and removed as they stop being true - and
 * union never deletes. Union-merging PARKING_LOT.md would resurrect a parking
 * entry one branch had just retired, and nobody would see it happen.
 *
 * Run: node test/invariants/merge-strategy.test.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");

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

/**
 * Fork a scratch repo, append a different line to `file` on each side, and try
 * to merge. Returns whether git resolved it and what the file ended up holding.
 *
 * The scratch repo gets this repo's real `.gitattributes`, which is the whole
 * point: the behaviour under test is the one the estate actually ships.
 */
function mergeAppendBothSides(file) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netie-merge-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] }).toString();

  try {
    git("init", "-q", "-b", "base");
    git("config", "user.email", "gate@netie.local");
    git("config", "user.name", "merge gate");
    // safe.directory is global here; a fresh temp repo owned by this user is fine.

    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, ".gitattributes"), path.join(dir, ".gitattributes"));
    fs.writeFileSync(path.join(dir, file), "# HEADER\n\nshared line\n");
    git("add", "-A");
    git("commit", "-qm", "base");

    git("checkout", "-q", "-b", "left");
    fs.writeFileSync(path.join(dir, file), "# HEADER\n\nLEFT ENTRY\nshared line\n");
    git("commit", "-qam", "left entry");

    git("checkout", "-q", "base");
    git("checkout", "-q", "-b", "right");
    fs.writeFileSync(path.join(dir, file), "# HEADER\n\nRIGHT ENTRY\nshared line\n");
    git("commit", "-qam", "right entry");

    let clean = true;
    try {
      git("merge", "--no-edit", "left");
    } catch {
      clean = false;
    }
    const content = fs.readFileSync(path.join(dir, file), "utf8");
    return { clean, content };
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* a temp dir is not worth failing a run over */
    }
  }
}

check(".gitattributes ships", () => {
  assert.ok(fs.existsSync(path.join(ROOT, ".gitattributes")), "no .gitattributes at the repo root");
});

check("two branches can both add a CHANGELOG entry", () => {
  // The exact shape of the twelve-way pile-up: everyone writes their entry at
  // the top of the same file, and git cannot know whose goes first.
  const { clean, content } = mergeAppendBothSides("CHANGELOG.md");
  assert.ok(clean, "CHANGELOG.md still conflicts when both sides append - union is not applying");
  assert.ok(!/^<<<<<<< /m.test(content), "conflict markers were committed into CHANGELOG.md");
  assert.ok(/LEFT ENTRY/.test(content), "the left branch's entry was lost");
  assert.ok(/RIGHT ENTRY/.test(content), "the right branch's entry was lost");
});

check("two branches can both add a findings row", () => {
  const { clean, content } = mergeAppendBothSides("docs/subagents_findings/INDEX.md");
  assert.ok(clean, "the findings INDEX still conflicts when both sides append");
  assert.ok(/LEFT ENTRY/.test(content) && /RIGHT ENTRY/.test(content), "a row was lost");
});

for (const stateful of ["STATUS.md", "PARKING_LOT.md", "docs/ACTIVE.md"]) {
  check(`${stateful} still conflicts, on purpose`, () => {
    // Union never deletes. These three have content REMOVED as it stops being
    // true - a parking entry retired, a STATUS item superseded - so a union
    // merge would quietly bring back whatever the other branch had just taken
    // out. Two people disagreeing about what is currently true is a judgement
    // call, and a conflict is the correct way to ask for one.
    const { clean } = mergeAppendBothSides(stateful);
    assert.strictEqual(
      clean,
      false,
      `${stateful} is being union-merged. It is state, not history: union would ` +
        "resurrect entries another branch deliberately removed, silently"
    );
  });
}

check("line endings are pinned, so the index and the worktree agree", () => {
  // Every `git add` in this repo warns "LF will be replaced by CRLF", which
  // means the index and the working tree disagree about every text file. That
  // is also why `git apply --cached` rejects patches that are otherwise clean.
  // Parse the file into pattern -> attributes rather than matching whitespace,
  // so reformatting the columns cannot turn this gate red or green by accident.
  const rules = new Map();
  for (const line of fs.readFileSync(path.join(ROOT, ".gitattributes"), "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [pattern, ...attrs] = trimmed.split(/\s+/);
    rules.set(pattern, attrs);
  }
  for (const ext of ["*.js", "*.md", "*.css", "*.html", "*.json"]) {
    const attrs = rules.get(ext);
    assert.ok(attrs, `${ext} has no rule - the index and worktree will keep disagreeing`);
    assert.ok(
      attrs.includes("eol=lf"),
      `${ext} is not pinned to eol=lf - got ${attrs.join(" ")}`
    );
  }
  assert.deepStrictEqual(
    rules.get("CHANGELOG.md"),
    ["merge=union"],
    "CHANGELOG.md lost its union merge"
  );
});

console.log(`\nmerge strategy: ${failures === 0 ? "all passed" : failures + " failed"}`);
process.exit(failures === 0 ? 0 : 1);
