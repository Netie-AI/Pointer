"use strict";
const assert = require("assert");
const {
  DESKS,
  catalog,
  pickDesk,
  meetingAssist,
  deskGrounding,
  canActOnline,
  securityAssist,
  teachAssist,
  inboxAssist,
  todayAssist,
  documentAssist,
  wantsSpawn,
  spawnCoworker,
  suggestsFromAssist,
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
  assert.deepStrictEqual(ids, ["teach", "meeting", "today", "document", "security", "inbox"]);
  assert.strictEqual(canActOnline(), false);
  assert.strictEqual(DESKS.meeting.act, "never");
  assert.strictEqual(DESKS.today.act, "never");
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
  assert.strictEqual(pickDesk("what's on my plate").id, "today");
  assert.strictEqual(pickDesk("morning brief").id, "today");
  assert.strictEqual(pickDesk("click Save", { mode: "meeting" }).id, "meeting");
  assert.strictEqual(pickDesk("what's on my plate", { mode: "meeting" }).id, "meeting");
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
  assert.match(deskGrounding("today"), /Never invent work/);
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

test("security assist ships a review and never self-approves", () => {
  const empty = securityAssist({ text: "" });
  assert.strictEqual(empty.ok, false);
  assert.strictEqual(empty.act, false);
  const review = securityAssist({ text: "security review this repo for leaked keys" });
  assert.strictEqual(review.ok, true);
  assert.strictEqual(review.act, false);
  assert.strictEqual(review.skipLlm, true);
  assert.match(review.deliverable, /fixer is not the only checker/);
  assert.match(review.deliverable, /will not execute/);
  assert.doesNotMatch(review.deliverable, /_approved/);
  const fs = require("fs");
  const path = require("path");
  const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
  assert.match(main, /securityAssist/);
});

test("teach assist never invents POINT coordinates and never acts", () => {
  const miss = teachAssist({ text: "hello" });
  assert.strictEqual(miss.ok, false);
  const walk = teachAssist({ text: "walk me through this on my screen" });
  assert.strictEqual(walk.ok, true);
  assert.strictEqual(walk.act, false);
  assert.strictEqual(walk.skipLlm, false);
  assert.match(walk.deliverable, /do not invent coordinates/i);
  assert.doesNotMatch(walk.deliverable, /\[POINT:\s*\d/);
});

test("inbox assist drafts and never sends", () => {
  const draft = inboxAssist({ text: "draft a gmail reply saying we shipped" });
  assert.strictEqual(draft.ok, true);
  assert.strictEqual(draft.act, false);
  assert.strictEqual(draft.skipLlm, true);
  assert.match(draft.deliverable, /not sent/i);
  assert.match(draft.deliverable, /will not send/);
});

test("suggestsFromAssist turns transcript questions into HUD chips", () => {
  const recap = meetingAssist({
    transcript: "system: Can you send the deck by Friday?\nmic: Yes I will send it.",
    question: "recap this meeting",
  });
  const items = suggestsFromAssist(recap);
  assert.ok(items.some((i) => /What should I say/.test(i.q)));
  assert.ok(items.some((i) => /send the deck/.test(i.q)));
  assert.ok(items.length <= 6);
  const fs = require("fs");
  const path = require("path");
  const hud = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.js"), "utf8");
  assert.match(hud, /event\.type === "suggests"/);
  assert.match(hud, /paintSuggestItems/);
  const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
  assert.match(main, /type: "suggests"/);
});

test("today assist ships a standing brief and never invents work", () => {
  const empty = todayAssist({ state: {} });
  assert.strictEqual(empty.ok, true);
  assert.strictEqual(empty.act, false);
  assert.strictEqual(empty.skipLlm, true);
  assert.match(empty.deliverable, /nothing yet/);
  assert.match(empty.deliverable, /P-06/);
  assert.doesNotMatch(empty.deliverable, /send the deck/);
  const filled = todayAssist({
    state: {
      today: [{ kind: "claim", detail: "pointer-act -> pointer-hud" }],
      lanes: { "pointer-act": { owner: "pointer-hud", goal: "write hello" } },
      artifacts: [{ title: "Standup recap", desk: "meeting" }],
      jobs: [{ title: "Meeting coworker", status: "running" }],
    },
  });
  assert.match(filled.deliverable, /pointer-hud/);
  assert.match(filled.deliverable, /Standup recap/);
  assert.match(filled.deliverable, /Meeting coworker: running/);
  assert.strictEqual(filled.act, false);
});

test("document assist drafts and never writes Word", () => {
  const miss = documentAssist({ text: "" });
  assert.strictEqual(miss.ok, false);
  const draft = documentAssist({ text: "write hello in Word" });
  assert.strictEqual(draft.ok, true);
  assert.strictEqual(draft.act, false);
  assert.strictEqual(draft.skipLlm, false);
  assert.match(draft.deliverable, /not a \.docx/);
  assert.match(draft.deliverable, /word_docx_write/);
  assert.doesNotMatch(draft.deliverable, /will execute/i);
});

test("spawn coworker never acts and never claims the pointer-act lane", () => {
  assert.strictEqual(wantsSpawn("hello"), false);
  const miss = spawnCoworker({ text: "recap this meeting" });
  assert.strictEqual(miss.ok, false);
  assert.strictEqual(miss.act, false);
  const spawn = spawnCoworker({ text: "spawn an agent and click Buy now" });
  assert.strictEqual(spawn.ok, true);
  assert.strictEqual(spawn.act, false);
  assert.strictEqual(spawn.claimLane, false);
  assert.strictEqual(spawn.spawn, true);
  assert.match(spawn.note, /Will not Act/);
  const recap = spawnCoworker({ text: "spawn a coworker to recap this meeting" });
  assert.strictEqual(recap.desk, "meeting");
  assert.strictEqual(recap.act, false);
  const plate = spawnCoworker({ text: "spawn a coworker" });
  assert.ok(plate.ok);
  assert.strictEqual(plate.act, false);
  const fs = require("fs");
  const path = require("path");
  const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
  assert.match(main, /spawnCoworker/);
  assert.match(main, /enqueueCoworkerJob/);
  assert.match(main, /claimLane: false/);
  const spawnAsk = main.slice(main.indexOf('ipcMain.handle("hud:ask"'), main.indexOf("P4-BG-AGENTS"));
  assert.match(spawnAsk, /spawnCoworker/);
  assert.doesNotMatch(spawnAsk, /claim\("pointer-act"/);
  const job = main.slice(main.indexOf("function enqueueCoworkerJob"), main.indexOf("ipcMain.handle(\"hud:bgList\""));
  assert.doesNotMatch(job, /claim\("pointer-act"/);
  assert.doesNotMatch(job, /driver\./);
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
