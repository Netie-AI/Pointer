"use strict";
/**
 * WP-P2-MEMORY-IMPORT — Claude `conversations.json`.
 *
 * Flat and well-behaved compared to the ChatGPT tree: a list of conversations,
 * each with `chat_messages` already in order. Two shapes exist in the wild —
 * older exports put the turn in `text`, newer ones in a typed `content` array —
 * so both are read, preferring whichever actually has words in it.
 */

const { asRole, toMillis, textOf, parseJson, makeConversation, emptyResult } = require("./normalize");

function parseConversation(node) {
  if (!node || typeof node !== "object") return null;
  const turns = node.chat_messages || node.messages;
  if (!Array.isArray(turns)) return null;

  const messages = [];
  for (const turn of turns) {
    if (!turn || typeof turn !== "object") continue;
    // Newer exports carry blocks in `content`; older ones only have `text`.
    const text = textOf(turn.content) || textOf(turn.text);
    if (!text) continue;
    messages.push({
      role: asRole(turn.sender || turn.role),
      text,
      at: toMillis(turn.created_at || turn.timestamp),
    });
  }

  return makeConversation({
    id: node.uuid || node.id || "",
    title: node.name || node.title,
    createdAt: toMillis(node.created_at),
    messages,
  });
}

/**
 * @param {string|object} raw  contents of conversations.json
 * @returns {{source:string, conversations:object[], skipped:number, error:string|null}}
 */
function importExport(raw) {
  const parsed = parseJson(raw);
  if (!parsed.ok) return emptyResult("claude", parsed.error);

  const list = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const conversations = [];
  let skipped = 0;
  for (const node of list) {
    const conversation = parseConversation(node);
    if (conversation && conversation.messageCount) conversations.push(conversation);
    else skipped += 1;
  }
  return { source: "claude", conversations, skipped, error: null };
}

module.exports = { importExport, parse: importExport, parseConversation };
