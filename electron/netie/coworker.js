"use strict";
/**
 * Coworker heuristics — cheap human logic before vision/LLM.
 */
const fs = require("fs");
const path = require("path");
const { pickDesk, deskGrounding } = require("./coworker-desks");

const STATUS_CANDIDATES = Object.freeze([
  path.join("D:", "Cortex", "STATUS.md"),
  path.join("D:", "Netie Clicks", "STATUS.md"),
  path.join(process.cwd(), "STATUS.md"),
]);

function needsAppFork(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return false;
  if (/\b(claude\s*code|cursor|netie)\b/.test(t) && /\b(use|via|with|in)\b/.test(t)) {
    return false;
  }
  return (
    /\b(build|create|generate|scaffold|implement|code|app|website|web\s*app)\b/.test(t) &&
    /\b(hand\s*detect|camera|premiere|fl\s*studio|react|next\.?js|python|typescript)\b/.test(t)
  );
}

function appForkPrompt(text) {
  return {
    kind: "app_fork",
    question: "Do you want me to generate this directly in Netie, or drive one of your coding apps?",
    options: [
      { id: "netie", label: "Netie (generate here)" },
      { id: "cursor", label: "Cursor (my coding agent)" },
      { id: "claude_code", label: "Claude Code" },
    ],
    hint: String(text || "").slice(0, 240),
  };
}

function readStatusSnippet(maxChars) {
  const max = Number.isFinite(maxChars) ? maxChars : 1800;
  for (let i = 0; i < STATUS_CANDIDATES.length; i++) {
    const p = STATUS_CANDIDATES[i];
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, "utf8");
      const body = raw.replace(/\r\n/g, "\n").trim();
      if (!body) continue;
      return {
        path: p,
        text: body.length > max ? body.slice(0, max) + "\n..." : body,
      };
    } catch (_err) {}
  }
  return null;
}

function plannerGrounding(instruction, opts = {}) {
  const t = String(instruction || "").toLowerCase();
  const wantsStatus =
    /\bstatus\.md\b/.test(t) ||
    /\b(project|govern|lane|milestone|continue)\b/.test(t) ||
    /\bcortex\b/.test(t);
  const status = wantsStatus ? readStatusSnippet(1800) : readStatusSnippet(900);
  const desk = pickDesk(instruction, { mode: opts.mode });
  const parts = [];
  if (status) {
    parts.push(
      "Project STATUS.md (" + status.path + ") - prefer citing this over inventing state:\n" + status.text
    );
  }
  parts.push(deskGrounding(desk));
  parts.push(
    [
      "Coworker rules:",
      "1. Prefer copy/paste and hotkeys over generating text.",
      "2. If a recipe or skill fits, use it - do not invent a long click path.",
      "3. For coding apps, prefer Claude Code while the 5-hour window is open; when that limit is used, open Cursor.",
      "4. If Cursor context looks full (token circle), open a new chat and continue with @ past chats / STATUS.md.",
      "5. Expand hidden panels like a human - Window menu, enable, expand.",
      "6. Word documents: word_docx_write (or word_from_clipboard for a selection). Do not click the Word UI.",
      "7. Online host is an artifact catalog. workspace.exec is refused (P-06).",
    ].join("\n")
  );
  return parts.join("\n\n");
}

module.exports = {
  STATUS_CANDIDATES,
  needsAppFork,
  appForkPrompt,
  readStatusSnippet,
  plannerGrounding,
};
