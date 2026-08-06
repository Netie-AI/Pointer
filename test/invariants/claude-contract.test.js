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
const hard = text.slice(hardIdx);
const netieEnd = text.indexOf("<!-- NETIE:END -->");
assert.ok(netieEnd >= 0 && hardIdx > netieEnd, "Hard rules must sit below NETIE:END");
assert.ok(/prd-agent/i.test(hard), "Hard rules must name prd-agent");
assert.ok(
  /before (it is )?implement|before build|routed to/i.test(hard),
  "Hard rules must require routing before implementation"
);
assert.ok(!/None recorded yet/i.test(hard), "Hard rules must not be the empty stub");
console.log("PASS claude-contract: Hard rules contain prd-agent routing invariant");
