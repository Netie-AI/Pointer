"use strict";
/**
 * WP-P2-MEMORY-IMPORT — shared shape for every importer.
 *
 * Cursor, Claude and ChatGPT each export a different structure, and all three
 * change without warning. The importers below absorb that; everything upstream
 * sees one shape:
 *
 *   { source, conversations: [ { id, title, createdAt, messages: [ {role, text, at} ] } ],
 *     skipped, error }
 *
 * Two habits worth keeping: a file we cannot parse returns an empty result with
 * `error` set rather than throwing (one bad export must not kill an import of
 * fifty), and anything we drop is counted in `skipped` rather than vanishing —
 * "imported 200 conversations" is a lie if 40 were silently unreadable.
 */

const ROLES = Object.freeze({
  user: "user",
  human: "user",
  you: "user",
  assistant: "assistant",
  ai: "assistant",
  bot: "assistant",
  claude: "assistant",
  chatgpt: "assistant",
  cursor: "assistant",
  system: "system",
  tool: "tool",
});

function asRole(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return ROLES[key] || (key ? "other" : "user");
}

/** Accepts seconds, milliseconds, ISO strings — exporters use all three. */
function toMillis(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    // A plain epoch in seconds is ~1.7e9; in ms it is ~1.7e12.
    return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pull text out of whatever the exporter called "content": a string, an array
 * of parts, or a list of typed blocks. Non-text parts (images, tool payloads)
 * are dropped rather than stringified into `[object Object]`.
 */
function textOf(content) {
  if (content == null) return "";
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map(textOf).filter(Boolean).join("\n").trim();
  }
  if (typeof content === "object") {
    if (typeof content.text === "string") return content.text.trim();
    if (Array.isArray(content.parts)) return textOf(content.parts);
    if (Array.isArray(content.content)) return textOf(content.content);
  }
  return "";
}

/** Parse a JSON export defensively — callers pass either a string or an object. */
function parseJson(raw) {
  if (raw == null) return { ok: false, error: "empty input" };
  if (typeof raw === "object") return { ok: true, data: raw };
  try {
    return { ok: true, data: JSON.parse(String(raw)) };
  } catch (err) {
    return { ok: false, error: `not JSON: ${err.message || err}` };
  }
}

function makeConversation({ id, title, createdAt, messages }) {
  const clean = (messages || []).filter((m) => m && m.text);
  return {
    id: String(id || ""),
    title: String(title || "").trim() || "(untitled)",
    createdAt: createdAt ?? null,
    messages: clean,
    messageCount: clean.length,
  };
}

function emptyResult(source, error) {
  return { source, conversations: [], skipped: 0, error: error || null };
}

/** Totals for the HUD — an import that says nothing looks like it did nothing. */
function summarize(result) {
  const conversations = (result && result.conversations) || [];
  const messages = conversations.reduce((n, c) => n + (c.messageCount || 0), 0);
  return {
    source: (result && result.source) || "unknown",
    conversations: conversations.length,
    messages,
    skipped: (result && result.skipped) || 0,
    error: (result && result.error) || null,
  };
}

module.exports = { ROLES, asRole, toMillis, textOf, parseJson, makeConversation, emptyResult, summarize };
