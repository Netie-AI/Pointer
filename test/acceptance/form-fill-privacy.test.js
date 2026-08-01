"use strict";
/** P5 form-fill + privacy + enquire acceptance */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  resolveVaultTemplates,
  missingVaultKeys,
  isSecretPath,
  PROFILE_FIELDS,
  vaultToken,
} = require("../../electron/netie/vault-fill");
const { matchRecipe, RECIPES } = require("../../electron/netie/recipes");

const ROOT = path.join(__dirname, "..", "..");

function T(name, fn) {
  return { name, fn };
}

(async () => {
  const tests = [
    T("travel profile fields exist; passport_name is not a secret", () => {
      const keys = PROFILE_FIELDS.map((f) => f.key);
      assert.ok(keys.includes("passport_name"));
      assert.ok(keys.includes("dob"));
      assert.strictEqual(isSecretPath("profile.passport_name"), false);
      assert.strictEqual(isSecretPath("profile.passport_number"), true);
    }),

    T("unresolved vault keys drive enquire list — placeholders never typed", () => {
      const actions = [
        { type: "type", target: "Email", value: vaultToken("email") },
        { type: "type", target: "Name", value: vaultToken("name") },
      ];
      assert.deepStrictEqual(missingVaultKeys(actions), ["email", "name"]);
      const filled = resolveVaultTemplates(actions, {});
      assert.strictEqual(filled[0].value, "");
      assert.ok(filled[0]._unresolved);
      assert.ok(!hasRaw(filled));
    }),

    T("resolved profile types real values; plan never carried them as templates", () => {
      const actions = [{ type: "type", target: "Email", value: vaultToken("email") }];
      const filled = resolveVaultTemplates(actions, { email: "a@b.co" });
      assert.strictEqual(filled[0].value, "a@b.co");
      assert.strictEqual(missingVaultKeys(actions).length, 1); // still on original
    }),

    T("form_fill_profile and air_ticket_basics recipes emit placeholders only", () => {
      const form = matchRecipe("fill this form with my profile");
      assert.ok(form && form.id === "form_fill_profile");
      assert.ok(form.actions.every((a) => !a.value || a.value.includes("{{vault.") || a.type === "press"));
      const air = matchRecipe("book a flight passenger details");
      assert.ok(air && air.id === "air_ticket_basics");
      assert.ok(RECIPES.air_ticket_basics.actions.some((a) => /passport_name/.test(a.value || "")));
    }),

    T("privacy veil module and html exist; executeApproved arms it", () => {
      assert.ok(fs.existsSync(path.join(ROOT, "electron/netie/privacy-veil.js")));
      assert.ok(fs.existsSync(path.join(ROOT, "electron/privacy-veil.html")));
      const main = fs.readFileSync(path.join(ROOT, "electron/main.js"), "utf8");
      assert.ok(/setPrivacyVeil\(true/.test(main));
      assert.ok(/setPrivacyVeil\(false/.test(main));
      assert.ok(/prepareVaultPlan/.test(main));
      assert.ok(/type:\s*"enquire"/.test(main));
    }),
  ];

  function hasRaw(actions) {
    return actions.some((a) => typeof a.value === "string" && a.value.includes("{{vault."));
  }

  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`PASS  ${t.name}`);
    } catch (err) {
      failed += 1;
      console.log(`FAIL  ${t.name}\n  ${err.message || err}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
