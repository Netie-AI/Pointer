"use strict";
/**
 * WP-P1-VAULT-FILL — `{{vault.*}}` resolution before anything is typed.
 *
 * The tests that matter are the last three: they run the resolver through the
 * real safety pipeline (reviewPlan) and assert on the disposition the driver
 * would actually see. A resolver that returns a nicely-flagged object which
 * then auto-runs anyway is the failure this WP exists to prevent.
 *
 * Run: node test/acceptance/vault-fill.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertSuite } = require("../harness/mock-peers");

const ROOT = path.join(__dirname, "..", "..");
const vf = require("../../electron/netie/vault-fill");
const { reviewPlan } = require("../../electron/netie/safety");

const PROFILE = { "profile.email": "ada@example.com", "profile.name": "Ada Lovelace" };

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("resolves a placeholder and leaves literals alone", async () => {
      const out = vf.resolveVaultTemplates(
        [
          { type: "fill", target: "Email", value: "{{vault.profile.email}}" },
          { type: "fill", target: "Note", value: "literal" },
        ],
        PROFILE
      );
      assert.strictEqual(out[0].value, "ada@example.com");
      assert.strictEqual(out[0]._vaultFilled, true);
      assert.strictEqual(out[1].value, "literal");
      assert.strictEqual(out[1]._vaultFilled, undefined);
    }),

    T("reads flat, nested and bare profiles — a real export is all three", async () => {
      const action = [{ type: "fill", value: "{{vault.profile.email}}" }];
      assert.strictEqual(vf.resolveVaultTemplates(action, { "profile.email": "a@b.c" })[0].value, "a@b.c");
      assert.strictEqual(vf.resolveVaultTemplates(action, { profile: { email: "a@b.c" } })[0].value, "a@b.c");
      assert.strictEqual(vf.resolveVaultTemplates(action, { email: "a@b.c" })[0].value, "a@b.c");
    }),

    T("does not mutate the plan it was given", async () => {
      const original = [{ type: "fill", value: "{{vault.profile.email}}" }];
      vf.resolveVaultTemplates(original, PROFILE);
      assert.strictEqual(original[0].value, "{{vault.profile.email}}");
    }),

    T("an unresolved placeholder is never left in a typed value", async () => {
      const out = vf.resolveVaultTemplates([{ type: "fill", value: "{{vault.missing}}" }], PROFILE);
      assert.ok(out[0]._unresolved, "must be flagged");
      assert.strictEqual(out[0].value, "", "the raw token must not survive into value");
      assert.strictEqual(vf.hasRawTemplate(out), false);
    }),

    T("one miss blanks the whole value — half a name is worse than none", async () => {
      const out = vf.resolveVaultTemplates(
        [{ type: "fill", value: "{{vault.profile.name}} <{{vault.profile.nickname}}>" }],
        PROFILE
      );
      assert.strictEqual(out[0].value, "");
      assert.ok(out[0]._unresolved);
      assert.ok(!/Ada/.test(out[0].value), "no partial fill");
    }),

    T("secrets never resolve, even when the profile holds one", async () => {
      const loaded = { ...PROFILE, "profile.password": "hunter2", "profile.otp": "123456" };
      const out = vf.resolveVaultTemplates(
        [
          { type: "fill", target: "Password", value: "{{vault.profile.password}}" },
          { type: "fill", target: "Code", value: "{{vault.profile.otp}}" },
        ],
        loaded
      );
      for (const a of out) {
        assert.strictEqual(a.value, "", "a secret must never reach a typed value");
        assert.ok(a._custody, "must be routed to custody");
      }
      assert.ok(!JSON.stringify(out).includes("hunter2"), "the secret must not appear anywhere in the plan");
      assert.strictEqual(vf.isSecretPath("profile.card_number"), true);
      assert.strictEqual(vf.isSecretPath("profile.email"), false);
    }),

    T("hasRawTemplate is stateless across calls", async () => {
      const raw = [{ type: "fill", value: "{{vault.profile.email}}" }];
      // A /g regex reused with .test() returns false every other call.
      assert.strictEqual(vf.hasRawTemplate(raw), true);
      assert.strictEqual(vf.hasRawTemplate(raw), true);
      assert.strictEqual(vf.hasRawTemplate(raw), true);
    }),

    T("field labels on screen map to profile keys, longest alias wins", async () => {
      assert.strictEqual(vf.matchProfileField("E-mail address"), "email");
      assert.strictEqual(vf.matchProfileField("Street address"), "address1");
      assert.strictEqual(vf.matchProfileField("Zip code"), "postcode");
      assert.strictEqual(vf.matchProfileField("Nothing here"), null);
    }),

    // ── through the real pipeline ─────────────────────────────────────────
    T("PIPELINE: unresolved fill can never auto-run", async () => {
      const resolved = vf.resolveVaultTemplates([{ type: "fill", target: "Email", value: "{{vault.missing}}" }], PROFILE);
      // autoRunSensible is the most permissive policy the product ships.
      const review = reviewPlan(resolved, { autoRunSensible: true, autoRunBenign: true });
      assert.strictEqual(review.actions.length, 1);
      assert.strictEqual(review.actions[0].safety.disposition, "approve");
      assert.strictEqual(review.needsApproval, true);
      assert.strictEqual(review.autoOnly, false);
    }),

    T("PIPELINE: a secret fill lands in custody, not in the driver", async () => {
      const resolved = vf.resolveVaultTemplates(
        [{ type: "fill", target: "Password", value: "{{vault.profile.password}}" }],
        { "profile.password": "hunter2" }
      );
      const review = reviewPlan(resolved, { autoRunSensible: true });
      assert.strictEqual(review.actions[0].safety.disposition, "custody");
      assert.strictEqual(review.custody.length, 1);
    }),

    T("PIPELINE: custody survives a label the word list has never heard of", async () => {
      // The test above passes for the wrong reason: "Password" is in
      // SECRET_TARGET_WORDS, so safety.decide() reaches custody on its own even
      // if reviewPlan discards what vault-fill decided. These labels are not in
      // the list, and the value has already been blanked, so decide() has no
      // text left to go on — `_custody` is the only thing carrying the fact.
      const cases = [
        { target: "Recovery words", path: "recovery_phrase" },
        { target: "Code", path: "otp" },
        { target: "", path: "api_key" },
        { target: "MFA", path: "mfa" },
      ];
      for (const { target, path: p } of cases) {
        const resolved = vf.resolveVaultTemplates(
          [{ type: "fill", target, value: `{{vault.profile.${p}}}` }],
          { [`profile.${p}`]: "s3cret-value" }
        );
        const review = reviewPlan(resolved, { autoRunSensible: true, autoRunBenign: true });
        assert.strictEqual(
          review.actions[0].safety.disposition,
          "custody",
          `"${target || "(no label)"}" / ${p} was downgraded out of custody`
        );
        assert.strictEqual(review.custody.length, 1, `"${target}" missing from review.custody`);
        assert.strictEqual(review.actions[0].value, "");
        assert.ok(!JSON.stringify(review).includes("s3cret-value"));
      }
    }),

    T("PIPELINE: a resolved fill is still allowed to run — no over-refusal", async () => {
      // R-0005: a control that refuses legitimate work is a failure, not a win.
      const resolved = vf.resolveVaultTemplates(
        [{ type: "fill", target: "Email", value: "{{vault.profile.email}}" }],
        PROFILE
      );
      const review = reviewPlan(resolved, { autoRunSensible: true });
      assert.strictEqual(review.actions[0].value, "ada@example.com");
      assert.strictEqual(review.actions[0].safety.disposition, "auto");
      assert.strictEqual(review.autoOnly, true);
    }),

    T("the act path resolves before it executes", async () => {
      const main = fs.readFileSync(path.join(ROOT, "electron/main.js"), "utf8");
      assert.ok(main.includes("vault-fill"), "main.js must require vault-fill");
      assert.ok(main.includes("resolveVaultTemplates"), "main.js must resolve before executing");
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
