"use strict";
/**
 * WP-P2-MEMORY-IMPORT — ChatGPT `conversations.json`.
 *
 * The export stores each conversation as a `mapping` of nodes keyed by id, not
 * a list: a tree, because edited turns branch. There is no reliable order in
 * the object itself, so messages are sorted by `create_time` and nodes without
 * one keep their insertion order behind those that have one.
 */

const { asRole, toMillis, textOf, parseJson, makeConversation, emptyResult } = require("./normalize");

function parseConversation(node) {
  const mapping = node && node.mapping;
  if (!mapping || typeof mapping !== "object") return null;

  const messages = [];
  let seq = 0;
  for (const entry of Object.values(mapping)) {
    const message = entry && entry.message;
    if (!message) continue; // the export includes a parentless root node
    const text = textOf(message.content);
    if (!text) continue; // tool payloads and image-only turns
    messages.push({
      role: asRole(message.author && message.author.role),
      text,
      at: toMillis(message.create_time),
      _seq: seq++,
    });
  }

  messages.sort((a, b) => {
    if (a.at != null && b.at != null && a.at !== b.at) return a.at - b.at;
    if (a.at != null && b.at == null) return -1;
    if (a.at == null && b.at != null) return 1;
    return a._seq - b._seq;
  });

  return makeConversation({
    id: node.id || node.conversation_id || "",
    title: node.title,
    createdAt: toMillis(node.create_time),
    messages: messages.map(({ _seq, ...m }) => m),
  });
}

/**
 * @param {string|object} raw  contents of conversations.json
 * @returns {{source:string, conversations:object[], skipped:number, error:string|null}}
 */
function importExport(raw) {
  const parsed = parseJson(raw);
  if (!parsed.ok) return emptyResult("chatgpt", parsed.error);

  // The export is an array; a single conversation is occasionally handed over bare.
  const list = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const conversations = [];
  let skipped = 0;
  for (const node of list) {
    const conversation = parseConversation(node);
    if (conversation && conversation.messageCount) conversations.push(conversation);
    else skipped += 1;
  }
  return { source: "chatgpt", conversations, skipped, error: null };
}

module.exports = { importExport, parse: importExport, parseConversation };
