"use strict";

/**
 * Fixed SOPs — hotkey / open sequences that skip the LLM.
 * Prefer these for cheap, tedious jobs (copy, Word, slides, Claude→Cursor).
 * Vision + Cortex OSR only fill gaps when no recipe matches.
 */

const RECIPES = Object.freeze({
  copy: Object.freeze({
    id: "copy",
    label: "Copy",
    actions: Object.freeze([{ type: "press", value: "ctrl+c" }]),
  }),
  paste: Object.freeze({
    id: "paste",
    label: "Paste",
    actions: Object.freeze([{ type: "press", value: "ctrl+v" }]),
  }),
  copy_all: Object.freeze({
    id: "copy_all",
    label: "Copy all",
    actions: Object.freeze([
      { type: "press", value: "ctrl+a" },
      { type: "press", value: "ctrl+c" },
    ]),
  }),
  duplicate_down: Object.freeze({
    id: "duplicate_down",
    label: "Duplicate down",
    actions: Object.freeze([
      { type: "press", value: "ctrl+c" },
      { type: "press", value: "down" },
      { type: "press", value: "ctrl+v" },
    ]),
  }),
  fill_right: Object.freeze({
    id: "fill_right",
    label: "Fill right",
    actions: Object.freeze([
      { type: "press", value: "ctrl+c" },
      { type: "press", value: "right" },
      { type: "press", value: "ctrl+v" },
    ]),
  }),
  fill_left: Object.freeze({
    id: "fill_left",
    label: "Fill left",
    actions: Object.freeze([
      { type: "press", value: "ctrl+c" },
      { type: "press", value: "left" },
      { type: "press", value: "ctrl+v" },
    ]),
  }),
  /** Excel ribbon merge (Alt, H, M, M) — predictable hotkeys, not UIA. */
  merge_cells: Object.freeze({
    id: "merge_cells",
    label: "Merge cells",
    actions: Object.freeze([
      { type: "press", value: "alt" },
      { type: "wait", ms: 80 },
      { type: "press", value: "h" },
      { type: "wait", ms: 80 },
      { type: "press", value: "m" },
      { type: "wait", ms: 60 },
      { type: "press", value: "m" },
    ]),
  }),
  undo: Object.freeze({
    id: "undo",
    label: "Undo",
    actions: Object.freeze([{ type: "press", value: "ctrl+z" }]),
  }),
  save: Object.freeze({
    id: "save",
    label: "Save",
    actions: Object.freeze([{ type: "press", value: "ctrl+s" }]),
  }),

  /**
   * Demo A — terminal / focused app → Word (API-first).
   * Copies selection, writes .docx to disk — no winword focus steal.
   * Hotkey UI fallback: terminal_to_word_ui (explicit).
   */
  terminal_to_word: Object.freeze({
    id: "terminal_to_word",
    label: "Copy into Word (.docx)",
    actions: Object.freeze([
      // Record the clipboard BEFORE the copy, so the consuming step can prove
      // the copy fired (#16). Without it the integrity gate had nothing to
      // compare against and degraded to "the clipboard is not empty".
      { type: "clipboard_baseline" },
      { type: "press", value: "ctrl+a" },
      { type: "wait", ms: 80 },
      { type: "press", value: "ctrl+c" },
      { type: "wait", ms: 120 },
      { type: "word_from_clipboard" },
    ]),
  }),

  /** UI fallback — hotkeys into Word. Prefer terminal_to_word. */
  terminal_to_word_ui: Object.freeze({
    id: "terminal_to_word_ui",
    label: "Copy into Word (UI hotkeys)",
    actions: Object.freeze([
      // Record the clipboard BEFORE the copy, so the consuming step can prove
      // the copy fired (#16). Without it the integrity gate had nothing to
      // compare against and degraded to "the clipboard is not empty".
      { type: "clipboard_baseline" },
      { type: "press", value: "ctrl+a" },
      { type: "wait", ms: 80 },
      { type: "press", value: "ctrl+c" },
      { type: "wait", ms: 120 },
      { type: "clipboard_verify" },
      { type: "open", target: "winword" },
      { type: "wait", ms: 2800 },
      { type: "press", value: "ctrl+n" },
      { type: "wait", ms: 900 },
      { type: "press", value: "ctrl+v" },
    ]),
  }),

  /** Focused selection → PowerPoint blank slide paste. */
  create_slides: Object.freeze({
    id: "create_slides",
    label: "Paste into PowerPoint",
    actions: Object.freeze([
      { type: "press", value: "ctrl+a" },
      { type: "wait", ms: 60 },
      { type: "press", value: "ctrl+c" },
      { type: "wait", ms: 100 },
      { type: "open", target: "powerpnt" },
      { type: "wait", ms: 3200 },
      { type: "press", value: "ctrl+n" },
      { type: "wait", ms: 1000 },
      { type: "press", value: "ctrl+v" },
    ]),
  }),

  /**
   * Claude (or any left chat) → Cursor: select-all copy, open Cursor, paste.
   * Assumes Claude/source is focused when the recipe starts.
   */
  claude_to_cursor: Object.freeze({
    id: "claude_to_cursor",
    label: "Hand off Claude → Cursor",
    actions: Object.freeze([
      // Record the clipboard BEFORE the copy, so the consuming step can prove
      // the copy fired (#16). Without it the integrity gate had nothing to
      // compare against and degraded to "the clipboard is not empty".
      { type: "clipboard_baseline" },
      { type: "press", value: "ctrl+a" },
      { type: "wait", ms: 80 },
      { type: "press", value: "ctrl+c" },
      { type: "wait", ms: 120 },
      // Same gate as the Word path: pasting whatever happened to be on the
      // clipboard into a Cursor chat is the same defect wearing a different hat.
      { type: "clipboard_verify" },
      { type: "open", target: "Cursor" },
      { type: "wait", ms: 1800 },
      { type: "press", value: "ctrl+l" },
      { type: "wait", ms: 400 },
      { type: "press", value: "ctrl+v" },
    ]),
  }),

  /**
   * Context nearly full in Cursor — open a fresh chat and paste clipboard.
   * User (or prior step) should have copied the continue prompt first.
   */
  cursor_new_chat: Object.freeze({
    id: "cursor_new_chat",
    label: "Cursor new chat + paste",
    actions: Object.freeze([
      { type: "press", value: "ctrl+l" },
      { type: "wait", ms: 350 },
      { type: "press", value: "ctrl+n" },
      { type: "wait", ms: 500 },
      { type: "press", value: "ctrl+v" },
    ]),
  }),

  // ── Excel ───────────────────────────────────────────────────────────────
  /** AutoSum the selection (Alt, H, U, S) — ribbon keys, stable since 2007. */
  excel_autosum: Object.freeze({
    id: "excel_autosum",
    label: "AutoSum",
    actions: Object.freeze([
      { type: "press", value: "alt" },
      { type: "wait", ms: 80 },
      { type: "press", value: "h" },
      { type: "wait", ms: 80 },
      { type: "press", value: "u" },
      { type: "wait", ms: 60 },
      { type: "press", value: "s" },
      { type: "wait", ms: 60 },
      { type: "press", value: "enter" },
    ]),
  }),
  excel_new_sheet: Object.freeze({
    id: "excel_new_sheet",
    label: "New sheet",
    actions: Object.freeze([{ type: "press", value: "shift+f11" }]),
  }),
  /** Currency format is Ctrl+Shift+$ — the 4 key without the shift spelled out. */
  excel_currency: Object.freeze({
    id: "excel_currency",
    label: "Format as currency",
    actions: Object.freeze([{ type: "press", value: "ctrl+shift+4" }]),
  }),
  excel_select_column: Object.freeze({
    id: "excel_select_column",
    label: "Select column",
    actions: Object.freeze([{ type: "press", value: "ctrl+space" }]),
  }),
  excel_select_row: Object.freeze({
    id: "excel_select_row",
    label: "Select row",
    actions: Object.freeze([{ type: "press", value: "shift+space" }]),
  }),

  // ── Browser ─────────────────────────────────────────────────────────────
  /**
   * A blank tab, nothing more. Deliberately no URL: typing an address and
   * pressing Enter is a navigation, and it would slip past the plan-guard rule
   * that every `navigate` needs a human beat. Ask for a URL and you get a real
   * `navigate` action, gated like one.
   */
  browser_new_tab: Object.freeze({
    id: "browser_new_tab",
    label: "New browser tab",
    actions: Object.freeze([{ type: "press", value: "ctrl+t" }]),
  }),
  /** Move to the next form field — the keyboard half of a form-fill journey. */
  form_next_field: Object.freeze({
    id: "form_next_field",
    label: "Next field",
    actions: Object.freeze([{ type: "press", value: "tab" }]),
  }),

  /** Placeholders only — vault-fill resolves at the last moment (P5). */
  form_fill_profile: Object.freeze({
    id: "form_fill_profile",
    label: "Fill profile fields",
    actions: Object.freeze([
      { type: "type", target: "Full name", value: "{{vault.profile.name}}" },
      { type: "press", value: "tab" },
      { type: "type", target: "Email", value: "{{vault.profile.email}}" },
      { type: "press", value: "tab" },
      { type: "type", target: "Phone", value: "{{vault.profile.phone}}" },
    ]),
  }),

  air_ticket_basics: Object.freeze({
    id: "air_ticket_basics",
    label: "Air ticket passenger basics",
    actions: Object.freeze([
      { type: "type", target: "Passenger name", value: "{{vault.profile.passport_name}}" },
      { type: "press", value: "tab" },
      { type: "type", target: "Date of birth", value: "{{vault.profile.dob}}" },
      { type: "press", value: "tab" },
      { type: "type", target: "Nationality", value: "{{vault.profile.nationality}}" },
      { type: "press", value: "tab" },
      { type: "type", target: "Email", value: "{{vault.profile.email}}" },
    ]),
  }),

  // ── Cross-app ───────────────────────────────────────────────────────────
  find_replace: Object.freeze({
    id: "find_replace",
    label: "Find and replace",
    actions: Object.freeze([{ type: "press", value: "ctrl+h" }]),
  }),

  /** Continue prompt stub when context is full — copy then new chat. */
  continue_due_context: Object.freeze({
    id: "continue_due_context",
    label: "Continue in new Cursor chat",
    actions: Object.freeze([
      { type: "press", value: "ctrl+a" },
      { type: "wait", ms: 60 },
      { type: "press", value: "ctrl+c" },
      { type: "wait", ms: 100 },
      { type: "press", value: "ctrl+l" },
      { type: "wait", ms: 300 },
      { type: "press", value: "ctrl+n" },
      { type: "wait", ms: 450 },
      { type: "press", value: "ctrl+v" },
    ]),
  }),
});

function cloneRecipe(recipe) {
  return {
    id: recipe.id,
    label: recipe.label,
    actions: recipe.actions.map((action) => ({ ...action })),
  };
}

function matchRecipe(text) {
  if (typeof text !== "string") return null;
  const input = text.trim();
  if (!input) return null;

  const pasteText = input.match(/\bpaste\s*:\s*([\s\S]+)$/i);
  if (pasteText && pasteText[1].trim()) {
    return {
      id: "paste_text",
      label: "Paste text",
      actions: [{ type: "clipboard_paste", value: pasteText[1].trim() }],
    };
  }

  /**
   * "save as q3-report.xlsx" — open the dialog and type the name, then STOP.
   * The confirming Enter is left to the human on purpose: Save As over an
   * existing file is a silent overwrite, and doing the tedious 90% while
   * leaving the destructive keystroke to the user is the whole point of an SOP.
   */
  const saveAs = input.match(/\bsave\s+(?:this\s+|it\s+|the\s+file\s+)?as\s+(.+)$/i);
  if (saveAs && saveAs[1].trim()) {
    const name = saveAs[1].trim().replace(/^["']|["']$/g, "");
    return {
      id: "save_as",
      label: `Save as ${name}`,
      actions: [
        { type: "press", value: "ctrl+shift+s" },
        { type: "wait", ms: 900 },
        { type: "type", target: "File name", value: name },
      ],
    };
  }

  /** "find X on the page" — in-page search, never a navigation. */
  const findOnPage = input.match(
    /\b(?:find|search\s+for|look\s+for)\s+(?:"([^"]+)"|'([^']+)'|(.+?))\s+(?:on|in)\s+(?:this\s+|the\s+)?page$/i
  );
  if (findOnPage) {
    const term = (findOnPage[1] || findOnPage[2] || findOnPage[3] || "").trim();
    if (term) {
      return {
        id: "browser_find",
        label: `Find “${term}”`,
        actions: [
          { type: "press", value: "ctrl+f" },
          { type: "wait", ms: 250 },
          { type: "type", target: "Find", value: term },
          { type: "wait", ms: 120 },
          { type: "press", value: "enter" },
        ],
      };
    }
  }

  const normalized = input.toLowerCase().replace(/[.!?]+$/g, "").trim();

  function wordWriteTextRecipe(text) {
    const value = String(text || "").trim().replace(/^["']|["']$/g, "");
    if (!value) return null;
    return {
      id: "word_write_text",
      label: "Write a Word document",
      actions: [{ type: "word_docx_write", value }],
    };
  }

  const quotedWord = input.match(
    /^(?:please\s+)?(?:write|put|create|make)\s+["']([^"']+)["']\s+(?:into|to|in)\s+(?:a\s+)?(?:microsoft\s+)?word(?:\s+doc(?:ument)?)?$/i
  );
  if (quotedWord) {
    const r = wordWriteTextRecipe(quotedWord[1]);
    if (r) return r;
  }
  const saysWord = input.match(
    /^(?:please\s+)?(?:write|create|make)\s+(?:a\s+|an\s+)?(?:microsoft\s+)?word\s+(?:doc(?:ument)?|file)\s+(?:that\s+(?:says|contains)|with(?:\s+the\s+text)?|saying)\s+(.+)$/i
  );
  if (saysWord) {
    const r = wordWriteTextRecipe(saysWord[1]);
    if (r) return r;
  }
  const wordColon = input.match(
    /^(?:please\s+)?(?:write\s+(?:it\s+)?(?:to|into)\s+(?:a\s+)?(?:microsoft\s+)?word(?:\s+doc(?:ument)?)?|word)\s*:\s*([\s\S]+)$/i
  );
  if (wordColon) {
    const r = wordWriteTextRecipe(wordColon[1]);
    if (r) return r;
  }

  // Multi-word coworker SOPs first (more specific).
  if (
    /(?:word\s+ui|hotkey\s+word|paste\s+into\s+word\s+window)/.test(normalized)
  ) {
    return cloneRecipe(RECIPES.terminal_to_word_ui);
  }
  if (
    /(?:copy|paste|put|move).{0,40}(?:into|to|in)\s+(?:microsoft\s+)?word\b/.test(normalized) ||
    /(?:terminal|this|that|selection|text).{0,30}(?:to|into)\s+word\b/.test(normalized) ||
    /^(?:please\s+)?(?:terminal\s+)?(?:to\s+)?word$/.test(normalized)
  ) {
    return cloneRecipe(RECIPES.terminal_to_word);
  }
  if (
    /(?:create|make|new).{0,20}(?:slide|slides|ppt|powerpoint)/.test(normalized) ||
    /(?:copy|paste|put).{0,40}(?:into|to)\s+(?:powerpoint|ppt|slides?)\b/.test(normalized)
  ) {
    return cloneRecipe(RECIPES.create_slides);
  }
  if (
    /(?:claude|chat).{0,30}(?:to|into|->|→)\s*cursor/.test(normalized) ||
    /(?:hand\s*off|handoff|send|copy).{0,40}(?:claude|answer|output).{0,20}cursor/.test(normalized) ||
    /^(?:please\s+)?claude\s*(?:to|->|→)\s*cursor$/.test(normalized)
  ) {
    return cloneRecipe(RECIPES.claude_to_cursor);
  }
  if (
    /(?:context|token).{0,20}(?:full|almost|nearly|limit|max)/.test(normalized) ||
    /continue\s+(?:in\s+)?(?:a\s+)?new\s+chat/.test(normalized) ||
    /(?:open|start)\s+(?:a\s+)?new\s+(?:cursor\s+)?chat/.test(normalized)
  ) {
    return cloneRecipe(RECIPES.continue_due_context);
  }
  if (/^(?:please\s+)?(?:cursor\s+)?new\s+chat(?:\s+and\s+paste)?$/.test(normalized)) {
    return cloneRecipe(RECIPES.cursor_new_chat);
  }

  if (/^(?:please\s+)?(?:copy|select)\s+all(?:\s+(?:of\s+)?(?:this|that|it))?$/.test(normalized)) {
    return cloneRecipe(RECIPES.copy_all);
  }
  if (/^(?:please\s+)?(?:duplicate|copy)\s+(?:this\s+|that\s+|the\s+)?(?:cell\s+)?down$/.test(normalized)) {
    return cloneRecipe(RECIPES.duplicate_down);
  }
  if (/^(?:please\s+)?(?:fill|copy)\s+(?:this\s+|that\s+|the\s+)?(?:cell\s+)?(?:to\s+the\s+)?right$/.test(normalized)) {
    return cloneRecipe(RECIPES.fill_right);
  }
  if (/^(?:please\s+)?(?:fill|copy)\s+(?:this\s+|that\s+|the\s+)?(?:cell\s+)?(?:to\s+the\s+)?left$/.test(normalized)) {
    return cloneRecipe(RECIPES.fill_left);
  }
  if (/^(?:please\s+)?merge(?:\s+(?:these\s+|the\s+)?cells?)?$/.test(normalized)) {
    return cloneRecipe(RECIPES.merge_cells);
  }
  if (/^(?:please\s+)?(?:auto\s*sum|sum(?:\s+(?:this|these|the))?(?:\s+(?:column|row|cells?|selection))?)$/.test(normalized)) {
    return cloneRecipe(RECIPES.excel_autosum);
  }
  if (/^(?:please\s+)?(?:add|new|insert)\s+(?:a\s+)?(?:new\s+)?(?:work)?sheet(?:\s+tab)?$/.test(normalized)) {
    return cloneRecipe(RECIPES.excel_new_sheet);
  }
  if (/^(?:please\s+)?format(?:\s+(?:this|these|it|them))?\s+as\s+(?:currency|money|dollars?)$/.test(normalized)) {
    return cloneRecipe(RECIPES.excel_currency);
  }
  if (/^(?:please\s+)?select\s+(?:this\s+|the\s+)?column$/.test(normalized)) {
    return cloneRecipe(RECIPES.excel_select_column);
  }
  if (/^(?:please\s+)?select\s+(?:this\s+|the\s+)?row$/.test(normalized)) {
    return cloneRecipe(RECIPES.excel_select_row);
  }
  if (/^(?:please\s+)?(?:open\s+(?:a\s+)?)?new\s+tab$/.test(normalized)) {
    return cloneRecipe(RECIPES.browser_new_tab);
  }
  if (/^(?:please\s+)?(?:next\s+field|tab\s+(?:to\s+the\s+)?next(?:\s+field)?)$/.test(normalized)) {
    return cloneRecipe(RECIPES.form_next_field);
  }
  if (
    /^(?:please\s+)?(?:fill|complete)\s+(?:my\s+)?(?:profile|form)(?:\s+(?:fields?|for\s+me))?$/.test(normalized) ||
    /fill\s+(?:this\s+)?form\s+with\s+my\s+profile/.test(normalized)
  ) {
    return cloneRecipe(RECIPES.form_fill_profile);
  }
  if (
    /(?:air\s*ticket|flight\s+book|passenger\s+(?:details|info)|book\s+(?:a\s+)?flight)/.test(normalized) ||
    /fill\s+(?:the\s+)?(?:ticket|booking)\s+(?:form|basics)/.test(normalized)
  ) {
    return cloneRecipe(RECIPES.air_ticket_basics);
  }
  if (/^(?:please\s+)?(?:find\s+and\s+replace|replace(?:\s+text)?)$/.test(normalized)) {
    return cloneRecipe(RECIPES.find_replace);
  }
  if (/^(?:please\s+)?copy(?:\s+(?:this|that|it|selection|selected|cell))?$/.test(normalized)) {
    return cloneRecipe(RECIPES.copy);
  }
  if (/^(?:please\s+)?paste(?:\s+(?:this|that|it|here))?$/.test(normalized)) {
    return cloneRecipe(RECIPES.paste);
  }
  if (/^(?:please\s+)?undo(?:\s+(?:this|that|it|last))?$/.test(normalized)) {
    return cloneRecipe(RECIPES.undo);
  }
  if (/^(?:please\s+)?save(?:\s+(?:(?:this|that)\s+)?(?:it|file|document))?$/.test(normalized)) {
    return cloneRecipe(RECIPES.save);
  }
  return null;
}

function expandRecipe(recipe, ctx = {}) {
  if (!recipe || !Array.isArray(recipe.actions)) return null;
  const expanded = cloneRecipe(recipe);
  const point = ctx.coords || ctx.point;
  if (recipe.id === "copy" && point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
    expanded.actions.unshift({ type: "click", x: point.x, y: point.y });
  }
  return expanded;
}

module.exports = {
  RECIPES,
  matchRecipe,
  expandRecipe,
};
