"use strict";
/**
 * WP-P1-SKILLS-EXEC — a skill hit must change the plan, not just the toast.
 *
 * Run: node test/acceptance/skills-exec.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertSuite } = require("../harness/mock-peers");

const ROOT = path.join(__dirname, "..", "..");
const skills = require("../../electron/netie/skills-exec");
const vf = require("../../electron/netie/vault-fill");
const { RECIPES } = require("../../electron/netie/recipes");
const { reviewPlan } = require("../../electron/netie/safety");

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("a form-fill hit becomes real actions", async () => {
      const actions = skills.expandSkillsToActions(
        [{ id: "form-fill", title: "Form fill" }],
        { instruction: "fill my email", profile: { email: "ada@example.com" } }
      );
      assert.ok(Array.isArray(actions) && actions.length >= 1, "expected at least one action");
      assert.ok(actions.every((a) => a.type), "every action needs a type");
      assert.ok(actions.every((a) => a.skill === "form-fill"), "provenance must survive");
      assert.strictEqual(actions[0].type, "fill");
    }),

    T("the expanded plan carries a placeholder, never the address", async () => {
      const actions = skills.expandSkillsToActions(
        [{ id: "form-fill" }],
        { instruction: "fill my email", profile: { email: "ada@example.com" } }
      );
      const blob = JSON.stringify(actions);
      assert.ok(!blob.includes("ada@example.com"), "personal data must not enter the plan");
      assert.ok(blob.includes("{{vault.profile.email}}"), "expected the vault placeholder");
      // …and it resolves at the last moment, so the feature still works.
      const resolved = vf.resolveVaultTemplates(actions, { email: "ada@example.com" });
      assert.strictEqual(resolved[0].value, "ada@example.com");
    }),

    T("naming a field fills that field; naming none fills what we hold", async () => {
      const profile = { email: "a@b.c", phone: "555", city: "Kuala Lumpur" };
      const one = skills.expandSkillsToActions([{ id: "form-fill" }], { instruction: "fill my email", profile });
      assert.deepStrictEqual(one.map((a) => a.profileKey), ["email"]);

      const all = skills.expandSkillsToActions([{ id: "form-fill" }], { instruction: "fill in the form", profile });
      assert.deepStrictEqual(all.map((a) => a.profileKey).sort(), ["city", "email", "phone"]);
      // Never invent a field the profile does not have.
      assert.ok(!all.some((a) => a.profileKey === "passport"));
    }),

    T("a Cortex executable skill (C25-02) is used verbatim", async () => {
      const actions = skills.expandSkillsToActions(
        [
          {
            id: "excel-fill-right",
            title: "Excel fill right",
            actions: [
              { type: "press", value: "ctrl+c" },
              { type: "press", value: "right" },
              { type: "press", value: "ctrl+v" },
            ],
          },
        ],
        { instruction: "fill right" }
      );
      assert.deepStrictEqual(actions.map((a) => a.value), ["ctrl+c", "right", "ctrl+v"]);
      assert.ok(actions.every((a) => a.skill === "excel-fill-right"));
    }),

    T("a skill cannot smuggle a verb past the allowlist", async () => {
      const actions = skills.expandSkillsToActions(
        [
          {
            id: "sketchy",
            actions: [
              { type: "click", target: "OK" },
              { type: "exfiltrate", target: "everything" },
              { type: "run_shell", value: "del /s C:\\" },
            ],
          },
        ],
        {}
      );
      assert.deepStrictEqual(actions.map((a) => a.type), ["click"]);
      // Belt and braces: plan-guard drops anything that got this far too.
      const review = reviewPlan(
        [{ type: "exfiltrate", target: "everything" }],
        { autoRunSensible: true }
      );
      assert.strictEqual(review.actions.length, 0);
    }),

    T("a skill id that matches a local recipe expands deterministically", async () => {
      const actions = skills.expandSkillsToActions([{ id: "copy_all" }], { recipes: RECIPES });
      assert.deepStrictEqual(actions.map((a) => a.value), ["ctrl+a", "ctrl+c"]);
      assert.ok(actions.every((a) => a.skill === "copy_all"));
    }),

    T("no hits means no actions and no noise", async () => {
      assert.deepStrictEqual(skills.expandSkillsToActions([], {}), []);
      assert.deepStrictEqual(skills.expandSkillsToActions(null, {}), []);
      assert.strictEqual(skills.skillPreamble([]), "");
      assert.strictEqual(skills.describeExpansion([], []), "");
    }),

    T("an unexpandable hit still steers the planner", async () => {
      const hits = [{ id: "sap-invoice-flow", title: "SAP invoice flow" }];
      const actions = skills.expandSkillsToActions(hits, { instruction: "post the invoice" });
      assert.deepStrictEqual(actions, [], "we do not know how to script it");
      const preamble = skills.skillPreamble(hits);
      assert.ok(preamble.includes("SAP invoice flow"), preamble);
      assert.ok(skills.describeExpansion(hits, []).includes("SAP invoice flow"));
    }),

    T("expanded actions survive the safety pipeline as normal actions", async () => {
      const actions = skills.expandSkillsToActions(
        [{ id: "form-fill" }],
        { instruction: "fill my email", profile: { email: "a@b.c" } }
      );
      const resolved = vf.resolveVaultTemplates(actions, { email: "a@b.c" });
      const review = reviewPlan(resolved, { autoRunSensible: true });
      assert.strictEqual(review.actions.length, 1);
      assert.strictEqual(review.actions[0].safety.disposition, "auto");
      assert.strictEqual(review.refused.length, 0);
    }),

    T("the act path actually expands skills", async () => {
      const main = fs.readFileSync(path.join(ROOT, "electron/main.js"), "utf8");
      assert.ok(main.includes("skills-exec"), "main.js must require skills-exec");
      assert.ok(
        main.includes("expandSkillsToActions"),
        "findSkills hits must reach expandSkillsToActions — a toast is not execution"
      );
      assert.ok(main.includes("skillPreamble"), "unexpandable hits must still steer the planner");
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
