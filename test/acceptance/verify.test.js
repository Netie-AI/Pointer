"use strict";
/**
 * WP-P2-VERIFY-DEFAULT — verify the steps that matter, by default.
 *
 * Run: node test/acceptance/verify.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertSuite } = require("../harness/mock-peers");

const ROOT = path.join(__dirname, "..", "..");
const { shouldVerifyStep, verdictWhenSkipped } = require("../../electron/netie/verify");
const { reviewPlan } = require("../../electron/netie/safety");

const has = (action, opts) => shouldVerifyStep(action, { hasRegion: true, ...opts });

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("irreversible controls verify by default", async () => {
      for (const target of ["Send", "Delete account", "Place order", "Publish"]) {
        const out = has({ type: "click", target });
        assert.strictEqual(out.verify, true, `${target} should verify`);
        assert.strictEqual(out.reason, "irreversible");
      }
    }),

    T("launches verify by default — a failed launch aims every later step wrong", async () => {
      assert.strictEqual(has({ type: "open", target: "winword" }).reason, "launch");
      assert.strictEqual(has({ type: "navigate", target: "https://example.com" }).reason, "launch");
    }),

    T("every observable driver verb is verifiable", async () => {
      // OBSERVABLE drifted out of step with the driver's allowlist and dropped
      // `keypress`, so an irreversible Enter was never verified — not even with
      // settings.verifySteps on — and reported "n/a" rather than "skipped".
      const { DRIVER_ACTIONS } = require("../../electron/netie/plan-guard");
      const NON_VISUAL = new Set([
        "observe", "read", "wait", "hover", "movecursor", "scroll",
        "clipboard_get", "copy_clipboard", "copy", "select_copy", "select_all",
        "clipboard_set",
        // The API-first coworker verbs (EPIC-P03). These deliberately change
        // nothing on screen — that is the whole point of writing .docx through
        // OOXML instead of driving Word's UI — so a screenshot diff would
        // report "nothing happened" for a step that succeeded. They are not
        // unverified: they carry their own artifact evidence, asserted below.
        "word_docx_write", "word_from_clipboard", "clipboard_verify",
      ]);
      const missing = DRIVER_ACTIONS.filter(
        (verb) => !NON_VISUAL.has(verb) && !shouldVerifyStep({ type: verb, target: "Send" }, { hasRegion: true, verifyAll: true }).verify
      );
      assert.deepStrictEqual(missing, [], `driver verbs that can never be verified: ${missing}`);
      assert.strictEqual(has({ type: "keypress", target: "Send" }).reason, "irreversible");
    }),

    T("the non-visual coworker verbs carry artifact evidence instead of pixels", async () => {
      // Exempting a verb from screenshot verification is only honest if it
      // proves itself some other way. A .docx write returns the path, the byte
      // count and a sha256 of exactly the bytes on disk (KB R-0001 — assert on
      // the artifact the customer receives).
      const fs = require("fs");
      const os = require("os");
      const path = require("path");
      const crypto = require("crypto");
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-verify-"));
      process.env.NETIE_WORD_OUT_DIR = dir;
      delete require.cache[require.resolve("../../electron/netie/word-coworker")];
      const { writeDocx } = require("../../electron/netie/word-coworker");

      const out = writeDocx({ text: "evidence", stem: "verify" });
      assert.strictEqual(out.ok, true, out.reason || "write failed");
      assert.ok(out.sha256, "a non-visual write must return a digest");
      assert.strictEqual(out.bytes, fs.statSync(out.path).size, "byte count must match disk");
      const onDisk = crypto.createHash("sha256").update(fs.readFileSync(out.path)).digest("hex");
      assert.strictEqual(out.sha256, onDisk, "the digest must describe the bytes on disk");
    }),

    T("routine work does not pay for two captures a step", async () => {
      const out = has({ type: "click", target: "Next" });
      assert.strictEqual(out.verify, false);
      assert.strictEqual(out.reason, "routine");
      assert.strictEqual(has({ type: "type", target: "Search", value: "invoices" }).verify, false);
    }),

    T("settings.verifySteps still forces everything observable", async () => {
      const out = has({ type: "click", target: "Next" }, { verifyAll: true });
      assert.strictEqual(out.verify, true);
      assert.strictEqual(out.reason, "settings.verifySteps");
      // …but never something a screenshot cannot show.
      assert.strictEqual(has({ type: "wait", ms: 100 }, { verifyAll: true }).verify, false);
      assert.strictEqual(has({ type: "observe" }, { verifyAll: true }).verify, false);
    }),

    T("no capture region means no verification, and it says so", async () => {
      const out = shouldVerifyStep({ type: "click", target: "Send" }, { hasRegion: false });
      assert.strictEqual(out.verify, false);
      assert.strictEqual(out.reason, "no-region");
      assert.strictEqual(verdictWhenSkipped("no-region"), "n/a");
      assert.strictEqual(verdictWhenSkipped("routine"), "skipped");
    }),

    T("a reviewed action's own safety verdict is respected", async () => {
      const review = reviewPlan([{ type: "click", target: "Submit payment" }], { autoRunSensible: true });
      const action = review.actions[0];
      assert.strictEqual(action.safety.irreversible, true);
      assert.strictEqual(has(action).verify, true);
    }),

    T("garbage in is a no, not a crash", async () => {
      assert.strictEqual(shouldVerifyStep(null).verify, false);
      assert.strictEqual(shouldVerifyStep({}).verify, false);
    }),

    T("the executor uses the policy instead of an inline verbs list", async () => {
      const main = fs.readFileSync(path.join(ROOT, "electron/main.js"), "utf8");
      assert.ok(main.includes("shouldVerifyStep"), "executeApproved must call shouldVerifyStep");
      assert.ok(main.includes("verdictWhenSkipped"), "skipped steps must report why");
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
