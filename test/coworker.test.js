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
  liveMeetingUpdate,
  createLiveMeetingPump,
  DESK_CHIPS,
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
  assert.match(assist.deliverable, /will not send/i);
  assert.match(assist.deliverable, /Suggested reply/);
  assert.ok(assist.cue);
  assert.match(assist.cue, /send it/);
  assert.strictEqual(recap.cue, "");
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
  assert.match(deskGrounding("teach"), /\[BOX:/);
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
  assert.strictEqual(walk.via, "none");
  assert.deepStrictEqual(walk.points, []);
  assert.match(walk.deliverable, /do not invent coordinates/i);
  assert.doesNotMatch(walk.deliverable, /\[POINT:\s*\d/);
  assert.doesNotMatch(walk.deliverable, /\[BOX:\s*\d/);
});

test("teach assist emits POINT tokens from measured controls only", () => {
  const screen = { x: 0, y: 0, width: 1000, height: 1000 };
  const controls = [
    { name: "Cancel", controlType: "Button", rect: { x: 0, y: 0, width: 100, height: 40 } },
    { name: "Save", controlType: "Button", rect: { x: 200, y: 400, width: 100, height: 40 } },
    { name: "Ghost", controlType: "Button", offscreen: true, rect: { x: 10, y: 10, width: 10, height: 10 } },
    { name: "Dead", controlType: "Button", enabled: false, rect: { x: 50, y: 50, width: 10, height: 10 } },
  ];
  const walk = teachAssist({
    text: "walk me through this on my screen",
    controls,
    screen,
  });
  assert.strictEqual(walk.ok, true);
  assert.strictEqual(walk.act, false);
  assert.strictEqual(walk.skipLlm, true);
  assert.strictEqual(walk.via, "uia");
  assert.match(walk.deliverable, /\[POINT:25,42:Save\]/);
  assert.match(walk.deliverable, /\[BOX:20,40,10,4:Save\]/);
  assert.match(walk.deliverable, /will not click/i);
  assert.doesNotMatch(walk.deliverable, /\[POINT:.*Ghost/);
  assert.doesNotMatch(walk.deliverable, /\[BOX:.*Ghost/);
  assert.doesNotMatch(walk.deliverable, /\[POINT:.*Dead/);
  const pin = teachAssist({
    text: "point at Cancel on my screen",
    controls,
    screen,
  });
  assert.strictEqual(pin.act, false);
  assert.ok(pin.points.length >= 1);
  assert.strictEqual(pin.points[0].label, "Cancel");
  assert.strictEqual(pin.points[0].xPct, 5);
  const emptyTree = teachAssist({
    text: "walk me through this on my screen",
    controls: [{ name: "Save", controlType: "Button" }],
    screen,
  });
  assert.strictEqual(emptyTree.skipLlm, false);
  assert.doesNotMatch(emptyTree.deliverable, /\[POINT:\s*\d/);
  assert.doesNotMatch(emptyTree.deliverable, /\[BOX:\s*\d/);
  const fs = require("fs");
  const path = require("path");
  const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
  assert.match(main, /measureTeachControls/);
  assert.match(main, /listControls/);
  const ask = main.slice(main.indexOf('ipcMain.handle("hud:ask"'), main.indexOf("P4-BG-AGENTS"));
  assert.match(ask, /toOverlayEvent/);
  assert.doesNotMatch(ask, /driver\./);
  assert.doesNotMatch(ask, /hud:act/);
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

test("live meeting update fails closed with no transcript and never acts", () => {
  const empty = liveMeetingUpdate({ transcript: "" });
  assert.strictEqual(empty.ok, false);
  assert.strictEqual(empty.act, false);
  const live = liveMeetingUpdate({
    transcript: "system: Can you send the deck?\nmic: I will send it Friday.",
  });
  assert.strictEqual(live.ok, true);
  assert.strictEqual(live.act, false);
  assert.strictEqual(live.live, true);
  assert.strictEqual(live.id, "live-meeting");
  assert.match(live.deliverable, /send the deck/);
  const asked = liveMeetingUpdate({
    transcript: "mic: I will send it Friday.\nsystem: What is the launch date?",
  });
  assert.strictEqual(asked.kind, "assist");
  assert.strictEqual(asked.act, false);
  assert.match(asked.deliverable, /Suggested reply/);
  assert.ok(asked.cue);
  assert.match(asked.cue, /send it Friday/);
});

test("desk chips ask, never act", () => {
  assert.ok(DESK_CHIPS.every((c) => c.q && c.id));
  assert.ok(DESK_CHIPS.some((c) => c.id === "meeting" && c.autoAsk === true));
  assert.ok(DESK_CHIPS.some((c) => c.id === "teach" && c.autoAsk === false));
  const fs = require("fs");
  const path = require("path");
  const html = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.html"), "utf8");
  assert.match(html, /id="desk-pill"/);
  assert.doesNotMatch(html, /clicky-orb|stage-orb/);
  const hud = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.js"), "utf8");
  const desk = hud.slice(hud.indexOf('$("desk-pill")'), hud.indexOf('$("mode-pill")'));
  assert.match(desk, /doAsk\(\)/);
  assert.doesNotMatch(desk, /doAct\(\)/);
  assert.doesNotMatch(desk, /hud:act/);
});

test("live meeting pump ships one brief after quiet and skips duplicates", () => {
  const briefs = [];
  let pending = null;
  const pump = createLiveMeetingPump({
    delayMs: 0,
    setTimeoutImpl: (fn) => {
      pending = fn;
      return 1;
    },
    clearTimeoutImpl: () => {
      pending = null;
    },
  });
  pump.push({ transcript: "", onBrief: (a) => briefs.push(a) });
  pending();
  assert.strictEqual(briefs.length, 0);
  const ring = "system: Can you send the deck?\nmic: I will send it Friday.";
  pump.push({ transcript: ring, onBrief: (a) => briefs.push(a) });
  pending();
  assert.strictEqual(briefs.length, 1);
  assert.strictEqual(briefs[0].act, false);
  pump.push({ transcript: ring, onBrief: (a) => briefs.push(a) });
  pending();
  assert.strictEqual(briefs.length, 1);
  const fs = require("fs");
  const path = require("path");
  const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
  const heardAt = main.indexOf("rememberHeard(source, res.text)");
  assert.ok(heardAt >= 0);
  const heard = main.slice(heardAt, heardAt + 500);
  assert.match(heard, /liveMeetingPump\.push/);
  assert.match(heard, /appMode === "meeting"/);
  assert.match(heard, /appMode === "transcribe"/);
  const hud = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.js"), "utf8");
  assert.match(hud, /event\.type === "live-brief"/);
  assert.match(hud, /paintLiveBrief/);
  assert.match(hud, /meeting-cue/);
  assert.match(hud, /point-box/);
  const html = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.html"), "utf8");
  assert.match(html, /id="meeting-cue"/);
  assert.doesNotMatch(html, /clicky-orb|stage-orb/);
  const mainCue = main.slice(main.indexOf("function publishLiveMeeting"), main.indexOf("function localMeetingReply"));
  assert.match(mainCue, /cue:/);
  assert.match(hud, /brief\.textContent/);
  assert.doesNotMatch(hud, /coworker-brief[\s\S]{0,80}innerHTML/);
  assert.match(hud, /event\.act/);
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
