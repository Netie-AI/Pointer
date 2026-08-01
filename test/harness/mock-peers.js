"use strict";
/**
 * Mock Cortex + OpenVault peers for e2e / stress / acceptance.
 * No network. Handlers are overridable per test.
 */

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
    async json() {
      return typeof body === "string" ? JSON.parse(body) : body;
    },
  };
}

function createMockPeers(opts = {}) {
  const state = {
    secureCalls: 0,
    audit: [],
    plans: 0,
    skills: 0,
    custody: 0,
    cu: 0,
    lastSecure: null,
    lastPlanPrompt: null,
    /** Last /dms/agents/computer-use request body — asserted by the CU contract. */
    lastCu: null,
    cortexDown: Boolean(opts.cortexDown),
    ovDown: Boolean(opts.ovDown),
    injectOk: opts.injectOk !== false,
    skillsHits: opts.skillsHits || [
      { id: "form-fill", title: "Form fill from vault", score: 0.91 },
      { id: "excel-fill-right", title: "Excel fill right", score: 0.77 },
    ],
    cuActions: opts.cuActions || [
      { type: "click", target: "Email", xPct: 40, yPct: 30 },
      { type: "fill", target: "Email", value: "{{vault.profile.email}}", xPct: 40, yPct: 30 },
    ],
    llmActions: opts.llmActions || [
      { type: "click", target: "Save", xPct: 80, yPct: 90 },
    ],
  };

  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : {};

    if (u.includes(":8010") || u.includes("/dms/") || u.includes("/api/")) {
      if (state.cortexDown) {
        const err = new Error("Cortex unreachable");
        err.code = "ECONNREFUSED";
        throw err;
      }
      if (u.includes("/dms/secure")) {
        state.secureCalls += 1;
        state.lastSecure = body;
        if (opts.blockSecure) {
          return jsonResponse(200, {
            ok: true,
            blocked: true,
            text: "",
            reasons: ["test-block"],
          });
        }
        return jsonResponse(200, {
          ok: true,
          blocked: false,
          text: body.text || "",
        });
      }
      if (u.includes("/dms/classify")) {
        return jsonResponse(200, { ok: true, intent: "act", labels: ["act"] });
      }
      if (u.includes("/dms/audit/append")) {
        state.audit.push(body);
        return jsonResponse(200, { ok: true });
      }
      if (u.includes("/api/discovery/find-skills")) {
        state.skills += 1;
        return jsonResponse(200, { ok: true, skills: state.skillsHits });
      }
      if (u.includes("/api/engine/osr")) {
        return jsonResponse(200, { ok: true, band: "novel", score: 0.6 });
      }
      if (u.includes("/dms/agents/computer-use")) {
        state.cu += 1;
        state.lastCu = body;
        if (opts.cuMissing) return jsonResponse(404, { ok: false, error: "not shipped" });
        return jsonResponse(200, {
          ok: true,
          plan_id: `cu_test_${state.cu}`,
          actions: state.cuActions,
          needs_approval: opts.cuNeedsApproval !== false,
          rationale: "mock computer-use",
          skills_used: state.skillsHits.map((s) => s.id),
        });
      }
      return jsonResponse(404, { ok: false, error: `unknown cortex route ${u}` });
    }

    if (u.includes(":5000") || u.includes("/v1/")) {
      if (state.ovDown) {
        const err = new Error("OpenVault unreachable");
        err.code = "ECONNREFUSED";
        throw err;
      }
      if (u.includes("/v1/chat/completions")) {
        state.plans += 1;
        state.lastPlanPrompt = body;
        return jsonResponse(200, {
          choices: [
            {
              message: {
                content: JSON.stringify(state.llmActions),
              },
            },
          ],
        });
      }
      if (u.includes("/v1/custody/inject")) {
        state.custody += 1;
        if (!state.injectOk) return jsonResponse(404, { ok: false, error: "not shipped" });
        return jsonResponse(200, { ok: true, injected: true, field: body.field });
      }
      return jsonResponse(404, { ok: false, error: `unknown ov route ${u}` });
    }

    return jsonResponse(404, { ok: false, error: `unknown host ${u}` });
  };

  return { state, fetchImpl, jsonResponse };
}

/** Tiny async map with concurrency limit — for stress floods. */
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

function assertSuite() {
  let pass = 0;
  const fails = [];
  const test = (name, fn) => ({ name, fn });
  async function run(tests) {
    for (const t of tests) {
      try {
        await t.fn();
        pass += 1;
        console.log("PASS " + t.name);
      } catch (err) {
        fails.push(t.name);
        console.log("FAIL " + t.name + " — " + (err && err.message ? err.message : err));
      }
    }
    console.log(`\n${pass} passed, ${fails.length} failed`);
    return fails.length === 0;
  }
  return { test, run, get pass() { return pass; }, get fails() { return fails; } };
}

module.exports = { createMockPeers, mapPool, assertSuite, jsonResponse };
