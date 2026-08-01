"use strict";
/**
 * P4-BG-AGENTS — background jobs with visible status and a real cancel.
 *
 * Run: node test/acceptance/bg-agents.test.js
 */

const assert = require("assert");
const { assertSuite } = require("../harness/mock-peers");

const { createJobQueue, describeQueue, STATUS } = require("../../electron/netie/bg-agents");

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("jobs run and report a result", async () => {
      const q = createJobQueue();
      q.add({ id: "a", title: "Research", run: async () => "found it" });
      await q.drain();
      const job = q.get("a");
      assert.strictEqual(job.status, STATUS.DONE);
      assert.strictEqual(job.result, "found it");
      assert.deepStrictEqual(q.summary(), { queued: 0, active: 0, done: 1, failed: 0, total: 1 });
    }),

    T("screen-driving jobs run one at a time", async () => {
      const q = createJobQueue({ concurrency: 1 });
      let peak = 0;
      let live = 0;
      const work = async () => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((r) => setImmediate(r));
        live -= 1;
      };
      for (let i = 0; i < 5; i += 1) q.add({ id: `j${i}`, title: `Job ${i}`, run: work });
      await q.drain();
      assert.strictEqual(peak, 1, "two agents must never drive one mouse at once");
      assert.strictEqual(q.summary().done, 5);
    }),

    T("a failing job does not take the queue with it", async () => {
      const q = createJobQueue();
      q.add({ id: "bad", title: "Explodes", run: async () => { throw new Error("boom"); } });
      q.add({ id: "good", title: "Fine", run: async () => "ok" });
      await q.drain();
      assert.strictEqual(q.get("bad").status, STATUS.FAILED);
      assert.strictEqual(q.get("bad").error, "boom");
      assert.strictEqual(q.get("good").status, STATUS.DONE);
    }),

    T("a queued job can be cancelled before it starts", async () => {
      const gate = deferred();
      const q = createJobQueue({ concurrency: 1 });
      q.add({ id: "first", title: "Holds", run: () => gate.promise });
      q.add({ id: "second", title: "Never runs", run: async () => "should not happen" });
      const draining = q.drain();

      await new Promise((r) => setImmediate(r));
      assert.strictEqual(q.cancel("second").ok, true);
      gate.resolve("done");
      await draining;

      assert.strictEqual(q.get("second").status, STATUS.CANCELLED);
      assert.strictEqual(q.get("second").result, null, "a cancelled job must not produce a result");
    }),

    T("a running job that ignores cancel still cannot report success", async () => {
      const gate = deferred();
      const q = createJobQueue();
      // A runner that never checks ctx.cancelled and resolves anyway.
      q.add({ id: "stubborn", title: "Ignores cancel", run: () => gate.promise });
      const draining = q.drain();
      await new Promise((r) => setImmediate(r));
      q.cancel("stubborn");
      gate.resolve("finished anyway");
      await draining;
      assert.strictEqual(q.get("stubborn").status, STATUS.CANCELLED);
    }),

    T("a cooperative runner sees the cancel flag", async () => {
      const q = createJobQueue();
      let sawCancel = false;
      const gate = deferred();
      q.add({
        id: "polite",
        title: "Checks",
        run: async (ctx) => {
          await gate.promise;
          sawCancel = ctx.cancelled;
          return null;
        },
      });
      const draining = q.drain();
      await new Promise((r) => setImmediate(r));
      q.cancel("polite");
      gate.resolve();
      await draining;
      assert.strictEqual(sawCancel, true);
    }),

    T("the queue is bounded and ids are unique", async () => {
      const q = createJobQueue({ maxJobs: 2 });
      assert.strictEqual(q.add({ id: "a", run: async () => {} }).ok, true);
      assert.strictEqual(q.add({ id: "a", run: async () => {} }).ok, false, "duplicate id");
      assert.strictEqual(q.add({ id: "b", run: async () => {} }).ok, true);
      const full = q.add({ id: "c", run: async () => {} });
      assert.strictEqual(full.ok, false);
      assert.ok(/queue full/.test(full.error), full.error);
      assert.strictEqual(q.add({ title: "no runner" }).ok, false);
    }),

    T("every status change is published for the HUD", async () => {
      const seen = [];
      const q = createJobQueue({ onChange: (job) => seen.push(`${job.id}:${job.status}`) });
      q.add({ id: "a", title: "Work", run: async () => "x" });
      await q.drain();
      assert.deepStrictEqual(seen, ["a:queued", "a:running", "a:done"]);
    }),

    T("the status line says what is happening, and nothing when idle", async () => {
      assert.strictEqual(describeQueue({ queued: 0, active: 0, done: 0, failed: 0 }), "");
      assert.strictEqual(describeQueue({ queued: 2, active: 1, done: 0, failed: 0 }), "Background: 1 running · 2 queued");
      assert.strictEqual(describeQueue({ queued: 0, active: 0, done: 3, failed: 1 }), "Background: 3 done, 1 failed");
    }),

    T("finished jobs can be pruned; live ones cannot", async () => {
      const q = createJobQueue();
      q.add({ id: "a", run: async () => "x" });
      await q.drain();
      q.add({ id: "b", run: async () => "y" });
      assert.strictEqual(q.prune(), 1, "only the finished job goes");
      assert.strictEqual(q.get("b").status, STATUS.QUEUED);
      assert.strictEqual(q.cancelAll(), 1);
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
