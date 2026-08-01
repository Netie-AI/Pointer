"use strict";
/**
 * Stress suite — agent loop, guard, pointer travel, flood.
 * Run: node test/stress/agent-loop.stress.js
 */

const assert = require("assert");
const { NetieEcosystem } = require("../../electron/netie/ecosystem");
const { guardPlan, DRIVER_ACTIONS } = require("../../electron/netie/plan-guard");
const { reviewPlan } = require("../../electron/netie/safety");
const { resolveVaultTemplates, hasRawTemplate } = require("../../electron/netie/vault-fill");
const { InputDriver } = require("../../electron/netie/driver");
const { RecallRing } = require("../../electron/netie/clicky");
const { modeForAction, MODES } = require("../../electron/netie/clicky/pointer");
const { createMockPeers, mapPool, assertSuite } = require("../harness/mock-peers");

function longPlan(n) {
  const actions = [];
  for (let i = 0; i < n; i += 1) {
    if (i === 3) {
      actions.push({ type: "open", target: "notepad.exe", url: "C:\\Windows\\notepad.exe" });
    } else if (i % 5 === 0) {
      actions.push({ type: "fill", target: `Field${i}`, value: `v${i}`, xPct: 10 + (i % 80), yPct: 20 + (i % 60) });
    } else if (i % 7 === 0) {
      actions.push({ type: "scroll", deltaY: -120, xPct: 50, yPct: 50 });
    } else {
      actions.push({ type: "click", target: `Btn${i}`, xPct: (i * 7) % 100, yPct: (i * 11) % 100 });
    }
  }
  // Inject poison verbs mid-stream.
  actions.splice(10, 0, { type: "rm_rf", target: "/" });
  actions.splice(15, 0, { type: "exfiltrate", value: "secrets" });
  return actions;
}

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("stress: 24-step plan survives guard + dry-run driver", async () => {
      const raw = longPlan(24);
      const guarded = guardPlan(raw);
      assert.ok(guarded.dropped.length >= 2, "poison verbs dropped");
      assert.ok(guarded.actions.length <= 24);
      assert.ok(guarded.launches >= 1, "open requires confirm");
      assert.ok(guarded.reaimed.length >= 1, "post-launch coords stripped");

      const driver = new InputDriver({ dryRun: true });
      const region = { x: 0, y: 0, width: 1920, height: 1080 };
      let okN = 0;
      let attempted = 0;
      for (const a of guarded.actions.slice(0, 24)) {
        if (a._requireConfirm) continue; // human beat — skip in stress
        // Post-launch re-aim strips coords; supply stand-ins so dry-run can exercise the driver.
        const action =
          a._reaim || (a.xPct == null && ["click", "fill", "doubleclick", "rightclick", "hover", "movecursor"].includes(String(a.type).toLowerCase()))
            ? { ...a, xPct: 50, yPct: 50 }
            : a;
        attempted += 1;
        const r = await driver.perform(action, { region });
        if (r.ok !== false) okN += 1;
      }
      assert.ok(attempted >= 15, `expected many attempted steps, got ${attempted}`);
      assert.ok(okN >= 15, `expected many dry-run ok steps, got ${okN}`);
    }),

    T("stress: Cortex down mid-session blocks new plans only", async () => {
      const peers = createMockPeers();
      const eco = new NetieEcosystem({
        fetchImpl: peers.fetchImpl,
        cortexUrl: "http://127.0.0.1:8010",
        openvaultUrl: "http://127.0.0.1:5000",
      });
      const first = await eco.planActions({
        instruction: "click OK",
        policy: { autoRunSensible: true },
      });
      assert.strictEqual(first.ok, true);

      peers.state.cortexDown = true;
      const second = await eco.planActions({ instruction: "click Cancel" });
      assert.strictEqual(second.ok, false);
      assert.strictEqual(second.blocked, true);
    }),

    T("stress: recall ring under burst push stays capped", async () => {
      let now = 1_000_000;
      const ring = new RecallRing({ maxFrames: 60, windowMs: 60_000, clock: () => now });
      for (let i = 0; i < 500; i += 1) {
        now += 1000;
        ring.push({ t: now, cx: i, cy: i, fgProc: "app.exe", thumbJpeg: Buffer.alloc(64, i % 255) });
      }
      const snap = ring.snapshot();
      assert.ok(snap.length <= 60);
      const summary = ring.summaryText();
      assert.ok(!summary.includes(Buffer.alloc(64, 1).toString("base64")));
    }),

    T("stress: 50 concurrent planAttempts serialize without throw", async () => {
      const { state, fetchImpl } = createMockPeers({
        llmActions: [{ type: "click", target: "X", xPct: 50, yPct: 50 }],
      });
      const eco = new NetieEcosystem({
        fetchImpl,
        cortexUrl: "http://127.0.0.1:8010",
        openvaultUrl: "http://127.0.0.1:5000",
      });
      const ids = Array.from({ length: 50 }, (_, i) => i);
      const results = await mapPool(ids, 8, async (i) =>
        eco.planActions({ instruction: `click ${i}`, policy: { autoRunSensible: true } })
      );
      assert.strictEqual(results.length, 50);
      assert.ok(results.every((r) => r.ok === true));
      assert.ok(state.secureCalls >= 50);
      assert.ok(state.plans >= 50);
    }),

    T("stress: pointer face map is stable under action flood", async () => {
      const types = [
        "click", "doubleclick", "type", "fill", "scroll", "open", "wait", "paste", "drag", "hover",
      ];
      for (let i = 0; i < 1000; i += 1) {
        const t = types[i % types.length];
        const mode = modeForAction(t);
        assert.ok(Object.values(MODES).includes(mode));
      }
    }),

    T("stress: animated dry-run travel 100 hops stays coherent", async () => {
      const d = new InputDriver({ dryRun: true });
      for (let i = 0; i < 100; i += 1) {
        const r = await d.moveToAnimated(i * 10, i * 5, { durationMs: 40, steps: 4 });
        assert.strictEqual(r.op, "move_animated");
        assert.strictEqual(r.x, i * 10);
        assert.strictEqual(r.y, i * 5);
      }
      const click = await d.perform(
        { type: "click", xPct: 50, yPct: 50 },
        { region: { x: 0, y: 0, width: 200, height: 200 } }
      );
      assert.strictEqual(click.ok, true);
    }),

    // ── stress mandate 6 ────────────────────────────────────────────────────
    T("stress: 200 hallucinated verbs are all dropped and none auto-runs", async () => {
      const invented = [
        "rm_rf", "exfiltrate", "run_shell", "sudo", "eval", "download", "curl",
        "disable_firewall", "chmod", "wipe_disk", "screenshot_upload", "keylog",
        "install", "elevate", "regwrite", "kill_process", "", null, undefined,
      ];
      const plan = [];
      for (let i = 0; i < 200; i += 1) {
        const type = invented[i % invented.length];
        plan.push(type === null || type === undefined ? { target: `x${i}` } : { type, target: `x${i}` });
      }
      // One legitimate action, so a guard that simply empties everything fails here too.
      plan.push({ type: "click", target: "Next", xPct: 10, yPct: 10 });

      const guarded = guardPlan(plan);
      assert.strictEqual(guarded.actions.length, 1, "only the real verb survives");
      assert.strictEqual(guarded.actions[0].type, "click");
      assert.strictEqual(guarded.dropped.length, 200);

      // …and with the most permissive policy the product ships, nothing invented
      // can reach "auto" — because nothing invented is left.
      const review = reviewPlan(plan, { autoRunSensible: true, autoRunBenign: true });
      assert.strictEqual(review.actions.length, 1);
      assert.ok(
        review.actions.every((a) => DRIVER_ACTIONS.includes(a.type)),
        "an action the driver cannot run must never be dispositioned at all"
      );
    }),

    // ── stress mandate 7 ────────────────────────────────────────────────────
    T("stress: no unresolved vault template ever reaches the driver", async () => {
      const templates = [
        "{{vault.profile.email}}",           // resolvable
        "{{vault.profile.nickname}}",        // missing from the profile
        "{{vault.profile.password}}",        // secret — never resolvable
        "{{ vault.profile.email }}",         // spacing
        "prefix {{vault.missing}} suffix",   // partial
        "{{vault.profile.name}} <{{vault.profile.nickname}}>", // one of two
      ];
      const profile = { "profile.email": "ada@example.com", "profile.name": "Ada" };

      const plan = [];
      for (let i = 0; i < 300; i += 1) {
        plan.push({ type: "fill", target: `Field${i}`, value: templates[i % templates.length], xPct: 5, yPct: 5 });
      }

      const resolved = resolveVaultTemplates(plan, profile);
      assert.strictEqual(hasRawTemplate(resolved), false, "a raw placeholder survived resolution");

      const review = reviewPlan(resolved, { autoRunSensible: true, autoRunBenign: true });
      assert.strictEqual(hasRawTemplate(review.actions), false);

      // Everything that could not be resolved must be blank AND gated.
      for (const action of review.actions) {
        if (action._unresolved || action._custody) {
          assert.strictEqual(action.value, "", `${action.target} kept a value it could not resolve`);
          assert.notStrictEqual(action.safety.disposition, "auto", `${action.target} could auto-run`);
        }
      }

      // Drive the survivors: whatever the driver types, it is never a template.
      const d = new InputDriver({ dryRun: true });
      const region = { x: 0, y: 0, width: 200, height: 200 };
      const typed = [];
      for (const action of review.actions) {
        if (action.safety.disposition !== "auto") continue;
        const r = await d.perform(action, { region });
        if (r && r.text != null) typed.push(String(r.text));
        if (action.value) typed.push(String(action.value));
      }
      assert.ok(typed.length > 0, "the resolvable fills must still work — over-refusal is a failure too");
      assert.ok(
        !typed.some((t) => t.includes("{{vault")),
        "a literal {{vault.*}} was sent to the OS"
      );
      assert.ok(!typed.some((t) => t.includes("hunter2")));
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
