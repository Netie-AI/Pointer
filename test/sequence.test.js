"use strict";
/**
 * The timed sequence player: error must stay bounded, not merely small.
 *
 * The defect this exists to prevent is not "notes are late". It is "notes are
 * late by a growing amount". Measured against the real driver, actuation costs
 * about 10ms, so a loop that sleeps the gap between notes and then acts adds
 * ~10-18ms to every gap. Each note individually looks fine; the twentieth is a
 * third of a second adrift, and by then the phrase is unrecognisable.
 *
 * So the tests here drive the player with a FAKE clock and a FAKE actuator.
 * That is deliberate, and it is the only way to assert the property: with a real
 * clock the numbers move run to run and the suite would either be flaky or so
 * loose it proves nothing. A controlled clock lets the drift question be
 * answered exactly - and drift is the whole design.
 *
 * Nothing here presses a real key. Key input is a consequential OS action; this
 * module schedules and the gate on the calling path authorises, so a test that
 * actuated would be exercising a path that does not exist.
 *
 * Run: node test/sequence.test.js
 */
const assert = require("assert");
const { createSequencePlayer, reviewSequence, LATE_MS } = require("../electron/netie/sequence");

let pass = 0;
const fails = [];
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/**
 * A clock the test drives, and an actuator that costs a fixed amount of that
 * clock. `sleep` advances time rather than waiting, so a 200-note sequence
 * spanning ten seconds runs instantly and still exercises every deadline.
 */
function harness({ costMs = 10, jitter = () => 0 } = {}) {
  let t = 1000;
  const fired = [];
  let n = 0;
  return {
    fired,
    now: () => t,
    sleep: async (ms) => {
      t += Math.max(0, ms);
    },
    press: async (keys, holdMs) => {
      fired.push({ keys, holdMs, at: t });
      t += costMs + jitter(n++);
    },
    get t() {
      return t;
    },
  };
}

test("a fixed-gap loop is what drifts - the thing this module refuses to do", () => {
  // Not a test of the player: a demonstration of the failure it exists to avoid,
  // so the number in the module's header is reproducible rather than asserted.
  let t = 0;
  const gap = 60;
  const cost = 12;
  for (let i = 0; i < 20; i += 1) {
    t += gap; // sleep the gap
    t += cost; // then pay actuation
  }
  const wanted = 20 * gap;
  assert.strictEqual(t - wanted, 20 * cost, "fixed-gap error is per-note cost times note count");
  assert.ok(t - wanted > 200, `a 20-note phrase ends ${t - wanted}ms late, which is audible`);
});

test("absolute deadlines do not accumulate error across 200 notes", () => {
  const h = harness({ costMs: 12 });
  const player = createSequencePlayer({ press: h.press, now: h.now, sleep: h.sleep });
  const notes = Array.from({ length: 200 }, (_, i) => ({ keys: "a", atMs: i * 60 }));

  return player.play(notes).then((r) => {
    assert.strictEqual(r.played, 200);
    assert.strictEqual(r.failed, 0);
    // The claim: the LAST note is no further off than the first. A fixed-gap
    // loop would land it 200 * 12 = 2400ms late.
    assert.ok(
      Math.abs(r.finalDriftMs) <= LATE_MS,
      `final note drifted ${r.finalDriftMs}ms - deadlines are accumulating error`
    );
    assert.ok(
      r.worstErrorMs <= LATE_MS,
      `worst note was ${r.worstErrorMs}ms off, over the ${LATE_MS}ms reporting threshold`
    );
  });
});

test("a note that runs long does not push its successors late", () => {
  // One slow actuation - a stalled worker, a GC pause - must cost that note and
  // nothing else. With relative gaps the whole tail shifts.
  const h = harness({ costMs: 8, jitter: (n) => (n === 5 ? 300 : 0) });
  const player = createSequencePlayer({ press: h.press, now: h.now, sleep: h.sleep });
  const notes = Array.from({ length: 30 }, (_, i) => ({ keys: "a", atMs: i * 100 }));

  return player.play(notes).then((r) => {
    const after = r.notes.slice(8);
    const worstAfter = Math.max(...after.map((p) => Math.abs(p.errorMs)));
    assert.ok(
      worstAfter <= LATE_MS,
      `a 300ms stall on note 5 left later notes ${worstAfter}ms off - the tail shifted`
    );
  });
});

test("timing is reported, not hidden behind ok", () => {
  // R-0011: a performance that played badly must not report the same as one
  // that played well. Every note carries its own error.
  const h = harness({ costMs: 400 }); // actuation far slower than the gap
  const player = createSequencePlayer({ press: h.press, now: h.now, sleep: h.sleep });
  const notes = Array.from({ length: 6 }, (_, i) => ({ keys: "a", atMs: i * 50 }));

  return player.play(notes).then((r) => {
    assert.strictEqual(r.played, 6, "every note still sounded");
    assert.ok(r.lateCount > 0, "notes were far too slow to be on time, and it was not reported");
    assert.ok(r.notes.every((n) => typeof n.errorMs === "number"), "per-note error is missing");
  });
});

test("an actuator failure is counted, and never reported as ok", () => {
  const h = harness();
  let calls = 0;
  const player = createSequencePlayer({
    press: async (keys, hold) => {
      calls += 1;
      if (calls === 3) throw new Error("worker died");
      return h.press(keys, hold);
    },
    now: h.now,
    sleep: h.sleep,
  });
  const notes = Array.from({ length: 5 }, (_, i) => ({ keys: "a", atMs: i * 40 }));

  return player.play(notes).then((r) => {
    assert.strictEqual(r.failed, 1);
    assert.strictEqual(r.ok, false, "a run with a failed keypress reported ok");
    assert.match(r.notes[2].error, /worker died/);
  });
});

test("abort stops the sequence and says where", () => {
  const h = harness();
  let stop = false;
  const player = createSequencePlayer({
    press: h.press,
    now: h.now,
    sleep: h.sleep,
    aborted: () => stop,
  });
  const notes = Array.from({ length: 20 }, (_, i) => ({ keys: "a", atMs: i * 30 }));
  const run = player.play(notes);
  stop = true;
  return run.then((r) => {
    assert.strictEqual(r.aborted, true);
    assert.ok(r.played < 20, "abort did not stop the sequence");
    assert.strictEqual(r.ok, false, "an aborted run reported ok");
  });
});

test("a malformed sequence is refused before any key is pressed", () => {
  const h = harness();
  const player = createSequencePlayer({ press: h.press, now: h.now, sleep: h.sleep });
  return player
    .play([
      { keys: "a", atMs: 0 },
      { keys: "b", atMs: 500 },
      { keys: "c", atMs: 200 }, // goes backwards
    ])
    .then((r) => {
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.played, 0, "keys were pressed before the sequence was reviewed");
      assert.strictEqual(h.fired.length, 0, "the actuator was reached despite a refusal");
      assert.ok(r.refused.some((p) => /before the previous/.test(p)));
    });
});

test("review names every problem it finds, by note", () => {
  const r = reviewSequence([
    { keys: "", atMs: 0 },
    { keys: "b", atMs: -5 },
    { keys: "c", atMs: 10, holdMs: -1 },
  ]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.problems.length, 3, `expected one problem per note, got ${r.problems.join(" | ")}`);
});

test("chords are one scheduled action, not several", () => {
  // "Both hands" in the founder's restatement is a chord: several keys at one
  // deadline. It must reach the actuator as a single call, or the notes inside
  // the chord are spread by the round trip and it is an arpeggio.
  const h = harness();
  const player = createSequencePlayer({ press: h.press, now: h.now, sleep: h.sleep });
  return player.play([{ keys: ["c", "e", "g"], atMs: 0, label: "C major" }]).then((r) => {
    assert.strictEqual(r.played, 1);
    assert.strictEqual(h.fired.length, 1, "a chord was split into several actuations");
    assert.deepStrictEqual(h.fired[0].keys, ["c", "e", "g"]);
  });
});

test("the module cannot press anything on its own", () => {
  // Key input is consequential; authorisation belongs to the gate on the calling
  // path. A player that could construct its own actuator would be a way around
  // it, so it must refuse to exist without one being handed in.
  assert.throws(() => createSequencePlayer({}), /press/);
  assert.throws(() => createSequencePlayer(), /press/);
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass += 1;
      console.log("PASS " + name);
    } catch (err) {
      fails.push(name);
      console.log("FAIL " + name + " -- " + (err && err.message ? err.message : err));
    }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
