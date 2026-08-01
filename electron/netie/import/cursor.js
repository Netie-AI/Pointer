"use strict";
/**
 * WP-P2-MEMORY-IMPORT — Cursor chat exports.
 *
 * Cursor has no single export format. In practice you get one of three things:
 * a JSON array of `{role, content}`, a JSON object with `messages`/`tabs`, or —
 * most often, because it is what the "Export Chat" button produces — a markdown
 * transcript with speaker headings. All three are read here.
 *
 * The markdown parser is deliberately conservative: a heading it does not
 * recognise as a speaker is treated as body text, not as a turn boundary. Code
 * blocks are protected, because `# comment` inside a fenced block is a comment,
 * not a new speaker, and splitting there would shred exactly the content a
 * developer wanted to keep.
 */

const { asRole, toMillis, textOf, parseJson, makeConversation, emptyResult } = require("./normalize");

/** `**User**`, `## Assistant`, `### Cursor:` — the shapes the export button emits. */
const SPEAKER_RE = /^(?:#{1,6}\s*|\*\*\s*)(user|you|human|assistant|ai|cursor|claude|chatgpt|system)\b\s*:?\s*(?:\*\*)?\s*$/i;

function parseMarkdown(text, opts = {}) {
  const lines = String(text || "").split(/\r?\n/);
  const messages = [];
  let role = null;
  let buffer = [];
  let inFence = false;

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (role && body) messages.push({ role, text: body, at: null });
    buffer = [];
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const speaker = inFence ? null : line.match(SPEAKER_RE);
    if (speaker) {
      flush();
      role = asRole(speaker[1]);
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (!messages.length) return null;
  return makeConversation({
    id: opts.id || "",
    title: opts.title || (String(text).match(/^#\s+(.+)$/m) || [])[1] || "Cursor chat",
    createdAt: opts.createdAt ?? null,
    messages,
  });
}

function parseJsonConversation(node, index) {
  if (!node || typeof node !== "object") return null;

  // A bare array of turns: [{role, content}, …]
  const turns = node.messages || node.chat_messages || node.turns || node.bubbles;
  if (Array.isArray(turns)) {
    const messages = [];
    for (const turn of turns) {
      if (!turn || typeof turn !== "object") continue;
      const body = textOf(turn.content) || textOf(turn.text) || textOf(turn.message);
      if (!body) continue;
      messages.push({
        role: asRole(turn.role || turn.sender || turn.type),
        text: body,
        at: toMillis(turn.created_at || turn.timestamp || turn.time),
      });
    }
    return makeConversation({
      id: node.id || node.composerId || `cursor-${index}`,
      title: node.title || node.name,
      createdAt: toMillis(node.created_at || node.createdAt),
      messages,
    });
  }

  // A single markdown blob wrapped in JSON.
  const blob = textOf(node.text) || textOf(node.markdown) || textOf(node.content);
  if (blob) {
    return parseMarkdown(blob, {
      id: node.id || `cursor-${index}`,
      title: node.title || node.name,
      createdAt: toMillis(node.created_at || node.createdAt),
    });
  }
  return null;
}

/**
 * @param {string|object} raw  JSON export or a markdown transcript
 * @returns {{source:string, conversations:object[], skipped:number, error:string|null}}
 */
function importExport(raw) {
  if (raw == null || raw === "") return emptyResult("cursor", "empty input");

  const parsed = parseJson(raw);
  if (parsed.ok && typeof parsed.data === "object") {
    const list = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    // `[{role, content}, …]` with no wrapper is a single conversation, not many.
    // `some`, not `every`: one turn with an empty body — or a turn that names
    // the role with `type`, which parseJsonConversation already accepts — used
    // to flip the whole export into N nodes and import nothing. A node that
    // carries its own message list is never a bare turn, which is the only
    // distinction that actually matters here.
    const looksLikeTurn = (n) =>
      n &&
      typeof n === "object" &&
      !Array.isArray(n.messages || n.chat_messages || n.turns || n.bubbles) &&
      Boolean(n.role || n.sender || n.type);
    const bareTurns = list.length > 0 && list.every(looksLikeTurn);
    const nodes = bareTurns ? [{ messages: list }] : list;

    const conversations = [];
    let skipped = 0;
    nodes.forEach((node, i) => {
      const conversation = parseJsonConversation(node, i);
      if (conversation && conversation.messageCount) conversations.push(conversation);
      else skipped += 1;
    });
    return { source: "cursor", conversations, skipped, error: null };
  }

  // Not JSON — the markdown transcript the export button produces.
  const conversation = parseMarkdown(raw);
  if (!conversation) return emptyResult("cursor", "no recognisable turns");
  return { source: "cursor", conversations: [conversation], skipped: 0, error: null };
}

module.exports = { importExport, parse: importExport, parseMarkdown };
