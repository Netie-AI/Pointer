"use strict";
/**
 * The clipboard integrity gate must be able to fire (#16).
 *
 * `clipboardMatchesSource` and its driver wiring implemented exactly what #11
 * asked for - and every shipped recipe emitted the consuming action with no
 * source, so `expected` was null and the whole block was skipped. The gate
 * degraded to "the clipboard is not empty", which stale content passes trivially.
 *
 * That matters most in the context the recipe is named for: in a terminal Ctrl+C
 * sends SIGINT rather than copying, so the clipboard routinely still holds
 * unrelated earlier content, and 37 characters of it were written into a .docx
 * with ok: true.
 *
 * The existing suite could not catch this because its assertions were
 * presence-only - `actions.some(a => a.type === "word_from_clipboard")`. An
 * action existing is not the same as an action that can do its job (KB F-0005).
 */
const assert = require("assert");
const { RECIPES, expandRecipe, matchRecipe } = require("../electron/netie/recipes");
const { InputDriver } = require("../electron/netie/driver");
const { reviewPlan } = require("../electron/netie/safety");

let failures = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS ${name}`))
    .catch((err) => {
      failures += 1;
      console.error(`FAIL ${name}: ${err.message}`);
    });
}

/** Verbs that consume the clipboard as if it were the user's selection. */
const CONSUMERS = ["word_from_clipboard", "clipboard_verify", "clipboard_paste", "paste"];

/** A fake clipboard the driver reads through, so no OS clipboard is touched. */
function rig({ initial = "", onCopy = null } = {}) {
  let clip = initial;
  const driver = new InputDriver({ dryRun: false });
  driver.clipboardGet = async () => ({ ok: true, text: clip });
  driver.press = async (combo) => {
    // The whole point: in a terminal ctrl+c does NOT copy.
    if (combo === "ctrl+c" && onCopy) clip = onCopy(clip);
    return { ok: true };
  };
  driver._send = async () => ({ ok: true });
  return { driver, get clip() { return clip; } };
}

(async () => {
  await check("every recipe that consumes the clipboard records a baseline first", () => {
    const offenders = [];
    for (const [id, recipe] of Object.entries(RECIPES)) {
      const actions = recipe.actions || [];
      const consumerIdx = actions.findIndex((a) => CONSUMERS.includes(a.type));
      if (consumerIdx === -1) continue;
      const consumer = actions[consumerIdx];
      // Either it carries an explicit source, or a baseline was recorded before it.
      const hasSource = consumer.value != null || consumer.source != null;
      const hasBaseline = actions
        .slice(0, consumerIdx)
        .some((a) => a.type === "clipboard_baseline");
      if (!hasSource && !hasBaseline) offenders.push(`${id}.${consumer.type}`);
    }
    assert.deepStrictEqual(
      offenders,
      [],
      `these consume the clipboard with nothing to compare against, so the ` +
        `integrity gate cannot fire: ${offenders.join(", ")}`
    );
  });

  await check("a baseline recorded is a baseline used", () => {
    // A baseline nobody reads is clutter that looks like a control.
    const unused = [];
    for (const [id, recipe] of Object.entries(RECIPES)) {
      const actions = recipe.actions || [];
      const b = actions.findIndex((a) => a.type === "clipboard_baseline");
      if (b === -1) continue;
      if (!actions.slice(b).some((a) => CONSUMERS.includes(a.type))) unused.push(id);
    }
    assert.deepStrictEqual(unused, [], `baseline recorded but never checked: ${unused.join(", ")}`);
  });

  await check("the baseline verb survives the plan guard and is READ-tier", () => {
    const reviewed = reviewPlan([{ type: "clipboard_baseline" }], {});
    assert.strictEqual(reviewed.actions.length, 1, "the guard dropped clipboard_baseline");
    assert.strictEqual(reviewed.actions[0].safety.tierName, "read");
    assert.strictEqual(reviewed.actions[0].safety.disposition, "auto");
  });

  await check("a terminal Ctrl+C that does NOT copy is refused, not written", async () => {
    // The exact scenario from the ticket: stale clipboard, ctrl+c is SIGINT.
    const { driver } = rig({ initial: "unrelated earlier content, 37 chars..", onCopy: (c) => c });
    await driver.perform({ type: "clipboard_baseline" });
    const r = await driver.perform({ type: "word_from_clipboard" });
    assert.strictEqual(r.ok, false, "stale clipboard was accepted as the source of truth");
    assert.ok(/unchanged after copy/i.test(r.error), `reason was: ${r.error}`);
    assert.ok(/\d+ chars before/.test(r.error), "the refusal must name the length mismatch");
    assert.ok(/terminal/i.test(r.error), "the refusal should say why this happens");
  });

  await check("a whitespace-only copy is refused, not written as a stub", async () => {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-clip-stub-"));
    process.env.NETIE_WORD_OUT_DIR = dir;
    const { driver } = rig({ initial: "", onCopy: () => "\n" });
    await driver.perform({ type: "clipboard_baseline" });
    const r = await driver.perform({ type: "word_from_clipboard" });
    assert.strictEqual(r.ok, false, "whitespace clipboard wrote a stub .docx");
    assert.ok(/visible text/i.test(r.error), `reason was: ${r.error}`);
    assert.deepStrictEqual(fs.readdirSync(dir), [], "a refused stub still created a file");
  });

  await check("a copy that DOES land is accepted (R-0005)", async () => {
    const { driver } = rig({ initial: "old", onCopy: () => "the actual selection" });
    await driver.perform({ type: "clipboard_baseline" });
    const r = await driver.perform({ type: "clipboard_verify" });
    assert.strictEqual(r.ok, true, `a legitimate copy was refused: ${r.error}`);
    assert.strictEqual(r.text, "the actual selection");
  });

  await check("the retry recovers a copy the plan's own Ctrl+C missed", async () => {
    // The plan pressed ctrl+c and nothing landed (clipboard still == baseline).
    // The driver gets exactly one more go before refusing; here it lands.
    let retries = 0;
    const { driver } = rig({
      initial: "old",
      onCopy: () => {
        retries += 1;
        return "recovered selection";
      },
    });
    await driver.perform({ type: "clipboard_baseline" });
    const r = await driver.perform({ type: "word_from_clipboard" });
    assert.strictEqual(retries, 1, "the driver did not retry exactly once");
    assert.strictEqual(r.ok, true, `the retry did not recover: ${r.error}`);
  });

  await check("an explicit source still wins over the baseline", async () => {
    // The #11 path must be untouched by this: when the action carries a source,
    // that is what is compared, and the baseline is irrelevant.
    const { driver } = rig({ initial: "exact expected text" });
    await driver.perform({ type: "clipboard_baseline" });
    const r = await driver.perform({ type: "clipboard_verify", value: "exact expected text" });
    assert.strictEqual(r.ok, true, `an exact source match was refused: ${r.error}`);
  });

  await check("an explicit source that does NOT match is still refused", async () => {
    const { driver } = rig({ initial: "something else entirely" });
    const r = await driver.perform({ type: "clipboard_verify", value: "the expected selection" });
    assert.strictEqual(r.ok, false, "a clipboard mismatch was accepted");
  });

  await check("the shipped terminal_to_word plan still expands and reviews clean", () => {
    // R-0005: the recipe must still be runnable end to end after the change.
    const recipe = expandRecipe(matchRecipe("copy this into word"), {});
    assert.ok(recipe, "terminal_to_word no longer matches its own phrase");
    const reviewed = reviewPlan(recipe.actions, { autoRunSensible: true });
    assert.strictEqual(reviewed.dropped.length, 0, `guard dropped: ${JSON.stringify(reviewed.dropped)}`);
    assert.strictEqual(reviewed.actions[0].type, "clipboard_baseline", "baseline must run first");
  });

  if (failures) {
    console.error(`\n${failures} failed`);
    process.exit(1);
  }
  console.log("\nclipboard-integrity: all passed");
})();
