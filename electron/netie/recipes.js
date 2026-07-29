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
   * Demo A — terminal / focused app → Word.
   * open requires confirm (plan-guard). Re-aim not needed: paste uses hotkeys.
   */
  terminal_to_word: Object.freeze({
    id: "terminal_to_word",
    label: "Copy into Word",
    actions: Object.freeze([
      { type: "press", value: "ctrl+a" },
      { type: "wait", ms: 80 },
      { type: "press", value: "ctrl+c" },
      { type: "wait", ms: 120 },
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
      { type: "press", value: "ctrl+a" },
      { type: "wait", ms: 80 },
      { type: "press", value: "ctrl+c" },
      { type: "wait", ms: 120 },
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

  const normalized = input.toLowerCase().replace(/[.!?]+$/g, "").trim();

  // Multi-word coworker SOPs first (more specific).
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
