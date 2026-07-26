"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ConversationStore, slug } = require("../electron/netie/conversations");

let pass = 0;
const fails = [];

function test(name, fn) {
  try {
    fn();
    pass += 1;
    console.log("PASS " + name);
  } catch (err) {
    fails.push(`${name} — ${err.message}`);
    console.log("FAIL " + name + " — " + err.message);
  }
}

test("slug cleans titles", () => {
  assert.strictEqual(slug("Hello World!!"), "hello-world");
});

test("save + list + read markdown conversation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "netie-chats-"));
  const store = new ConversationStore({ root });
  const saved = store.save({
    title: "Click Save test",
    turns: [
      { role: "user", text: "what is this?", ts: Date.now() },
      { role: "assistant", text: "A dialog about saving.", ts: Date.now() },
    ],
    meta: { deviceId: "test" },
  });
  assert.strictEqual(saved.ok, true);
  assert.ok(fs.existsSync(saved.path));
  const md = fs.readFileSync(saved.path, "utf8");
  assert.ok(md.includes("# Click Save test"));
  assert.ok(md.includes("## You"));
  assert.ok(md.includes("## Netie"));
  const list = store.list();
  assert.ok(list.length >= 1);
  const read = store.read(saved.id);
  assert.ok(read.markdown.includes("dialog about saving"));
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
