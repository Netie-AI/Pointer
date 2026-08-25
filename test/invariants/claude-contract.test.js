"use strict";
/**
 * CLAUDE.md Hard rules contract — mechanical gate for EPIC-P01 / ticket #8.
 * Fails if the Hard rules section loses the prd-agent routing invariant.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const claudePath = path.join(__dirname, "..", "..", "CLAUDE.md");
const text = fs.readFileSync(claudePath, "utf8");
const hardIdx = text.indexOf("## Hard rules");
assert.ok(hardIdx >= 0, "CLAUDE.md must have ## Hard rules");

/**
 * Bound the section at the next `##` heading (#12).
 *
 * This was `text.slice(hardIdx)`, which runs to end of file — so the assertion
 * was "the string prd-agent appears anywhere at or after the Hard rules
 * heading", not "Hard rules contains the invariant". Latent only because Hard
 * rules happens to be the last section today; append any section below it and a
 * stray mention there keeps the gate green with the rule deleted.
 */
function sectionAfter(source, headingIdx) {
  const body = source.slice(headingIdx);
  const nextHeading = body.slice(1).search(/\n##\s/);
  return nextHeading === -1 ? body : body.slice(0, nextHeading + 1);
}
const hard = sectionAfter(text, hardIdx);

const netieEnd = text.indexOf("<!-- NETIE:END -->");
assert.ok(netieEnd >= 0 && hardIdx > netieEnd, "Hard rules must sit below NETIE:END");
assert.ok(/prd-agent/i.test(hard), "Hard rules must name prd-agent");
assert.ok(
  /before (it is )?implement|before build|routed to/i.test(hard),
  "Hard rules must require routing before implementation"
);
/**
 * The old check was `!/None recorded yet/i` — keyed to the exact wording of one
 * historical stub, so any other placeholder sailed through. Assert substance
 * instead: real rules are numbered and long enough to say something.
 */
assert.ok(
  hard.replace(/\s+/g, " ").length > 200,
  "Hard rules is too short to contain real rules — placeholder?"
);
assert.ok(/^\s*1\.\s/m.test(hard), "Hard rules must be a numbered list of actual rules");

/**
 * Prove the bound is real (#12). A decoy section appended below Hard rules, with
 * the invariant deleted from Hard rules itself, must NOT pass — a fix without
 * this case is indistinguishable from the bug it replaced.
 */
const mutated =
  text.slice(0, hardIdx) +
  "## Hard rules\n\n1. **Something else entirely.** No routing rule here at all, just\n" +
  "   enough text to clear the length check and look like a real numbered rule\n" +
  "   section so the only thing under test is the section boundary itself.\n\n" +
  "## Historical notes\n\nWe used to route everything to `prd-agent` before it is\nimplemented.\n";
const decoy = sectionAfter(mutated, mutated.indexOf("## Hard rules"));
assert.ok(
  !/prd-agent/i.test(decoy),
  "the Hard rules slice is still unbounded — it reached into a later section"
);

console.log("PASS claude-contract: Hard rules contain prd-agent routing invariant");
console.log("PASS claude-contract: the Hard rules slice is bounded to its own section");
