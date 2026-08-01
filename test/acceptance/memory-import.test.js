"use strict";
/**
 * WP-P2-MEMORY-IMPORT — Cursor / Claude / ChatGPT exports.
 *
 * Run: node test/acceptance/memory-import.test.js
 */

const assert = require("assert");
const { assertSuite } = require("../harness/mock-peers");

const chatgpt = require("../../electron/netie/import/chatgpt");
const claude = require("../../electron/netie/import/claude");
const cursor = require("../../electron/netie/import/cursor");
const { summarize } = require("../../electron/netie/import/normalize");

const IMPORTERS = { chatgpt, claude, cursor };

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("every importer exposes the entrypoint", async () => {
      for (const [name, mod] of Object.entries(IMPORTERS)) {
        assert.strictEqual(typeof mod.importExport, "function", `${name}.importExport`);
        assert.strictEqual(typeof mod.parse, "function", `${name}.parse`);
      }
    }),

    T("ChatGPT: the mapping tree becomes an ordered conversation", async () => {
      const out = chatgpt.importExport(
        JSON.stringify([
          {
            id: "c1",
            title: "Invoice help",
            create_time: 1700000000,
            mapping: {
              root: { id: "root", message: null },
              // Deliberately out of order — the export has no reliable key order.
              b: {
                id: "b",
                message: {
                  author: { role: "assistant" },
                  create_time: 1700000020,
                  content: { content_type: "text", parts: ["Sure, open the ledger."] },
                },
              },
              a: {
                id: "a",
                message: {
                  author: { role: "user" },
                  create_time: 1700000010,
                  content: { content_type: "text", parts: ["Help me reconcile."] },
                },
              },
            },
          },
        ])
      );
      assert.strictEqual(out.source, "chatgpt");
      assert.strictEqual(out.conversations.length, 1);
      const c = out.conversations[0];
      assert.strictEqual(c.title, "Invoice help");
      assert.deepStrictEqual(c.messages.map((m) => m.role), ["user", "assistant"]);
      assert.strictEqual(c.messages[0].text, "Help me reconcile.");
      // create_time is epoch seconds; it must not be read as milliseconds.
      assert.strictEqual(c.createdAt, 1700000000000);
    }),

    T("ChatGPT: the parentless root node is not a message", async () => {
      const out = chatgpt.importExport([{ id: "x", mapping: { root: { id: "root", message: null } } }]);
      assert.strictEqual(out.conversations.length, 0);
      assert.strictEqual(out.skipped, 1, "dropped conversations must be counted, not vanish");
    }),

    T("Claude: both the old text and the new content shapes read", async () => {
      const out = claude.importExport([
        {
          uuid: "u1",
          name: "Refactor",
          created_at: "2026-07-01T10:00:00Z",
          chat_messages: [
            { sender: "human", text: "Split this module", created_at: "2026-07-01T10:00:01Z" },
            { sender: "assistant", content: [{ type: "text", text: "Start with the parser." }] },
          ],
        },
      ]);
      const c = out.conversations[0];
      assert.deepStrictEqual(c.messages.map((m) => m.role), ["user", "assistant"]);
      assert.strictEqual(c.messages[1].text, "Start with the parser.");
      assert.strictEqual(c.createdAt, Date.parse("2026-07-01T10:00:00Z"));
    }),

    T("Cursor: a markdown transcript splits on speakers", async () => {
      const out = cursor.importExport(
        ["# Fix the build", "", "**User**", "the build is red", "", "## Assistant", "check the lockfile"].join("\n")
      );
      const c = out.conversations[0];
      assert.strictEqual(c.title, "Fix the build");
      assert.deepStrictEqual(c.messages.map((m) => m.role), ["user", "assistant"]);
      assert.strictEqual(c.messages[0].text, "the build is red");
    }),

    T("Cursor: a heading inside a code fence is not a speaker", async () => {
      const out = cursor.importExport(
        [
          "**User**",
          "here is my script",
          "```bash",
          "# Assistant",
          "echo hi",
          "```",
          "does it work?",
        ].join("\n")
      );
      const c = out.conversations[0];
      assert.strictEqual(c.messages.length, 1, "the fenced heading must not split the turn");
      assert.ok(c.messages[0].text.includes("echo hi"));
      assert.ok(c.messages[0].text.includes("does it work?"));
    }),

    T("Cursor: a bare array of turns is one conversation, not many", async () => {
      const out = cursor.importExport(
        JSON.stringify([
          { role: "user", content: "add a test" },
          { role: "assistant", content: "done" },
        ])
      );
      assert.strictEqual(out.conversations.length, 1);
      assert.strictEqual(out.conversations[0].messageCount, 2);
    }),

    T("Cursor: one odd turn does not shred the whole export", async () => {
      // Detection used to require EVERY turn to have both a role and a body, so
      // a single empty turn — or a turn using `type` for the role, which the
      // parser explicitly supports — flipped the array into N nodes and
      // imported nothing at all.
      const withEmpty = cursor.importExport(
        JSON.stringify([
          { role: "user", content: "add a test" },
          { role: "assistant", content: "" },
          { role: "user", content: "still here?" },
        ])
      );
      assert.strictEqual(withEmpty.conversations.length, 1);
      assert.strictEqual(withEmpty.conversations[0].messageCount, 2);

      const typed = cursor.importExport(
        JSON.stringify([
          { type: "user", text: "hello" },
          { type: "assistant", text: "hi" },
        ])
      );
      assert.strictEqual(typed.conversations.length, 1);
      assert.strictEqual(typed.conversations[0].messageCount, 2);

      // A real multi-conversation export must still split.
      const many = cursor.importExport(
        JSON.stringify([
          { id: "a", title: "One", messages: [{ role: "user", content: "x" }] },
          { id: "b", title: "Two", messages: [{ role: "user", content: "y" }] },
        ])
      );
      assert.strictEqual(many.conversations.length, 2);
    }),

    T("a broken export reports instead of throwing", async () => {
      for (const [name, mod] of Object.entries(IMPORTERS)) {
        const out = mod.importExport("{not json at all");
        assert.ok(out && Array.isArray(out.conversations), `${name} must return a result`);
        assert.strictEqual(out.conversations.length, 0, name);
        assert.ok(out.error, `${name} must say why it imported nothing`);
      }
      assert.strictEqual(chatgpt.importExport(null).error, "empty input");
    }),

    T("summarize counts what was kept and what was dropped", async () => {
      const out = claude.importExport([
        { uuid: "a", name: "One", chat_messages: [{ sender: "human", text: "hi" }] },
        { uuid: "b", name: "Empty", chat_messages: [] },
      ]);
      const s = summarize(out);
      assert.strictEqual(s.conversations, 1);
      assert.strictEqual(s.messages, 1);
      assert.strictEqual(s.skipped, 1);
      assert.strictEqual(s.source, "claude");
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
