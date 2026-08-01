"use strict";
/**
 * Golden act path — capture → gate → plan → guard → dry-run execute.
 * No Electron, no OS. Run: node test/e2e/golden-act.test.js
 */

const assert = require("assert");
const { NetieEcosystem } = require("../../electron/netie/ecosystem");
const { guardPlan } = require("../../electron/netie/plan-guard");
const { InputDriver } = require("../../electron/netie/driver");
const { createMockPeers, assertSuite } = require("../harness/mock-peers");

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("golden: gate → plan → guard → dry-run click/type", async () => {
      const { state, fetchImpl } = createMockPeers({
        llmActions: [
          { type: "click", target: "Name", xPct: 20, yPct: 40 },
          { type: "fill", target: "Name", value: "Ada", xPct: 20, yPct: 40 },
          { type: "click", target: "Save", xPct: 85, yPct: 92 },
        ],
      });
      const eco = new NetieEcosystem({
        fetchImpl,
        cortexUrl: "http://127.0.0.1:8010",
        openvaultUrl: "http://127.0.0.1:5000",
        cortexKey: "dms-demo-steward-key",
      });
      const plan = await eco.planActions({
        instruction: "fill name Ada and save",
        screenText: "Name [          ]  Save",
        dataUrl: "data:image/png;base64,aaa",
        policy: { autoRunSensible: true },
        hotContext: "profile.name prefers Ada",
      });
      assert.strictEqual(plan.ok, true);
      assert.ok(plan.actions.length >= 2);
      assert.ok(state.secureCalls >= 1);
      assert.ok(state.audit.some((a) => a.event_type === "clicks.plan"));
      const guarded = guardPlan(plan.actions);
      assert.strictEqual(guarded.dropped.length, 0);
      const driver = new InputDriver({ dryRun: true });
      const region = { x: 0, y: 0, width: 1000, height: 800 };
      for (const action of guarded.actions) {
        const r = await driver.perform(action, { region });
        assert.notStrictEqual(r.ok, false);
      }
    }),

    T("golden: Cortex down fail-closes planning", async () => {
      const { fetchImpl } = createMockPeers({ cortexDown: true });
      const eco = new NetieEcosystem({
        fetchImpl,
        cortexUrl: "http://127.0.0.1:8010",
        openvaultUrl: "http://127.0.0.1:5000",
      });
      const plan = await eco.planActions({ instruction: "click save" });
      assert.strictEqual(plan.ok, false);
      assert.strictEqual(plan.blocked, true);
    }),

    T("golden: hallucinated verb stripped by guard", async () => {
      const guarded = guardPlan([
        { type: "teleport_soul", target: "desktop", xPct: 50, yPct: 50 },
        { type: "click", target: "OK", xPct: 50, yPct: 50 },
      ]);
      assert.ok(guarded.dropped.length >= 1);
      assert.ok(guarded.actions.every((a) => String(a.type).toLowerCase() !== "teleport_soul"));
      assert.ok(guarded.actions.some((a) => a.type === "click"));
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
