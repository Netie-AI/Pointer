"use strict";
/**
 * Play a timed sequence of key actions without accumulating drift.
 *
 * The founder's framing, which is the one that makes this tractable: to play a
 * piano you do not need multi-touch injection, you need an app whose keys are
 * keyboard keys and a series of commands issued on a schedule. That turns a
 * Windows-API problem into a timing problem, and a timing problem is measurable.
 *
 * Measured on this laptop against the real driver, read-only ops, 40 samples:
 *
 *     one round trip through the PowerShell worker   p50 10.2ms  p95 15.9ms
 *     naive `sleep(60)` then act, asking for 60ms    p50 78.1ms  p95 88.6ms
 *
 * The transport is fine. The naive loop is not, and not because it is slow -
 * because it is slow BY A CONSISTENT AMOUNT. Sleeping a fixed gap between
 * actions adds the actuation cost to every gap, so the error compounds: at
 * ~18ms of overshoot per note, a twenty-note phrase finishes a third of a
 * second late and every note after the first is progressively wrong. That is
 * audible long before the individual jitter is.
 *
 * So gaps are never slept. Every action carries an ABSOLUTE deadline measured
 * from one start instant, and the player waits until that deadline minus what
 * actuation is currently costing. Error stays bounded by per-action jitter
 * instead of summing, whatever the sequence length.
 *
 * This module schedules and reports. It deliberately does NOT decide whether the
 * keys may be pressed: key input is a consequential OS action, and the decision
 * belongs to safety.js / plan-guard.js on the path that calls this, exactly as
 * it does for every other verb. A scheduler that could authorise its own input
 * would be a way around the gate.
 */

/** Actuation cost estimate, in ms, before any measurement exists. */
const INITIAL_LEAD_MS = 10;

/**
 * How many recent actuation costs the lead estimate is drawn from.
 *
 * The estimate is the MEDIAN of this window, not a mean or an EWMA. Both of
 * those are moved by a single outlier, and one outlier is exactly what happens
 * here: a GC pause or a stalled worker makes one keypress cost 300ms, the
 * estimate jumps, and the player then fires the next several notes EARLY by the
 * amount it over-corrected. Measured: a 300ms stall on note 5 left later notes
 * 39ms off with an EWMA. A median ignores it entirely.
 */
const LEAD_WINDOW = 16;

/** Bounds on the estimate, so a pathological actuator cannot skew the schedule. */
const LEAD_MIN_MS = 0;
const LEAD_MAX_MS = 60;

/**
 * A note landing this far from its deadline is reported as late.
 *
 * 25ms is the rough floor where a listener starts hearing a rhythmic error
 * rather than feeling a groove, so it is the point at which claiming the
 * sequence played correctly would be a lie (R-0011). It is a reporting
 * threshold, not a hard failure: a late note has still sounded, and silently
 * dropping it would be worse than playing it late.
 */
const LATE_MS = 25;

/**
 * @typedef {{ keys: string|string[], atMs: number, holdMs?: number, label?: string }} Note
 */

/**
 * Validate a sequence before anything is pressed.
 *
 * Refusing a malformed sequence up front matters more here than in most places:
 * these actions reach a real keyboard, and discovering note 40 is nonsense after
 * 39 keys have already gone into someone's document is not a recoverable state.
 */
function reviewSequence(notes) {
  const problems = [];
  if (!Array.isArray(notes) || notes.length === 0) {
    return { ok: false, problems: ["a sequence must be a non-empty array of notes"] };
  }
  let previousAt = -Infinity;
  notes.forEach((note, i) => {
    const where = note && note.label ? `note ${i} (${note.label})` : `note ${i}`;
    if (!note || typeof note !== "object") {
      problems.push(`${where}: not an object`);
      return;
    }
    const keys = Array.isArray(note.keys) ? note.keys : [note.keys];
    if (!keys.length || keys.some((k) => typeof k !== "string" || !k.trim())) {
      problems.push(`${where}: keys must be a non-empty string or array of strings`);
    }
    if (!Number.isFinite(note.atMs) || note.atMs < 0) {
      problems.push(`${where}: atMs must be a finite offset >= 0, got ${note.atMs}`);
    } else if (note.atMs < previousAt) {
      // Out-of-order deadlines would make the player wait for a moment that has
      // already passed, and it would silently fire late for the rest of the run.
      problems.push(`${where}: atMs ${note.atMs} is before the previous note's ${previousAt}`);
    } else {
      previousAt = note.atMs;
    }
    if (note.holdMs !== undefined && (!Number.isFinite(note.holdMs) || note.holdMs < 0)) {
      problems.push(`${where}: holdMs must be a finite duration >= 0, got ${note.holdMs}`);
    }
  });
  return { ok: problems.length === 0, problems };
}

/**
 * @param {object} io
 * @param {(keys: string[], holdMs: number) => Promise<any>} io.press  actuator
 * @param {() => number} [io.now]    monotonic clock in ms
 * @param {(ms: number) => Promise<void>} [io.sleep]
 * @param {() => boolean} [io.aborted]
 */
function createSequencePlayer(io = {}) {
  const press = io.press;
  if (typeof press !== "function") throw new Error("createSequencePlayer needs a press(keys, holdMs)");
  // hrtime by default: Date.now can step backwards over an NTP correction, and
  // a clock that goes backwards mid-phrase makes every remaining deadline wrong.
  const now =
    io.now ||
    (() => Number(process.hrtime.bigint() / 1000n) / 1000);
  const sleep = io.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const aborted = io.aborted || (() => false);

  /** Recent actuation costs; the lead is their median. */
  const costs = [];
  let leadMs = INITIAL_LEAD_MS;

  function recordCost(ms) {
    costs.push(ms);
    if (costs.length > LEAD_WINDOW) costs.shift();
    const sorted = [...costs].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)];
    leadMs = Math.min(LEAD_MAX_MS, Math.max(LEAD_MIN_MS, mid));
  }

  /**
   * Wait until `deadline`, spending most of it asleep and the last stretch
   * spinning.
   *
   * setTimeout resolution is coarse and its overshoot is what the naive loop
   * was paying. Sleeping to just short of the deadline and then busy-waiting
   * the remainder buys back that overshoot; the spin window is small enough
   * that it costs a sliver of one core, not a hot loop.
   */
  async function waitUntil(deadline) {
    const FINE_MS = 2;
    for (;;) {
      const remaining = deadline - now();
      if (remaining <= 0) return;
      if (aborted()) return;
      // Sleep the bulk, then approach in 1ms steps. The first version spun on a
      // resolved promise for the last couple of ms to dodge timer overshoot,
      // which hangs forever on a caller-injected clock - such a clock only
      // advances inside sleep(), so a busy loop never reaches the deadline. The
      // spin was not worth it anyway: timer granularity is 1-2ms against a
      // measured jitter floor of about 7ms, so it was tuning well below noise.
      // Never sleep zero. With `remaining` between FINE_MS and FINE_MS+1 the
      // floor is 0, and a zero-length sleep advances an injected clock by
      // nothing at all - the loop then never reaches the deadline. Every
      // iteration must move time forward by at least a millisecond.
      await sleep(Math.max(1, Math.floor(remaining - FINE_MS)));
    }
  }

  /**
   * Play the sequence. Returns a report, and never throws for a late note - a
   * late note has still sounded, and the caller needs the timing back to decide
   * whether the performance was acceptable.
   */
  async function play(notes, opts = {}) {
    const review = reviewSequence(notes);
    if (!review.ok) return { ok: false, played: 0, refused: review.problems, notes: [] };

    const t0 = now() + (Number(opts.leadInMs) || 0);
    const played = [];
    let stoppedAt = null;

    for (let i = 0; i < notes.length; i += 1) {
      if (aborted()) {
        stoppedAt = i;
        break;
      }
      const note = notes[i];
      const keys = Array.isArray(note.keys) ? note.keys : [note.keys];
      const holdMs = Number.isFinite(note.holdMs) ? note.holdMs : 0;

      // The deadline is absolute, derived from t0 and this note's own offset -
      // never from when the previous note happened to finish. That is the whole
      // trick: a note that lands late cannot push its successors late too.
      const deadline = t0 + note.atMs;
      await waitUntil(deadline - leadMs);
      if (aborted()) {
        stoppedAt = i;
        break;
      }

      const firedAt = now();
      let error = null;
      try {
        await press(keys, holdMs);
      } catch (err) {
        error = String((err && err.message) || err);
      }
      recordCost(now() - firedAt);

      played.push({
        index: i,
        label: note.label || keys.join("+"),
        targetMs: +note.atMs.toFixed(3),
        actualMs: +(firedAt - t0).toFixed(3),
        errorMs: +(firedAt - deadline).toFixed(3),
        error,
      });
    }

    const errors = played.filter((p) => p.error);
    const late = played.filter((p) => Math.abs(p.errorMs) > LATE_MS);
    const drift = played.length ? played[played.length - 1].errorMs : 0;

    return {
      // A run that actuated is `ok` only if every key actually went in. Timing
      // is reported separately, because "played, badly" and "did not play" are
      // different answers and the caller must be able to tell them apart.
      ok: errors.length === 0 && stoppedAt === null,
      played: played.length,
      aborted: stoppedAt !== null,
      stoppedAt,
      failed: errors.length,
      lateCount: late.length,
      worstErrorMs: played.length ? Math.max(...played.map((p) => Math.abs(p.errorMs))) : 0,
      finalDriftMs: +drift.toFixed(3),
      leadMs: +leadMs.toFixed(3),
      notes: played,
    };
  }

  return { play, reviewSequence, get leadMs() { return leadMs; } };
}

module.exports = { createSequencePlayer, reviewSequence, LATE_MS, INITIAL_LEAD_MS };
