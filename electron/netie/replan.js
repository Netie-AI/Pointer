"use strict";
/**
 * WP-P3-REPLAN-LOOP — observe → replan, bounded.
 *
 * A screen agent that plans once is a screen agent that gives up the moment a
 * dialog opens late or a control moved. But an agent that replans freely is
 * worse: it burns tokens in a loop, and each round it is further from what the
 * human actually approved. So the loop is hard-bounded at three, and there are
 * two states it must never re-enter:
 *
 *   aborted — the kill switch fired. That is a human saying stop; asking the
 *             planner for a different route is not honouring it.
 *   blocked — the Cortex gate refused. Replanning is asking the same question
 *             again and hoping for a different answer, which is exactly the
 *             shape of a prompt-injection retry loop.
 *
 * Pure and deterministic — the decision to keep going can never depend on a
 * model's mood.
 */

/** Ceiling per task, matching the roadmap (Cortex 2.6 · P13-03). */
const MAX_REPLANS = 3;

/**
 * @param {object} state
 *   failCount   how many steps failed in the last run
 *   replanN     replans already spent on this task
 *   maxReplans  ceiling (default 3)
 *   aborted     kill switch fired
 *   blocked     the security gate refused
 * @returns {boolean}
 */
function shouldReplan(state) {
  const s = state || {};
  if (s.aborted === true) return false;
  if (s.blocked === true) return false;
  const failCount = Number(s.failCount) || 0;
  if (failCount <= 0) return false;
  const replanN = Number(s.replanN) || 0;
  const max = Number.isFinite(Number(s.maxReplans)) ? Number(s.maxReplans) : MAX_REPLANS;
  if (max <= 0) return false;
  return replanN < max;
}

/**
 * Read an executeApproved() result list: what failed, and was it stopped or
 * did it break? `skipped: "aborted"` is a stop, not a failure — treating it as
 * one would replan straight through the kill switch.
 */
function observeResults(results) {
  const list = Array.isArray(results) ? results : [];
  const failures = [];
  let aborted = false;
  let completed = 0;

  list.forEach((r, index) => {
    if (!r || typeof r !== "object") return;
    if (r.skipped === "aborted") {
      aborted = true;
      return;
    }
    if (r.ok === true) {
      completed += 1;
      return;
    }
    // Waiting on a human is not a failure. Replanning here would re-plan around
    // a step the user is in the middle of approving — and for custody that
    // means asking OpenVault for the same secret up to three more times.
    if (
      r.skipped === "not-approved" ||
      r.skipped === "custody" ||
      r.skipped === "refused" ||
      r.skipped === "mode-blocked"
    ) {
      return;
    }
    failures.push({
      index,
      type: String((r.action && r.action.type) || "unknown"),
      target: String((r.action && r.action.target) || "").slice(0, 80),
      reason: String(r.message || r.error || r.skipped || "failed").slice(0, 160),
    });
  });

  return { failCount: failures.length, failures, completed, aborted, total: list.length };
}

/** Carry forward what Cortex needs to plan the next round (`prior` in the CU body). */
function nextPrior(prior, observation) {
  const prev = prior || {};
  const obs = observation || { failures: [], completed: 0 };
  return {
    replanN: (Number(prev.replanN) || 0) + 1,
    results: [
      ...((prev.results || []).slice(-8)),
      {
        completed: obs.completed || 0,
        failures: (obs.failures || []).map((f) => ({
          type: f.type,
          target: f.target,
          reason: f.reason,
        })),
      },
    ],
  };
}

/**
 * The instruction for the next round. It says what already worked so the
 * planner does not redo it, and what broke so it does not retry it identically.
 */
function replanInstruction(original, observation) {
  const obs = observation || { failures: [], completed: 0 };
  const lines = [String(original || "").trim()];
  if (obs.completed) lines.push(`\nAlready done: ${obs.completed} step(s) — do not repeat them.`);
  if (obs.failures && obs.failures.length) {
    lines.push("Failed, and a different approach is needed:");
    for (const f of obs.failures.slice(0, 5)) {
      lines.push(`- ${f.type}${f.target ? ` → ${f.target}` : ""}: ${f.reason}`);
    }
  }
  lines.push("Re-read the screen as it is now. Plan only the remaining steps.");
  return lines.join("\n");
}

/** One line for the HUD — a replan must never be invisible. */
function describeReplan(observation, replanN, maxReplans = MAX_REPLANS) {
  const obs = observation || { failCount: 0 };
  return `Replan ${replanN}/${maxReplans} — ${obs.failCount} step(s) failed, re-reading the screen.`;
}

module.exports = {
  MAX_REPLANS,
  shouldReplan,
  observeResults,
  nextPrior,
  replanInstruction,
  describeReplan,
};
