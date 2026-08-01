"use strict";
const assert = require("assert");
const { matchRecipe, expandRecipe } = require("../electron/netie/recipes");

let pass = 0;
const fails = [];
function test(name, fn) {
  try {
    fn();
    pass += 1;
    console.log("PASS " + name);
  } catch (err) {
    fails.push(name);
    console.log("FAIL " + name + " -- " + err.message);
  }
}

test("copy matches obvious request", () => {
  assert.deepStrictEqual(matchRecipe("copy this").actions, [{ type: "press", value: "ctrl+c" }]);
});

test("paste matches obvious request", () => {
  assert.strictEqual(matchRecipe("Please paste here.").id, "paste");
});

test("copy all selects then copies", () => {
  assert.deepStrictEqual(matchRecipe("copy all").actions, [
    { type: "press", value: "ctrl+a" },
    { type: "press", value: "ctrl+c" },
  ]);
});

test("paste text extracts payload", () => {
  assert.deepStrictEqual(matchRecipe("paste: Hello, world!").actions, [
    { type: "clipboard_paste", value: "Hello, world!" },
  ]);
});

test("paste text supports multiline payload", () => {
  assert.strictEqual(matchRecipe("paste: first\nsecond").actions[0].value, "first\nsecond");
});

test("duplicate down uses Excel shortcut sequence", () => {
  assert.deepStrictEqual(matchRecipe("duplicate cell down").actions.map((action) => action.value), [
    "ctrl+c",
    "down",
    "ctrl+v",
  ]);
});

test("fill right uses Excel shortcut sequence", () => {
  assert.deepStrictEqual(matchRecipe("fill right").actions.map((action) => action.value), [
    "ctrl+c",
    "right",
    "ctrl+v",
  ]);
});

test("fill left and merge cells", () => {
  assert.deepStrictEqual(matchRecipe("fill left").actions.map((a) => a.value || a.type), [
    "ctrl+c",
    "left",
    "ctrl+v",
  ]);
  assert.strictEqual(matchRecipe("merge cells").id, "merge_cells");
  assert.ok(matchRecipe("merge cells").actions.length >= 4);
});

test("undo and save match", () => {
  assert.strictEqual(matchRecipe("undo last").actions[0].value, "ctrl+z");
  assert.strictEqual(matchRecipe("save this file").actions[0].value, "ctrl+s");
});

test("terminal to word coworker recipe", () => {
  const r = matchRecipe("copy this terminal into word");
  assert.strictEqual(r.id, "terminal_to_word");
  assert.ok(r.actions.some((a) => a.type === "open" && a.target === "winword"));
  assert.ok(r.actions.some((a) => a.value === "ctrl+v"));
});

test("claude to cursor and create slides", () => {
  assert.strictEqual(matchRecipe("hand off claude output to cursor").id, "claude_to_cursor");
  assert.strictEqual(matchRecipe("create slides from this").id, "create_slides");
  assert.strictEqual(matchRecipe("context almost full continue in new chat").id, "continue_due_context");
});

test("ambiguous prose does not match", () => {
  assert.strictEqual(matchRecipe("copy this, then email it to Pat"), null);
  assert.strictEqual(matchRecipe(""), null);
  assert.strictEqual(matchRecipe(null), null);
});

test("copy can expand with click coordinates", () => {
  const recipe = matchRecipe("copy that");
  const expanded = expandRecipe(recipe, { coords: { x: 12, y: 34 } });
  assert.deepStrictEqual(expanded.actions[0], { type: "click", x: 12, y: 34 });
  assert.strictEqual(recipe.actions.length, 1);
});

// ── WP-P1-RECIPES-EXPAND ────────────────────────────────────────────────────

test("Excel SOPs match", () => {
  assert.strictEqual(matchRecipe("autosum").id, "excel_autosum");
  assert.strictEqual(matchRecipe("sum this column").id, "excel_autosum");
  assert.strictEqual(matchRecipe("new sheet").id, "excel_new_sheet");
  assert.strictEqual(matchRecipe("add a new worksheet").id, "excel_new_sheet");
  assert.strictEqual(matchRecipe("format this as currency").actions[0].value, "ctrl+shift+4");
  assert.strictEqual(matchRecipe("select column").actions[0].value, "ctrl+space");
  assert.strictEqual(matchRecipe("select row").actions[0].value, "shift+space");
});

test("browser SOPs match, and never navigate by typing a URL", () => {
  assert.strictEqual(matchRecipe("new tab").id, "browser_new_tab");
  assert.deepStrictEqual(matchRecipe("open a new tab").actions, [{ type: "press", value: "ctrl+t" }]);
  assert.strictEqual(matchRecipe("next field").actions[0].value, "tab");
  assert.strictEqual(matchRecipe("find and replace").actions[0].value, "ctrl+h");
});

test("find on page extracts the term and stays in-page", () => {
  const r = matchRecipe("find invoice total on this page");
  assert.strictEqual(r.id, "browser_find");
  assert.strictEqual(r.actions[0].value, "ctrl+f");
  assert.ok(r.actions.some((a) => a.type === "type" && a.value === "invoice total"));
  // Nothing that hands the machine to another app / URL.
  assert.ok(!r.actions.some((a) => a.type === "open" || a.type === "navigate"));
  assert.strictEqual(matchRecipe('find "Q3 revenue" on the page').actions[2].value, "Q3 revenue");
});

test("save as types the name but leaves the overwrite to the human", () => {
  const r = matchRecipe("save as q3-report.xlsx");
  assert.strictEqual(r.id, "save_as");
  assert.strictEqual(r.actions[0].value, "ctrl+shift+s");
  assert.ok(r.actions.some((a) => a.type === "type" && a.value === "q3-report.xlsx"));
  // The confirming Enter is deliberately absent — Save As can silently overwrite.
  assert.ok(
    !r.actions.some((a) => a.type === "press" && a.value === "enter"),
    "save_as must not press Enter for the user"
  );
  assert.strictEqual(matchRecipe('save as "My Notes.docx"').actions[2].value, "My Notes.docx");
  // Plain save is still the one-key shortcut, not the dialog.
  assert.strictEqual(matchRecipe("save this file").id, "save");
});

test("every recipe survives the plan guard", () => {
  const { guardPlan } = require("../electron/netie/plan-guard");
  const { RECIPES } = require("../electron/netie/recipes");
  for (const [id, recipe] of Object.entries(RECIPES)) {
    const guarded = guardPlan(recipe.actions.map((a) => ({ ...a })));
    assert.strictEqual(
      guarded.dropped.length,
      0,
      `${id} emits a verb the driver cannot run: ${JSON.stringify(guarded.dropped)}`
    );
  }
});

console.log("\n" + pass + " passed, " + fails.length + " failed");
process.exit(fails.length ? 1 : 0);