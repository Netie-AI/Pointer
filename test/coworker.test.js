"use strict";
const assert = require("assert");
const {
  DESKS,
  catalog,
  pickDesk,
  meetingAssist,
  deskGrounding,
  canActOnline,
} = require("../electron/netie/coworker-desks");
const { plannerGrounding } = require("../electron/netie/coworker");

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

test("catalog is original first-party desks with no runtime", () => {
  const ids = catalog().map((d) => d.id);
  assert.deepStrictEqual(ids, ["teach", "meeting", "document", "security", "inbox"]);
  assert.strictEqual(canActOnline(), false);
  assert.strictEqual(DESKS.meeting.act, "never");
  assert.strictEqual(DESKS.inbox.parked, "P-05");
  assert.ok(!catalog().some((d) => d.actions && d.actions.length));
});

test("pickDesk routes Clicky/Cluely/OpenWorker jobs to Pointer desks", () => {
  assert.strictEqual(pickDesk("walk me through this on screen").id, "teach");
  assert.strictEqual(pickDesk("what should I say").id, "meeting");
  assert.strictEqual(pickDesk("recap this standup").id, "meeting");
  assert.strictEqual(pickDesk("list next steps").id, "meeting");
  assert.strictEqual(pickDesk("write hello in Word").id, "document");
  assert.strictEqual(pickDesk("security review this repo").id, "security");
  assert.strictEqual(pickDesk("draft a gmail reply").id, "inbox");
  assert.strictEqual(pickDesk("click Save", { mode: "meeting" }).id, "meeting");
});

test("meeting assist fails closed with no transcript and never acts", () => {
  const empty = meetingAssist({ transcript: "", question: "recap this meeting" });
  assert.strictEqual(empty.ok, false);
  assert.strictEqual(empty.act, false);
  assert.match(empty.reason, /no transcript/);
});

test("meeting assist ships a brief from the ring without acting", () => {
  const transcript = [
    "system: Can you send the deck by Friday?",
    "mic: Yes I will send it and schedule a follow-up.",
    "system: What is the launch date?",
  ].join("\n");
  const recap = meetingAssist({ transcript, question: "recap this meeting" });
  assert.strictEqual(recap.ok, true);
  assert.strictEqual(recap.act, false);
  assert.strictEqual(recap.skipLlm, true);
  assert.match(recap.deliverable, /Meeting brief/);
  assert.match(recap.deliverable, /send the deck/);
  const assist = meetingAssist({ transcript, question: "what should I say" });
  assert.strictEqual(assist.kind, "assist");
  assert.strictEqual(assist.act, false);
  assert.match(assist.deliverable, /launch date/);
  const next = meetingAssist({ transcript, question: "list next steps" });
  assert.strictEqual(next.kind, "next");
  assert.match(next.deliverable, /send it/);
});

test("planner grounding names the desk and refuses online exec", () => {
  const g = plannerGrounding("what should I say", { mode: "meeting" });
  assert.match(g, /Active coworker desk: meeting/);
  assert.match(g, /workspace.exec/);
  assert.match(deskGrounding("security"), /Never self-approve/);
  assert.match(deskGrounding("teach"), /\[POINT:/);
});

test("Ask vision chat is grounded by the desk, not only the Act planner", () => {
  const fs = require("fs");
  const path = require("path");
  const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
  const ask = main.slice(main.indexOf("async function askBuddy"), main.indexOf("function plannerContext"));
  assert.match(ask, /plannerGrounding\(message/);
  assert.match(ask, /deskCtx/);
});

test("stop on a listening session recaps and never acts", () => {
  const { finishListeningSession } = require("../electron/netie/coworker-desks");
  const skip = finishListeningSession({ mode: "agent", transcript: "system: hi" });
  assert.strictEqual(skip.ok, false);
  assert.strictEqual(skip.act, false);
  const empty = finishListeningSession({ mode: "meeting", transcript: "" });
  assert.strictEqual(empty.ok, false);
  const recap = finishListeningSession({
    mode: "meeting",
    transcript: "system: Can you send the deck?\nmic: I will send it Friday.",
  });
  assert.strictEqual(recap.ok, true);
  assert.strictEqual(recap.act, false);
  assert.match(recap.deliverable, /send the deck/);
  const fs = require("fs");
  const path = require("path");
  const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
  const stop = main.slice(main.indexOf('if (command === "stop")'), main.indexOf("function segmenterFor"));
  assert.match(stop, /finishListeningSession/);
  assert.match(stop, /source: "netie"/);
  assert.match(stop, /act: false/);
  assert.doesNotMatch(stop, /claim\("pointer-act"/);
});

test("notes labels Netie recap separately from You/System", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const { NotesSession } = require("../electron/netie/notes");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-notes-"));
  const n = new NotesSession({ root });
  n.start("meeting");
  n.append({ text: "# Meeting brief\n- ship it", source: "netie" });
  const body = fs.readFileSync(n.file, "utf8");
  assert.match(body, /Netie/);
  assert.match(body, /Meeting brief/);
  n.stop();
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
