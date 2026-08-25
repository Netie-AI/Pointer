"use strict";
/**
 * P5-ENQUIRE — asking the human for the profile fields the vault lacks.
 *
 * The wiring tests at the bottom exist because this feature was, until now,
 * exactly the defect the adversarial pass flagged twice (C-17, C-19): main.js
 * emitted an `enquire` event, an acceptance test asserted the contract, and no
 * renderer ever consumed it. A panel nobody can answer is not a feature.
 *
 * Run: node test/acceptance/enquire.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertSuite } = require("../harness/mock-peers");

const ROOT = path.join(__dirname, "..", "..");
const enquire = require("../../electron/netie/enquire");
const { missingVaultKeys, resolveVaultTemplates } = require("../../electron/netie/vault-fill");
const { RECIPES } = require("../../electron/netie/recipes");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("missing keys become answerable prompts, with labels", async () => {
      const prompts = enquire.fieldsToPrompts(["email", "dob", "passport_name"]);
      assert.deepStrictEqual(prompts.map((p) => p.key), ["email", "dob", "passport_name"]);
      assert.strictEqual(prompts[0].label, "Email");
      assert.ok(prompts[0].hint, "a hint makes the field unambiguous");
    }),

    T("a secret is never rendered as an input", async () => {
      // The whole point of custody is that the agent cannot learn these. An
      // enquire box that asked for one would route straight around it.
      const prompts = enquire.fieldsToPrompts(["password", "otp", "card_number", "email"]);
      assert.deepStrictEqual(prompts.map((p) => p.key), ["email"]);
      // passport_name is travel data, not the passport number — it must stay askable.
      assert.deepStrictEqual(enquire.fieldsToPrompts(["passport_name"]).map((p) => p.key), ["passport_name"]);
      assert.deepStrictEqual(enquire.fieldsToPrompts(["passport_number"]), []);
    }),

    T("unknown keys and duplicates never reach the panel", async () => {
      assert.deepStrictEqual(enquire.fieldsToPrompts(["bogus", "__proto__", ""]), []);
      assert.strictEqual(enquire.fieldsToPrompts(["email", "email"]).length, 1);
      assert.deepStrictEqual(enquire.fieldsToPrompts(null), []);
    }),

    T("the panel is a form, not a questionnaire", async () => {
      const many = Array.from({ length: 20 }, () => "email");
      assert.ok(enquire.fieldsToPrompts(many).length <= enquire.MAX_FIELDS);
      const all = ["name", "email", "phone", "city", "state", "country", "website"];
      assert.strictEqual(enquire.fieldsToPrompts(all).length, enquire.MAX_FIELDS);
    }),

    T("answers are sanitised for a keyboard, not a database", async () => {
      // These are typed to the OS later: a newline submits the form the agent is
      // halfway through, a tab moves focus and puts the rest in the next field.
      const nasty = `Ada${String.fromCharCode(9)}Lovelace${String.fromCharCode(10)}SUBMIT${String.fromCharCode(0)}`;
      assert.strictEqual(enquire.sanitizeValue(nasty), "Ada Lovelace SUBMIT");
      assert.strictEqual(enquire.sanitizeValue("  spaced   out  "), "spaced out");
      assert.strictEqual(enquire.sanitizeValue(null), "");
      assert.ok(enquire.sanitizeValue("x".repeat(9999)).length <= enquire.MAX_VALUE_LEN);
    }),

    T("validate accepts profile fields, refuses secrets loudly", async () => {
      const out = enquire.validateAnswers({
        email: "ada@example.com",
        password: "hunter2",
        bogus: "x",
        city: "   ",
      });
      assert.deepStrictEqual(out.profile, { email: "ada@example.com" });
      assert.deepStrictEqual(out.accepted, ["email"]);
      assert.strictEqual(out.rejected.length, 2);
      const secret = out.rejected.find((r) => r.key === "password");
      assert.ok(/custody/i.test(secret.reason), secret.reason);
      // Blank means "skip", not "store an empty string over what I had".
      assert.ok(!("city" in out.profile));
      assert.ok(!JSON.stringify(out).includes("hunter2"), "a refused secret must not be echoed back");
    }),

    T("garbage in is a refusal, not a crash", async () => {
      for (const bad of [null, undefined, "string", 42, []]) {
        const out = enquire.validateAnswers(bad);
        assert.deepStrictEqual(out.profile, {});
      }
      assert.strictEqual(enquire.describeResult(), "Nothing to save");
      assert.ok(enquire.describeResult({ accepted: ["email"] }).includes("email"));
    }),

    // ── through the real pipeline ──────────────────────────────────────────
    T("PIPELINE: a real recipe's gaps become a real panel", async () => {
      const actions = RECIPES.form_fill_profile.actions.map((a) => ({ ...a }));
      const missing = missingVaultKeys(actions);
      assert.ok(missing.length, "the recipe should need something");
      const prompts = enquire.fieldsToPrompts(missing);
      assert.ok(prompts.length, "…and every gap should be askable");

      // Answer them, and the same plan now resolves with no placeholder left.
      const answers = Object.fromEntries(prompts.map((p) => [p.key, `value-${p.key}`]));
      const { profile } = enquire.validateAnswers(answers);
      const resolved = resolveVaultTemplates(actions, profile);
      assert.strictEqual(
        resolved.some((a) => a._unresolved),
        false,
        "answering the panel must actually complete the plan"
      );
      assert.strictEqual(resolved[0].value, `value-${prompts[0].key}`);
    }),

    T("PIPELINE: the air-ticket recipe never asks for the passport number", async () => {
      const actions = RECIPES.air_ticket_basics.actions.map((a) => ({ ...a }));
      const prompts = enquire.fieldsToPrompts(missingVaultKeys(actions));
      assert.ok(
        !prompts.some((p) => /passport_(number|no|id)/.test(p.key)),
        "the passport number is custody's, not the profile's"
      );
    }),

    // ── wiring ─────────────────────────────────────────────────────────────
    T("the panel exists, is a form, and can be answered", async () => {
      const html = read("electron/hud.html");
      assert.ok(html.includes('id="enquire-panel"'), "hud.html needs the enquire panel");
      assert.ok(
        /<form[^>]*id="enquire-panel"/.test(html),
        "a <form> gives Enter-to-submit and focus order for free — do not hand-roll it"
      );
      assert.ok(html.includes('id="enquire-fields"'), "fields are built at runtime");

      const js = read("electron/hud.js");
      assert.ok(js.includes("renderEnquire"), "hud.js must render the panel");
      assert.ok(/event.type === "enquire"/.test(js), "the enquire event must have a consumer");
      assert.ok(js.includes("hud:enquireSave"), "answers must reach main");
      // Labels come from a plan, and a plan can come from a model reading the
      // screen — so they are text, never markup.
      assert.ok(
        !/enquireFields\.innerHTML\s*=/.test(js),
        "build the panel with textContent/createElement, never innerHTML"
      );

      const preload = read("electron/hud-preload.js");
      assert.ok(preload.includes("hud:enquireSave"), "the channel must be allowlisted");
      assert.ok(preload.includes("hud:enquireCancel"), "cancel must be allowlisted too");
    }),

    T("answering a form is not an approval", async () => {
      const main = read("electron/main.js");
      const handler = main.slice(main.indexOf('ipcMain.handle("hud:enquireSave"'));
      assert.ok(
        handler.includes("secureBeforeAct"),
        "the resumed plan must re-enter the Cortex gate — this is the C-09 hole on a new path"
      );
      assert.ok(handler.includes("maybeRunPlan"), "and the normal approval path");
      assert.ok(handler.includes("reviewPlan"), "and safety review");
      // The ledger records which fields were filled, never what was typed.
      assert.ok(
        /clicks\.enquire\.saved[\s\S]{0,200}accepted/.test(handler),
        "the audit must carry keys"
      );
      assert.ok(
        !/clicks\.enquire\.saved[\s\S]{0,200}profile[,)]/.test(handler),
        "the audit must not carry the values the user just typed"
      );
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
