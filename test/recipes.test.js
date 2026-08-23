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

test("terminal to word coworker recipe is API-first", () => {
  const r = matchRecipe("copy this terminal into word");
  assert.strictEqual(r.id, "terminal_to_word");
  assert.ok(r.actions.some((a) => a.type === "word_from_clipboard"));
  assert.ok(!r.actions.some((a) => a.type === "open" && a.target === "winword"));
});

test("explicit prose uses word_docx_write, not the clipboard stub path", () => {
  const quoted = matchRecipe('write "Hello Pointer" into word');
  assert.ok(quoted, "quoted write should match");
  assert.strictEqual(quoted.id, "word_write_text");
  assert.deepStrictEqual(quoted.actions, [{ type: "word_docx_write", value: "Hello Pointer" }]);

  const says = matchRecipe("write a word document that says Hello Pointer");
  assert.ok(says, "that-says write should match");
  assert.strictEqual(says.id, "word_write_text");
  assert.strictEqual(says.actions[0].type, "word_docx_write");
  assert.strictEqual(says.actions[0].value, "Hello Pointer");

  const colon = matchRecipe("word: Hello Pointer");
  assert.ok(colon, "word: payload should match");
  assert.strictEqual(colon.actions[0].type, "word_docx_write");
  assert.strictEqual(colon.actions[0].value, "Hello Pointer");

  // Selection phrasing still goes through the clipboard recipe.
  const copy = matchRecipe("copy this into word");
  assert.strictEqual(copy.id, "terminal_to_word");
  assert.ok(copy.actions.some((a) => a.type === "word_from_clipboard"));

  // Real-use coworkerist: unquoted prose must not take the clipboard stub path.
  const unquoted = matchRecipe("write hello in Word");
  assert.ok(unquoted, "unquoted write-in-word should match");
  assert.strictEqual(unquoted.id, "word_write_text");
  assert.deepStrictEqual(unquoted.actions, [{ type: "word_docx_write", value: "hello" }]);

  const putProse = matchRecipe("put hello in word");
  assert.strictEqual(putProse.id, "word_write_text");
  assert.strictEqual(putProse.actions[0].value, "hello");

  const thisIn = matchRecipe("write this in Word");
  assert.ok(thisIn, "write this in Word matched nothing");
  assert.strictEqual(thisIn.id, "terminal_to_word");
  assert.ok(thisIn.actions.some((a) => a.type === "word_from_clipboard"));
  assert.ok(!thisIn.actions.some((a) => a.type === "click" || a.type === "type"));

  const putThis = matchRecipe("put this in word");
  assert.strictEqual(putThis.id, "terminal_to_word");

  const titled = matchRecipe("write Hello Pointer in Word");
  assert.ok(titled, "unquoted write-in-Word matched nothing");
  assert.strictEqual(titled.id, "word_write_text");
  assert.deepStrictEqual(titled.actions, [{ type: "word_docx_write", value: "Hello Pointer" }]);

  // Live customer: trailing .!? / please / "can you". The unpunctuated
  // strings above used to pass while "put hello in word." took the clipboard
  // stub (R-0001).
  for (const live of [
    "write hello in Word.",
    "write hello in Word?",
    "Write hello in word please",
    "please write hello in Word.",
    "can you write hello in Word",
    "could you write hello in Word?",
    "put hello in word.",
    "create hello in Word!",
    "make hello in Word please",
    'write "Hello Pointer" into word.',
    "write in Word: hello",
    "write a word document that says Hello.",
  ]) {
    const r = matchRecipe(live);
    assert.ok(r, `${JSON.stringify(live)} matched nothing`);
    assert.strictEqual(r.id, "word_write_text", `${JSON.stringify(live)} took ${r.id}`);
    assert.strictEqual(r.actions[0].type, "word_docx_write");
  }
  assert.strictEqual(matchRecipe("write hello in Word.").actions[0].value, "hello");
  assert.strictEqual(matchRecipe("put hello in word.").actions[0].value, "hello");
  assert.strictEqual(matchRecipe("write in Word: hello").actions[0].value, "hello");
  assert.strictEqual(matchRecipe("write a word document that says Hello.").actions[0].value, "Hello");
  assert.strictEqual(matchRecipe("write this in Word.").id, "terminal_to_word");
});

test("terminal to word UI fallback is explicit", () => {
  const r = matchRecipe("paste into word window");
  assert.strictEqual(r.id, "terminal_to_word_ui");
  assert.ok(r.actions.some((a) => a.type === "open" && a.target === "winword"));
  assert.ok(r.actions.some((a) => a.type === "clipboard_verify"));
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