"use strict";
/**
 * P4-BG-AGENTS — long jobs that outlive one Ask.
 *
 * Research, multi-step projects and replans take minutes. Running them on the
 * Ask path means the HUD is frozen while they work and there is nothing to look
 * at but a spinner. This queue lets them run behind the LIVE bar, with status
 * the HUD can show as a line rather than a stage orb.
 *
 * Three deliberate constraints:
 *
 *   concurrency 1 by default — these jobs drive the screen. Two agents moving
 *     one mouse is not parallelism, it is a fight.
 *   every job is cancellable — a background agent the user cannot stop is worse
 *     than no background agent.
 *   the queue is bounded — a runaway producer must hit a wall, not swap.
 *
 * Pure logic with an injected clock; the runner is whatever the caller passes.
 */

const STATUS = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  DONE: "done",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

const TERMINAL = new Set([STATUS.DONE, STATUS.FAILED, STATUS.CANCELLED]);

function createJobQueue(opts = {}) {
  const concurrency = Math.max(1, Number(opts.concurrency) || 1);
  const maxJobs = Math.max(1, Number(opts.maxJobs) || 32);
  const onChange = typeof opts.onChange === "function" ? opts.onChange : () => {};
  const now = typeof opts.now === "function" ? opts.now : () => Date.now();

  const jobs = new Map();
  let seq = 0;
  let running = 0;
  let draining = null;

  function snapshot(job) {
    return {
      id: job.id,
      title: job.title,
      status: job.status,
      queuedAt: job.queuedAt,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      error: job.error,
      result: job.result,
    };
  }

  function emit(job) {
    onChange(snapshot(job), summary());
  }

  function summary() {
    let queued = 0;
    let active = 0;
    let done = 0;
    let failed = 0;
    for (const job of jobs.values()) {
      if (job.status === STATUS.QUEUED) queued += 1;
      else if (job.status === STATUS.RUNNING) active += 1;
      else if (job.status === STATUS.DONE) done += 1;
      else if (job.status === STATUS.FAILED) failed += 1;
    }
    return { queued, active, done, failed, total: jobs.size };
  }

  function nextQueued() {
    for (const job of jobs.values()) if (job.status === STATUS.QUEUED) return job;
    return null;
  }

  async function runJob(job) {
    job.status = STATUS.RUNNING;
    job.startedAt = now();
    running += 1;
    emit(job);
    try {
      const result = await job.run({
        // A cooperative runner checks this; `cancel` also flips status so a
        // runner that ignores it still cannot report success afterwards.
        get cancelled() {
          return job._cancelRequested === true;
        },
        jobId: job.id,
      });
      if (job._cancelRequested) {
        job.status = STATUS.CANCELLED;
      } else {
        job.status = STATUS.DONE;
        job.result = result ?? null;
      }
    } catch (err) {
      job.status = job._cancelRequested ? STATUS.CANCELLED : STATUS.FAILED;
      job.error = String((err && err.message) || err);
    } finally {
      job.endedAt = now();
      running -= 1;
      emit(job);
    }
  }

  async function drain() {
    if (draining) return draining;
    draining = (async () => {
      // Sequential by default; `concurrency` opens the gate wider for jobs that
      // do not touch the screen (a fetch, a parse).
      const inflight = new Set();
      let job = nextQueued();
      while (job || inflight.size) {
        while (job && inflight.size < concurrency) {
          const p = runJob(job).finally(() => inflight.delete(p));
          inflight.add(p);
          job = nextQueued();
        }
        if (inflight.size) await Promise.race(inflight);
        job = nextQueued();
      }
    })().finally(() => {
      draining = null;
    });
    return draining;
  }

  return {
    STATUS,
    /**
     * @param {{title:string, run:function, id?:string}} spec
     * @returns {{ok:boolean, id?:string, error?:string}}
     */
    add(spec) {
      if (!spec || typeof spec.run !== "function") return { ok: false, error: "job needs a run()" };
      if (jobs.size >= maxJobs) return { ok: false, error: `queue full (${maxJobs})` };
      seq += 1;
      const id = String(spec.id || `bg-${seq}`);
      if (jobs.has(id)) return { ok: false, error: `duplicate job id ${id}` };
      const job = {
        id,
        title: String(spec.title || id),
        run: spec.run,
        status: STATUS.QUEUED,
        queuedAt: now(),
        startedAt: null,
        endedAt: null,
        error: null,
        result: null,
        _cancelRequested: false,
      };
      jobs.set(id, job);
      emit(job);
      return { ok: true, id };
    },

    /** Cancel a queued job outright, or ask a running one to stop. */
    cancel(id) {
      const job = jobs.get(String(id));
      if (!job) return { ok: false, error: "no such job" };
      if (TERMINAL.has(job.status)) return { ok: false, error: `already ${job.status}` };
      job._cancelRequested = true;
      if (job.status === STATUS.QUEUED) {
        job.status = STATUS.CANCELLED;
        job.endedAt = now();
        emit(job);
      }
      return { ok: true, id: job.id, status: job.status };
    },

    cancelAll() {
      let n = 0;
      for (const job of jobs.values()) {
        if (TERMINAL.has(job.status)) continue;
        this.cancel(job.id);
        n += 1;
      }
      return n;
    },

    /** Drop finished jobs so a long session does not accumulate history forever. */
    prune() {
      let n = 0;
      for (const [id, job] of jobs) {
        if (TERMINAL.has(job.status)) {
          jobs.delete(id);
          n += 1;
        }
      }
      return n;
    },

    get(id) {
      const job = jobs.get(String(id));
      return job ? snapshot(job) : null;
    },
    list() {
      return Array.from(jobs.values()).map(snapshot);
    },
    summary,
    drain,
    get running() {
      return running;
    },
  };
}

/** One line for the HUD — background work must be visible, not a stage orb. */
function describeQueue(sum) {
  const s = sum || { queued: 0, active: 0, done: 0, failed: 0 };
  if (!s.active && !s.queued) {
    if (s.failed) return `Background: ${s.done} done, ${s.failed} failed`;
    return s.done ? `Background: ${s.done} done` : "";
  }
  const bits = [];
  if (s.active) bits.push(`${s.active} running`);
  if (s.queued) bits.push(`${s.queued} queued`);
  if (s.failed) bits.push(`${s.failed} failed`);
  return `Background: ${bits.join(" · ")}`;
}

module.exports = { STATUS, createJobQueue, describeQueue };
