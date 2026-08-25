"use strict";
/**
 * WP-P2-CUSTODY-INJECT — OpenVault fills the secret, the plan continues.
 *
 * Run: node test/acceptance/custody.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createMockPeers, assertSuite } = require("../harness/mock-peers");
const { NetieEcosystem } = require("../../electron/netie/ecosystem");
const { reviewPlan } = require("../../electron/netie/safety");
const { resolveVaultTemplates } = require("../../electron/netie/vault-fill");
const { observeResults } = require("../../electron/netie/replan");

const ROOT = path.join(__dirname, "..", "..");
const ecoWith = (opts) =>
  new NetieEcosystem({
    fetchImpl: createMockPeers(opts).fetchImpl,
    cortexUrl: "http://127.0.0.1:8010",
    openvaultUrl: "http://127.0.0.1:5000",
  });

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("an injected secret reports injected, not pending", async () => {
      const eco = ecoWith({ injectOk: true });
      const r = await eco.requestCustody({ field: "password", target: "Password" });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.injected, true);
      assert.strictEqual(r.pending, false, "an injected field is not still waiting");
      assert.strictEqual(r.field, "password");
    }),

    T("custody not shipped is an honest no, not a fake yes", async () => {
      const eco = ecoWith({ injectOk: false });
      const r = await eco.requestCustody({ field: "password", target: "Password" });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.injected, false);
      assert.strictEqual(r.pending, true);
      assert.ok(/type this secret yourself/i.test(r.message), r.message);
    }),

    T("OpenVault unreachable never throws into the plan loop", async () => {
      const eco = ecoWith({ ovDown: true });
      const r = await eco.requestCustody({ field: "otp", target: "One-time code" });
      assert.strictEqual(r.injected, false);
      assert.strictEqual(r.ok, false);
      assert.ok(r.error, "the reason must be reported");
    }),

    T("both the request and the verdict reach the ledger", async () => {
      const peers = createMockPeers({ injectOk: true });
      const eco = new NetieEcosystem({ fetchImpl: peers.fetchImpl });
      await eco.requestCustody({ field: "password", target: "Password" });
      const types = peers.state.audit.map((e) => e.event_type);
      assert.ok(types.includes("clicks.custody.requested"), types.join(","));
      assert.ok(types.includes("clicks.custody.result"), types.join(","));
      assert.strictEqual(peers.state.custody, 1);
    }),

    T("the secret itself never leaves the device", async () => {
      const peers = createMockPeers({ injectOk: true });
      const eco = new NetieEcosystem({ fetchImpl: peers.fetchImpl });
      // A plan that "knows" the password must still not carry it.
      const resolved = resolveVaultTemplates(
        [{ type: "fill", target: "Password", value: "{{vault.profile.password}}" }],
        { "profile.password": "hunter2" }
      );
      const review = reviewPlan(resolved, { autoRunSensible: true });
      assert.strictEqual(review.actions[0].safety.disposition, "custody");
      await eco.requestCustody({ field: "password", target: "Password" });
      assert.ok(
        !JSON.stringify(peers.state.audit).includes("hunter2"),
        "the ledger must not contain the secret"
      );
    }),

    T("an injected step counts as done, so the plan does not replan around it", async () => {
      // Mirrors what executeApproved now records for injected custody steps.
      const obs = observeResults([
        { action: { type: "fill", target: "Password" }, ok: true, via: "custody" },
        { action: { type: "click", target: "Sign in" }, ok: true },
      ]);
      assert.strictEqual(obs.failCount, 0);
      assert.strictEqual(obs.completed, 2);
    }),

    T("the executor continues on inject", async () => {
      const main = fs.readFileSync(path.join(ROOT, "electron/main.js"), "utf8");
      assert.ok(
        /custody\.injected\s*===\s*true/.test(main),
        "executeApproved must continue the plan when OpenVault injected the value"
      );
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
