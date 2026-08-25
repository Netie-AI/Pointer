"use strict";
/**
 * WP-P3-REPLAN-LOOP — observe → replan, bounded, and never past a stop.
 *
 * Run: node test/acceptance/replan.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertSuite } = require("../harness/mock-peers");

const ROOT = path.join(__dirname, "..", "..");
const replan = require("../../electron/netie/replan");

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("replans while there is budget, stops at the ceiling", async () => {
      assert.strictEqual(replan.shouldReplan({ failCount: 1, replanN: 0, maxReplans: 3 }), true);
      assert.strictEqual(replan.shouldReplan({ failCount: 1, replanN: 2, maxReplans: 3 }), true);
      assert.strictEqual(replan.shouldReplan({ failCount: 1, replanN: 3, maxReplans: 3 }), false);
      assert.strictEqual(replan.shouldReplan({ failCount: 1, replanN: 9, maxReplans: 3 }), false);
      assert.strictEqual(replan.MAX_REPLANS, 3);
    }),

    T("nothing failed, nothing to replan", async () => {
      assert.strictEqual(replan.shouldReplan({ failCount: 0, replanN: 0 }), false);
      assert.strictEqual(replan.shouldReplan({}), false);
      assert.strictEqual(replan.shouldReplan(null), false);
    }),

    T("never replans past the kill switch or the gate", async () => {
      // The human said stop. A different route is not honouring that.
      assert.strictEqual(replan.shouldReplan({ failCount: 5, replanN: 0, aborted: true }), false);
      // The gate refused. Asking again is the shape of an injection retry loop.
      assert.strictEqual(replan.shouldReplan({ failCount: 5, replanN: 0, blocked: true }), false);
      assert.strictEqual(replan.shouldReplan({ failCount: 5, replanN: 0, maxReplans: 0 }), false);
    }),

    T("observes a run: what broke, what was stopped, what worked", async () => {
      const obs = replan.observeResults([
        { action: { type: "click", target: "File" }, ok: true },
        { action: { type: "click", target: "Save As" }, ok: false, message: "target not found" },
        { action: { type: "type", target: "Name" }, ok: false, skipped: "not-approved" },
      ]);
      assert.strictEqual(obs.completed, 1);
      assert.strictEqual(obs.failCount, 1, "not-approved is waiting on a human, not a failure");
      assert.strictEqual(obs.failures[0].target, "Save As");
      assert.strictEqual(obs.failures[0].reason, "target not found");
      assert.strictEqual(obs.aborted, false);
    }),

    T("waiting on a human is not a failure to replan around", async () => {
      // A custody step sitting in OpenVault waiting for the user's approval was
      // counted as a failure, so the loop re-planned — and re-requested the same
      // secret — up to three times while they were mid-approval.
      const obs = replan.observeResults([
        { action: { type: "fill", target: "Password" }, ok: false, skipped: "custody" },
        { action: { type: "click", target: "Next" }, ok: false, skipped: "not-approved" },
        { action: { type: "rm_rf" }, ok: false, skipped: "refused" },
        { action: { type: "click" }, ok: false, skipped: "mode-blocked" },
      ]);
      assert.strictEqual(obs.failCount, 0, "none of these are broken steps");
      assert.strictEqual(replan.shouldReplan({ failCount: obs.failCount, replanN: 0 }), false);
    }),

    T("an aborted run is a stop, not a failure to route around", async () => {
      const obs = replan.observeResults([
        { action: { type: "click" }, ok: true },
        { action: { type: "click" }, ok: false, skipped: "aborted" },
      ]);
      assert.strictEqual(obs.aborted, true);
      assert.strictEqual(obs.failCount, 0);
      assert.strictEqual(
        replan.shouldReplan({ failCount: obs.failCount, replanN: 0, aborted: obs.aborted }),
        false
      );
    }),

    T("prior state accumulates and stays bounded", async () => {
      const obs = replan.observeResults([{ action: { type: "click", target: "X" }, ok: false, message: "nope" }]);
      let prior = null;
      for (let i = 1; i <= 12; i += 1) {
        prior = replan.nextPrior(prior, obs);
        assert.strictEqual(prior.replanN, i);
      }
      assert.ok(prior.results.length <= 9, `prior must not grow forever, got ${prior.results.length}`);
      assert.strictEqual(prior.results[prior.results.length - 1].failures[0].target, "X");
    }),

    T("the next instruction says what worked and what broke", async () => {
      const obs = replan.observeResults([
        { action: { type: "click", target: "File" }, ok: true },
        { action: { type: "click", target: "Save As" }, ok: false, message: "target not found" },
      ]);
      const text = replan.replanInstruction("save the file as report.docx", obs);
      assert.ok(text.includes("save the file as report.docx"), text);
      assert.ok(text.includes("Already done: 1"), text);
      assert.ok(text.includes("Save As"), text);
      assert.ok(/remaining/i.test(text), text);
    }),

    T("a replan is always announced", async () => {
      const line = replan.describeReplan({ failCount: 2 }, 1, 3);
      assert.ok(line.includes("1/3"), line);
      assert.ok(line.includes("2"), line);
    }),

    T("the act path runs the loop, bounded", async () => {
      const main = fs.readFileSync(path.join(ROOT, "electron/main.js"), "utf8");
      assert.ok(main.includes("shouldReplan"), "main.js must consult shouldReplan");
      assert.ok(main.includes("observeResults"), "main.js must observe the run before replanning");
      assert.ok(main.includes("MAX_REPLANS"), "the loop must be bounded by the shared ceiling");
      assert.ok(main.includes("clicks.cu.replan"), "C25-03: replans must reach the audit ledger");
      // The kill switch is `abortPlan`. `observation.aborted` only sees a press
      // that landed mid-list, so a press after the last step left no trace and
      // the loop restarted the agent after the human said stop.
      assert.ok(
        /aborted:\s*abortPlan\s*\|\|\s*observation\.aborted/.test(main),
        "the replan gate must read the authoritative abort flag, not just the derived one"
      );
      // A replan that stops because Cortex died must say so, not "produced nothing".
      assert.ok(main.includes("Replan stopped —"), "the stop reason must reach the user");
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
