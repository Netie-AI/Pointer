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
  spawnFollowOns,
  suggestsFromAssist,
  liveMeetingUpdate,
  createLiveMeetingPump,
  createLiveTeachPump,
  createBriefClock,
  sessionBundle,
  publicSessionSnapshot,
  heardFacts,
  DESK_CHIPS,
  FRAME_TEACH_TEXT,
  shouldTeachFramedRegion,
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

test("session bundle is a catalog of filed desks and never execs", () => {
  const empty = sessionBundle([]);
  assert.strictEqual(empty.empty, true);
  assert.strictEqual(empty.exec, false);
  assert.strictEqual(empty.act, false);
  assert.deepStrictEqual(empty.files, []);
  const pub = publicSessionSnapshot();
  assert.strictEqual(pub.localFirst, true);
  assert.strictEqual(pub.empty, true);
  assert.strictEqual(pub.exec, false);
  const bundle = sessionBundle(
    [
      {
        id: "live-meeting",
        desk: "meeting",
        title: "Live meeting",
        cue: "We'll ship Friday for $40k.",
        asked: "What is the launch date?",
        heard: "Friday / $40k",
      },
      { id: "live-inbox", desk: "inbox", title: "Draft reply", cue: "not sent - parked P-05" },
      { id: "live-document", desk: "document", title: "Document draft", cue: "draft only - not a .docx" },
    ],
    "I'll send it Friday."
  );
  assert.strictEqual(bundle.empty, false);
  assert.strictEqual(bundle.exec, false);
  assert.strictEqual(bundle.act, false);
  assert.match(bundle.asked, /launch date/);
  assert.match(bundle.heard, /\$40k/);
  assert.match(bundle.cue, /We'll ship Friday/);
  assert.match(bundle.plate, /send it Friday/);
  assert.match(bundle.markdown, /They asked/);
  assert.match(bundle.markdown, /\/inbox/);
  assert.match(empty.markdown, /none yet/);
  assert.deepStrictEqual(
    bundle.files.map((row) => row.id),
    ["live-meeting", "live-inbox", "live-document"]
  );
  assert.strictEqual(bundle.files[0].href, "/meeting");
  assert.strictEqual(bundle.files[1].href, "/inbox");
  assert.strictEqual(bundle.files[2].href, "/document");
  const sneaky = sessionBundle([{ id: "live-meeting", desk: "../etc", title: "nope", cue: "x" }]);
  assert.strictEqual(sneaky.files[0].href, "/workspace");
});

test("heard names come from the ring and never invent", () => {
  const facts = heardFacts([
    { speaker: "you", text: "I'm going Friday" },
    { speaker: "them", text: "this is Sarah from acme" },
    { speaker: "you", text: "my name is Alex Chen" },
    { speaker: "them", text: "I am here just to listen" },
    { speaker: "them", text: "send it from Friday" },
    { speaker: "them", text: "I work at home" },
  ]);
  assert.ok(facts.includes("Friday"));
  assert.ok(facts.includes("Sarah"));
  assert.ok(facts.includes("Acme"));
  assert.ok(facts.includes("Alex Chen"));
  assert.ok(!facts.some((f) => /going|here|just/i.test(f)));
  assert.ok(!facts.includes("Home"));
});

test("pickDesk routes Clicky/Cluely/OpenWorker jobs to Pointer desks", () => {
  assert.strictEqual(pickDesk("walk me through this on screen").id, "teach");
  assert.strictEqual(pickDesk("got it, next").id, "teach");
  assert.strictEqual(pickDesk("what should I say").id, "meeting");
  assert.strictEqual(pickDesk("recap this standup").id, "meeting");
  assert.strictEqual(pickDesk("list next steps").id, "meeting");
  assert.strictEqual(pickDesk("write hello in Word").id, "document");
  assert.strictEqual(pickDesk("security review this repo").id, "security");
  assert.strictEqual(pickDesk("draft a gmail reply").id, "inbox");
  assert.strictEqual(pickDesk("draft a follow-up email from this meeting").id, "inbox");
  assert.strictEqual(pickDesk("write this recap in Word").id, "document");
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
    "mic: We decided to ship Friday.",
    "system: The budget is $40k.",
    "system: What is the launch date?",
  ].join("\n");
  const recap = meetingAssist({ transcript, question: "recap this meeting" });
  assert.strictEqual(recap.ok, true);
  assert.strictEqual(recap.act, false);
  assert.strictEqual(recap.skipLlm, true);
  assert.match(recap.deliverable, /Meeting brief/);
  assert.match(recap.deliverable, /send the deck/);
  assert.match(recap.deliverable, /## Commitments/);
  assert.match(recap.deliverable, /## Decisions/);
  assert.match(recap.deliverable, /decided to ship/);
  assert.match(recap.deliverable, /Them \[Friday\]: Can you send the deck/);
  assert.match(recap.deliverable, /You \[Friday\]: We decided to ship/);
  assert.doesNotMatch(recap.deliverable, /## Next steps/);
  const assist = meetingAssist({ transcript, question: "what should I say" });
  assert.strictEqual(assist.kind, "assist");
  assert.strictEqual(assist.act, false);
  assert.match(assist.deliverable, /launch date/);
  assert.match(assist.deliverable, /will not send/i);
  assert.match(assist.deliverable, /Suggested reply/);
  assert.ok(assist.cue);
  assert.match(assist.cue, /We'll ship Friday/);
  assert.match(assist.cue, /\$40k/);
  assert.doesNotMatch(assist.cue, /decided to/);
  assert.match(recap.cue, /We'll ship Friday/);
  assert.match(recap.cue, /\$40k/);
  assert.doesNotMatch(recap.cue, /decided to/);
  assert.match(assist.asked, /launch date/);
  assert.match(recap.asked, /launch date/);
  assert.match(recap.heard, /Friday/);
  assert.match(recap.heard, /\$40k/);
  assert.match(recap.deliverable, /## Heard/);
  assert.match(assist.heard, /Friday/);
  const timed = meetingAssist({
    transcript: "system: Can we meet Friday at 3 pm for $40k?\nmic: I will join at 15:00.",
    question: "recap this meeting",
  });
  assert.strictEqual(timed.act, false);
  assert.match(timed.heard, /3pm/i);
  assert.match(timed.heard, /15:00/);
  assert.match(timed.deliverable, /\[Friday 3pm\]/i);
  assert.match(timed.deliverable, /\[15:00\]/);
  const unanswered = meetingAssist({
    transcript: "system: What is the launch date?",
    question: "what should I say",
  });
  assert.strictEqual(unanswered.act, false);
  assert.match(unanswered.cue, /no answer/);
  assert.match(unanswered.asked, /launch date/);
  const fromHeard = meetingAssist({
    transcript: "system: Friday at 3pm for $40k?\nsystem: What is the launch date?",
    question: "what should I say",
  });
  assert.strictEqual(fromHeard.act, false);
  assert.match(fromHeard.cue, /Friday/);
  assert.match(fromHeard.cue, /3pm/i);
  assert.doesNotMatch(fromHeard.cue, /no answer/);
  const budgetAsk = meetingAssist({
    transcript: "system: Is the budget $40k?\nsystem: How much is it?",
    question: "what should I say",
  });
  assert.strictEqual(budgetAsk.act, false);
  assert.match(budgetAsk.cue, /\$40k/);
  assert.doesNotMatch(budgetAsk.cue, /no answer/);
  const named = meetingAssist({
    transcript: "mic: I'm Alex.\nsystem: What is your name?",
    question: "what should I say",
  });
  assert.strictEqual(named.act, false);
  assert.match(named.heard, /Alex/);
  assert.match(named.cue, /Alex/);
  assert.doesNotMatch(named.cue, /no answer/);
  const introduced = meetingAssist({
    transcript: "system: Hi this is Sarah Chen.\nsystem: Who am I speaking with?",
    question: "what should I say",
  });
  assert.strictEqual(introduced.act, false);
  assert.match(introduced.heard, /Sarah Chen/);
  assert.match(introduced.cue, /Sarah Chen/);
  const orged = meetingAssist({
    transcript: "system: Hi this is Sarah Chen from acme.\nsystem: Who am I speaking with?",
    question: "what should I say",
  });
  assert.strictEqual(orged.act, false);
  assert.match(orged.heard, /Acme/);
  assert.match(orged.cue, /Sarah Chen at Acme/);
  const notAName = meetingAssist({
    transcript: "mic: I'm going Friday.\nsystem: What is the launch date?",
    question: "what should I say",
  });
  assert.strictEqual(notAName.act, false);
  assert.match(notAName.heard, /Friday/);
  assert.doesNotMatch(notAName.heard, /Going/);
  assert.doesNotMatch(notAName.heard, /\bgoing\b/i);
  const next = meetingAssist({ transcript, question: "list next steps" });
  assert.strictEqual(next.kind, "next");
  assert.match(next.deliverable, /## Next steps/);
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

test("security assist ships a review, scans injected files, and never self-approves", () => {
  const empty = securityAssist({ text: "" });
  assert.strictEqual(empty.ok, false);
  assert.strictEqual(empty.act, false);
  const review = securityAssist({ text: "security review this repo for leaked keys" });
  assert.strictEqual(review.ok, true);
  assert.strictEqual(review.act, false);
  assert.strictEqual(review.skipLlm, true);
  assert.strictEqual(review.id, "live-security");
  assert.strictEqual(review.cueKind, "warn");
  assert.match(review.cue, /not approval/);
  assert.match(review.deliverable, /fixer is not the only checker/);
  assert.match(review.deliverable, /will not execute/);
  assert.match(review.deliverable, /does not scan disk/i);
  assert.doesNotMatch(review.deliverable, /_approved/);
  const leak = securityAssist({
    text: "security review this session",
    files: [
      {
        name: ".env",
        body: "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\napi_key=supersecretvalue99\n",
      },
    ],
  });
  assert.strictEqual(leak.ok, true);
  assert.strictEqual(leak.act, false);
  assert.ok(leak.findings.length >= 1);
  assert.match(leak.cue, /do not approve/);
  assert.strictEqual(leak.cueKind, "warn");
  assert.match(leak.deliverable, /aws-access-key/);
  assert.match(leak.deliverable, /AKIA\*\*\*\*/);
  assert.doesNotMatch(leak.deliverable, /AKIAIOSFODNN7EXAMPLE/);
  assert.doesNotMatch(leak.deliverable, /supersecretvalue99/);
  const attached = securityAssist({
    text: [
      "security review this session",
      '<<<NETIE_ATTACHMENT name="id_rsa">>>',
      "-----BEGIN PRIVATE KEY-----",
      "MIIBfake",
      "-----END PRIVATE KEY-----",
      '<<<END_NETIE_ATTACHMENT name="id_rsa">>>',
    ].join("\n"),
  });
  assert.ok(attached.findings.some((f) => f.kind === "pem-private-key"));
  assert.match(attached.deliverable, /redacted pem/);
  assert.doesNotMatch(attached.deliverable, /MIIBfake/);
  const fs = require("fs");
  const path = require("path");
  const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
  assert.match(main, /securityAssist/);
  assert.match(main, /sessionScanFiles/);
  assert.doesNotMatch(main.slice(main.indexOf("function sessionScanFiles"), main.indexOf("async function runDeskAssist")), /readdir|readFileSync/);
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
  assert.strictEqual(walk.id, "live-teach");
  assert.strictEqual(walk.cueKind, "point");
  assert.match(walk.cue, /^1 of 2 Click Save/);
  assert.match(walk.rest, /Click Cancel/);
  assert.match(walk.deliverable, /current step only/i);
  assert.match(walk.deliverable, /\[POINT:25,42:\d+ Save\]/);
  assert.match(walk.deliverable, /\[BOX:20,40,10,4:\d+ Save\]/);
  assert.match(walk.deliverable, /<- now/);
  assert.match(walk.deliverable, /will not click/i);
  assert.doesNotMatch(walk.deliverable, /\[POINT:.*Cancel/);
  assert.doesNotMatch(walk.deliverable, /\[BOX:.*Cancel/);
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
  assert.strictEqual(pin.cue, "1 of 2 Click Cancel");
  const two = teachAssist({
    text: "next",
    controls,
    screen,
    step: 1,
    live: true,
  });
  assert.strictEqual(two.act, false);
  assert.strictEqual(two.step, 1);
  assert.match(two.cue, /^2 of 2 Click Cancel$/);
  assert.match(two.deliverable, /\[POINT:5,2:\d+ Cancel\]/);
  assert.doesNotMatch(two.deliverable, /\[POINT:.*Save/);
  const form = teachAssist({
    text: "walk me through this on my screen",
    controls: [
      { name: "Cancel", controlType: "Button", rect: { x: 0, y: 0, width: 100, height: 40 } },
      { name: "Save", controlType: "Button", rect: { x: 200, y: 400, width: 100, height: 40 } },
      { name: "Email", controlType: "Edit", rect: { x: 50, y: 80, width: 200, height: 32 } },
    ],
    screen,
  });
  assert.strictEqual(form.act, false);
  assert.match(form.cue, /^1 of 3 Type in Email then Tab$/);
  assert.match(form.rest, /Click Save or press Enter \/ Click Cancel/);
  const submit = teachAssist({
    text: "next",
    controls: [
      { name: "Cancel", controlType: "Button", rect: { x: 0, y: 0, width: 100, height: 40 } },
      { name: "Save", controlType: "Button", rect: { x: 200, y: 400, width: 100, height: 40 } },
      { name: "Email", controlType: "Edit", rect: { x: 50, y: 80, width: 200, height: 32 } },
    ],
    screen,
    step: 1,
    live: true,
  });
  assert.match(submit.cue, /^2 of 3 Click Save or press Enter$/);
  assert.match(submit.rest, /^Click Cancel$/);
  const { nextTeachStep, teachAdvance } = require("../electron/netie/coworker-desks");
  assert.strictEqual(teachAdvance("got it"), 1);
  assert.strictEqual(nextTeachStep("walk me through this on my screen", 3, true), 0);
  assert.strictEqual(nextTeachStep("next", 0, true), 1);
  assert.strictEqual(nextTeachStep("next", 0, false), 0);
  const emptyTree = teachAssist({
    text: "walk me through this on my screen",
    controls: [{ name: "Save", controlType: "Button" }],
    screen,
  });
  assert.strictEqual(emptyTree.skipLlm, false);
  assert.doesNotMatch(emptyTree.deliverable, /\[POINT:\s*\d/);
  assert.doesNotMatch(emptyTree.deliverable, /\[BOX:\s*\d/);
  const framed = teachAssist({
    text: FRAME_TEACH_TEXT,
    controls: [],
    screen: { x: 0, y: 0, width: 1000, height: 1000 },
    region: { x: 200, y: 400, width: 100, height: 40 },
    framed: true,
  });
  assert.strictEqual(framed.ok, true);
  assert.strictEqual(framed.act, false);
  assert.strictEqual(framed.skipLlm, true);
  assert.strictEqual(framed.via, "frame");
  assert.match(framed.deliverable, /\[BOX:20,40,10,4:1 this region\]/);
  assert.match(framed.deliverable, /framed region/);
  assert.match(framed.cue, /Look at this region/);
  assert.doesNotMatch(framed.deliverable, /control tree/);
  const unframed = teachAssist({
    text: FRAME_TEACH_TEXT,
    controls: [],
    screen: { x: 0, y: 0, width: 1000, height: 1000 },
    region: { x: 200, y: 400, width: 100, height: 40 },
    framed: false,
  });
  assert.strictEqual(unframed.skipLlm, false);
  assert.strictEqual(unframed.via, "none");
  assert.doesNotMatch(unframed.deliverable, /\[BOX:\s*\d/);
  const fs = require("fs");
  const path = require("path");
  const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
  assert.match(main, /measureTeachControls/);
  assert.match(main, /listControls/);
  assert.match(main, /publishLiveCoworker/);
  assert.match(main, /liveArtifactBody/);
  assert.match(main, /noteTeachStep/);
  assert.match(main, /armTeachWalk/);
  assert.match(main, /hold: true/);
  assert.match(main, /resetTeachWalk/);
  const deskRun = main.slice(main.indexOf("async function runDeskAssist"), main.indexOf("function enqueueCoworkerJob"));
  assert.match(deskRun, /measured.region/);
  assert.match(deskRun, /measured.framed/);
  assert.doesNotMatch(deskRun, /driver\./);
  const livePub = main.slice(main.indexOf("function publishLiveCoworker"), main.indexOf("function publishTeachOverlay"));
  assert.match(livePub, /type: "insight"/);
  assert.match(livePub, /Review:/);
  assert.match(livePub, /They asked/);
  assert.match(livePub, /Plate:/);
  assert.match(main, /standing-today/);
  const ask = main.slice(main.indexOf('ipcMain.handle("hud:ask"'), main.indexOf("P4-BG-AGENTS"));
  assert.match(ask, /toOverlayEvent/);
  assert.doesNotMatch(ask, /driver\./);
  assert.doesNotMatch(ask, /hud:act/);
  assert.strictEqual(FRAME_TEACH_TEXT, "walk me through this on my screen");
  assert.strictEqual(shouldTeachFramedRegion({ frameForTeach: true, captured: true, act: false }), true);
  assert.strictEqual(shouldTeachFramedRegion({ frameForTeach: true, captured: true, act: true }), false);
  assert.strictEqual(shouldTeachFramedRegion({ frameForTeach: false, captured: true, act: false }), false);
  assert.strictEqual(shouldTeachFramedRegion({ frameForTeach: true, captured: false, act: false }), false);
  assert.match(main, /openOverlay\(\{ teach: true \}\)/);
  assert.match(main, /armTeachWalk\(FRAME_TEACH_TEXT\)/);
  assert.match(main, /shouldTeachFramedRegion/);
  const frameHud = main.slice(main.indexOf('ipcMain.handle("hud:frameRegion"'), main.indexOf('ipcMain.handle("hud:toggleListen"'));
  assert.match(frameHud, /openOverlay\(\{ teach: true \}\)/);
  assert.match(frameHud, /act: false/);
  assert.doesNotMatch(frameHud, /driver\./);
  const commit = main.slice(main.indexOf('ipcMain.handle("clicks:commitRegion"'), main.indexOf('ipcMain.handle("clicks:cancelRegion"'));
  assert.match(commit, /armTeachWalk\(FRAME_TEACH_TEXT\)/);
  assert.doesNotMatch(commit, /hud:act/);
  assert.doesNotMatch(commit, /driver\./);
  const cancel = main.slice(main.indexOf('ipcMain.handle("clicks:cancelRegion"'), main.indexOf('ipcMain.handle("click:askBuddy"'));
  assert.match(cancel, /frameForTeach = false/);
  const tray = main.slice(main.indexOf("function createTray"), main.indexOf("function registerHotkey"));
  assert.match(tray, /openOverlay\(\)/);
  assert.doesNotMatch(tray, /teach: true/);
  const overlay = fs.readFileSync(path.join(__dirname, "..", "electron", "overlay.html"), "utf8");
  assert.match(overlay, /teach=1/);
  assert.match(overlay, /walkthrough/);
  const hudHtml = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.html"), "utf8");
  assert.match(hudHtml, /data-cmd="walk"/);
  const hudJs = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.js"), "utf8");
  assert.match(hudJs, /cmd === "walk"/);
});

test("inbox assist drafts and never sends", () => {
  const draft = inboxAssist({ text: "draft a gmail reply saying we shipped" });
  assert.strictEqual(draft.ok, true);
  assert.strictEqual(draft.act, false);
  assert.strictEqual(draft.skipLlm, true);
  assert.strictEqual(draft.id, "live-inbox");
  assert.strictEqual(draft.cueKind, "warn");
  assert.match(draft.cue, /not sent/);
  assert.match(draft.deliverable, /not sent/i);
  assert.match(draft.deliverable, /will not send/);
  const fromMeet = inboxAssist({
    text: "draft a follow-up email from this meeting",
    transcript: "system: Can you send the deck?\nmic: I will send it Friday.\nmic: We decided to ship Friday.",
  });
  assert.strictEqual(fromMeet.act, false);
  assert.match(fromMeet.deliverable, /You \[Friday\]: I will send it Friday/);
  assert.match(fromMeet.deliverable, /You \[Friday\]: We decided to ship/);
  assert.match(fromMeet.deliverable, /will not send/);
  const named = inboxAssist({
    text: "draft a follow-up email from this meeting",
    transcript:
      "system: Hi this is Sarah Chen from acme.\nsystem: Can you send the deck by Friday for $40k?\nmic: I will send it Friday.",
  });
  assert.strictEqual(named.act, false);
  assert.match(named.deliverable, /Hi Sarah Chen/);
  assert.match(named.deliverable, /Wanted to confirm/);
  assert.match(named.deliverable, /Friday/);
  assert.match(named.deliverable, /\$40k/);
  assert.match(named.deliverable, /with Acme/);
  assert.doesNotMatch(named.deliverable, /Hi Acme/);
  assert.match(named.heard, /Sarah Chen/);
  assert.match(named.cue, /not sent/);
  const ownName = inboxAssist({
    text: "draft a follow-up email from this meeting",
    transcript: "mic: I'm Alex.\nsystem: Can you send the deck Friday?",
  });
  assert.doesNotMatch(ownName.deliverable, /Hi Alex/);
  const notAName = inboxAssist({
    text: "draft a follow-up email from this meeting",
    transcript: "system: I'm going Friday.\nmic: I will send it Friday.",
  });
  assert.doesNotMatch(notAName.deliverable, /Hi Going/);
  assert.match(notAName.deliverable, /Friday/);
});

test("suggestsFromAssist turns transcript questions into HUD chips", () => {
  const recap = meetingAssist({
    transcript: "system: Can you send the deck by Friday?\nmic: Yes I will send it.",
    question: "recap this meeting",
  });
  const items = suggestsFromAssist(recap);
  assert.ok(items.some((i) => /What should I say/.test(i.q)));
  assert.ok(items.some((i) => /send the deck/.test(i.q)));
  assert.ok(items.some((i) => /follow-up email/.test(i.q)));
  assert.ok(items.some((i) => /write this recap in Word/.test(i.q)));
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
  assert.match(empty.deliverable, /On your plate/);
  assert.match(empty.deliverable, /P-06/);
  assert.strictEqual(empty.cue || "", "");
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
  const plated = todayAssist({
    state: {
      transcript: "system: Can you send the deck?\nmic: I will send it Friday.",
    },
  });
  assert.strictEqual(plated.act, false);
  assert.match(plated.cue, /send it Friday/);
  assert.match(plated.deliverable, /On your plate/);
  assert.match(plated.deliverable, /I'll send it Friday/);
  assert.doesNotMatch(plated.deliverable, /will execute/i);
  const publicPlate = todayAssist({
    state: { transcript: "mic: I will send it Friday." },
    localFirst: true,
  });
  assert.strictEqual(publicPlate.act, false);
  assert.strictEqual(publicPlate.cue || "", "");
  assert.doesNotMatch(publicPlate.deliverable, /send it Friday/);
  const filed = todayAssist({
    state: {
      artifacts: [
        { id: "live-inbox", desk: "inbox", title: "Draft reply" },
        { id: "live-document", desk: "document", title: "Document draft" },
      ],
    },
  });
  assert.strictEqual(filed.act, false);
  assert.match(filed.deliverable, /Unsent follow-up draft/);
  assert.match(filed.deliverable, /not sent/);
  assert.match(filed.deliverable, /Word draft waiting/);
  assert.match(filed.deliverable, /not a \.docx/);
  assert.match(filed.cue, /not a \.docx/);
  const both = todayAssist({
    state: {
      transcript: "mic: I will send it Friday.",
      artifacts: [
        { id: "live-inbox", desk: "inbox", title: "Draft reply" },
        { id: "live-document", desk: "document", title: "Document draft" },
      ],
    },
  });
  assert.match(both.cue, /send it Friday/);
  assert.match(both.deliverable, /Unsent follow-up draft/);
  assert.match(both.deliverable, /Word draft waiting/);
  const hiddenFiled = todayAssist({
    state: { artifacts: [{ id: "live-inbox", desk: "inbox", title: "Draft reply" }] },
    localFirst: true,
  });
  assert.strictEqual(hiddenFiled.cue || "", "");
  assert.doesNotMatch(hiddenFiled.deliverable, /Unsent follow-up/);
});

test("document assist drafts and never writes Word", () => {
  const miss = documentAssist({ text: "" });
  assert.strictEqual(miss.ok, false);
  const draft = documentAssist({ text: "write hello in Word" });
  assert.strictEqual(draft.ok, true);
  assert.strictEqual(draft.act, false);
  assert.strictEqual(draft.skipLlm, false);
  assert.strictEqual(draft.id, "live-document");
  assert.strictEqual(draft.cueKind, "warn");
  assert.match(draft.cue, /not a \.docx/);
  assert.match(draft.deliverable, /not a \.docx/);
  assert.match(draft.deliverable, /word_docx_write/);
  assert.doesNotMatch(draft.deliverable, /will execute/i);
  const fromMeet = documentAssist({
    text: "write this recap in Word",
    source: "# Meeting brief\n- ship the deck Friday",
  });
  assert.strictEqual(fromMeet.act, false);
  assert.strictEqual(fromMeet.skipLlm, true);
  assert.match(fromMeet.deliverable, /ship the deck Friday/);
  assert.match(fromMeet.deliverable, /live-meeting/);
  assert.doesNotMatch(fromMeet.deliverable, /will execute/i);
  const bare = documentAssist({
    text: "write in Word",
    source: "# Meeting brief\n- ship the deck Friday",
  });
  assert.strictEqual(bare.act, false);
  assert.strictEqual(bare.skipLlm, true);
  assert.match(bare.deliverable, /ship the deck Friday/);
  const fromToday = documentAssist({
    text: "write in Word",
    source: "# Today\n## On your plate\n- I'll send it Friday.",
  });
  assert.strictEqual(fromToday.act, false);
  assert.match(fromToday.deliverable, /standing-today/);
  assert.match(fromToday.deliverable, /send it Friday/);
  assert.doesNotMatch(fromToday.deliverable, /will execute/i);
  const named = documentAssist({
    text: "write this recap in Word",
    source: "# Meeting brief\n- ship the deck Friday",
    transcript: "system: Hi this is Sarah Chen from acme.\nmic: I will send it Friday.",
  });
  assert.strictEqual(named.act, false);
  assert.match(named.title, /Notes with Sarah Chen at Acme/);
  assert.match(named.cue, /Sarah Chen at Acme/);
  assert.match(named.cue, /not a \.docx/);
  assert.match(named.deliverable, /Notes with Sarah Chen at Acme/);
  assert.doesNotMatch(named.deliverable, /will execute/i);
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
  assert.match(recap.job, /recap this meeting/);
  assert.match(recap.note, /unsent follow-up/);
  assert.match(recap.note, /security review/);
  assert.strictEqual(recap.act, false);
  const plate = spawnCoworker({ text: "spawn a coworker" });
  assert.ok(plate.ok);
  assert.strictEqual(plate.desk, "today");
  assert.match(plate.job, /on my plate/);
  assert.strictEqual(plate.act, false);
  assert.doesNotMatch(plate.note, /unsent follow-up/);
  const during = spawnCoworker({ text: "spawn a coworker", mode: "meeting" });
  assert.strictEqual(during.desk, "meeting");
  assert.match(during.job, /recap this meeting/);
  assert.match(during.note, /unsent follow-up/);
  assert.strictEqual(during.act, false);
  const transcribe = spawnCoworker({ text: "spawn a coworker", mode: "transcribe" });
  assert.strictEqual(transcribe.desk, "meeting");
  assert.match(transcribe.job, /recap this meeting/);
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
  assert.match(job, /spawn\.job/);
  assert.doesNotMatch(job, /claim\("pointer-act"/);
  assert.doesNotMatch(job, /driver\./);
});

test("meeting spawn follow-ons ship inbox and Word drafts without acting", () => {
  const transcript =
    "system: Hi this is Sarah Chen.\nsystem: Can you send the deck Friday for $40k?\nmic: I will send it Friday.\nmic: We decided to ship Friday.";
  const recap = meetingAssist({ transcript, question: "recap this meeting" });
  assert.strictEqual(recap.ok, true);
  assert.strictEqual(recap.desk, "meeting");
  assert.strictEqual(recap.act, false);
  const follows = spawnFollowOns(recap, { transcript });
  assert.strictEqual(follows.length, 3);
  assert.ok(follows.every((row) => row.ok && row.act === false));
  const desks = follows.map((row) => row.desk);
  assert.ok(desks.includes("inbox"));
  assert.ok(desks.includes("document"));
  assert.ok(desks.includes("security"));
  const mail = follows.find((row) => row.desk === "inbox");
  assert.strictEqual(mail.id, "live-inbox");
  assert.match(mail.deliverable, /not sent/i);
  assert.match(mail.deliverable, /will not send/);
  assert.match(mail.deliverable, /send it Friday/);
  assert.match(mail.deliverable, /Hi Sarah Chen/);
  assert.match(mail.deliverable, /\$40k/);
  const doc = follows.find((row) => row.desk === "document");
  assert.strictEqual(doc.id, "live-document");
  assert.strictEqual(doc.skipLlm, true);
  assert.match(doc.deliverable, /not a \.docx/);
  assert.match(doc.deliverable, /send it Friday/);
  assert.match(doc.deliverable, /Notes with Sarah Chen/);
  const scanHit = follows.find((row) => row.desk === "security");
  assert.strictEqual(scanHit.id, "live-security");
  assert.match(scanHit.deliverable, /injected files only|no secret patterns|Findings/);
  assert.doesNotMatch(scanHit.deliverable, /will execute/i);
  const hot = meetingAssist({
    transcript: "system: key is AKIAIOSFODNN7EXAMPLE\nmic: I will rotate it Friday.",
    question: "recap this meeting",
  });
  const hotFollows = spawnFollowOns(hot, {
    transcript: "system: key is AKIAIOSFODNN7EXAMPLE\nmic: I will rotate it Friday.",
  });
  const hotScan = hotFollows.find((row) => row.desk === "security");
  assert.ok(hotScan);
  assert.strictEqual(hotScan.act, false);
  assert.match(hotScan.deliverable, /AKIA\*\*\*\*/);
  assert.doesNotMatch(hotScan.deliverable, /AKIAIOSFODNN7EXAMPLE/);
  assert.strictEqual(spawnFollowOns(todayAssist({ question: "what's on my plate" })).length, 0);
  const walk = teachAssist({ text: "walk me through this on my screen" });
  assert.strictEqual(spawnFollowOns(walk).length, 0);
  const scan = securityAssist({ text: "security review this session" });
  assert.strictEqual(spawnFollowOns(scan).length, 0);
  const fs = require("fs");
  const path = require("path");
  const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
  assert.match(main, /spawnFollowOns/);
  const job = main.slice(main.indexOf("function enqueueCoworkerJob"), main.indexOf('ipcMain.handle("hud:bgList"'));
  assert.match(job, /spawnFollowOns/);
  assert.match(job, /publishBrief\(follow\)/);
  assert.doesNotMatch(job, /publishLiveCoworker\(follow\)/);
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
  assert.match(asked.asked, /launch date/);
});

test("desk chips ask, never act", () => {
  assert.ok(DESK_CHIPS.every((c) => c.q && c.id));
  assert.ok(DESK_CHIPS.some((c) => c.id === "meeting" && c.autoAsk === true));
  assert.ok(DESK_CHIPS.some((c) => c.id === "teach" && c.autoAsk === false));
  const fs = require("fs");
  const path = require("path");
  const html = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.html"), "utf8");
  assert.match(html, /id="desk-pill"/);
  assert.match(html, /id="btn-teach-next"/);
  assert.match(html, /id="btn-teach-back"/);
  assert.doesNotMatch(html, /clicky-orb|stage-orb/);
  const hud = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.js"), "utf8");
  const desk = hud.slice(hud.indexOf('$("desk-pill")'), hud.indexOf('$("mode-pill")'));
  assert.match(desk, /doAsk\(\)/);
  assert.doesNotMatch(desk, /doAct\(\)/);
  assert.match(desk, /cue-advance/);
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
  assert.match(hud, /meeting-asked/);
  assert.match(hud, /They asked/);
  assert.match(hud, /Heard:/);
  assert.match(hud, /event\.heard/);
  assert.match(hud, /Then:/);
  assert.match(hud, /event\.rest/);
  assert.match(hud, /point-box/);
  assert.match(hud, /event\.hold/);
  assert.match(hud, /renderPoints\(event\.points, event\.ttlMs, event\.hold\)/);
  const html = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.html"), "utf8");
  assert.match(html, /id="meeting-cue"/);
  assert.match(html, /id="meeting-asked"/);
  assert.match(html, /id="live-cue-bar"/);
  assert.match(html, /id="live-cue-text"/);
  assert.match(html, /id="btn-live-next"/);
  assert.doesNotMatch(html, /clicky-orb|stage-orb/);
  const mainCue = main.slice(main.indexOf("function publishLiveCoworker"), main.indexOf("function publishTeachOverlay"));
  assert.match(mainCue, /cue:/);
  assert.match(mainCue, /asked:/);
  assert.match(mainCue, /heard:/);
  assert.match(mainCue, /cueKind/);
  assert.match(hud, /cueDisplay/);
  assert.match(hud, /Next:/);
  assert.match(hud, /Review:/);
  assert.match(hud, /Copy review/);
  assert.match(hud, /brief\.textContent/);
  assert.match(hud, /live-cue-bar/);
  assert.match(hud, /cue-advance/);
  assert.doesNotMatch(hud, /coworker-brief[\s\S]{0,80}innerHTML/);
  const css = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.css"), "utf8");
  assert.match(css, /\.live-cue-bar/);
  assert.doesNotMatch(css, /chat-open \.live-cue-bar/);
  const liveFn = hud.slice(hud.indexOf("function paintLiveBrief"), hud.indexOf("const hudSettings"));
  assert.match(liveFn, /live-cue-bar/);
  assert.doesNotMatch(liveFn, /innerHTML/);
  assert.match(hud, /event\.act/);
});

test("live meeting pump answers a question faster than a recap", () => {
  const waits = [];
  const pump = createLiveMeetingPump({
    setTimeoutImpl: (_fn, ms) => {
      waits.push(ms);
      return 1;
    },
    clearTimeoutImpl: () => {},
  });
  pump.push({ transcript: "mic: We decided to ship Friday.", onBrief: () => {} });
  pump.push({
    transcript: "mic: We decided to ship Friday.\nsystem: What is the launch date?",
    onBrief: () => {},
  });
  assert.strictEqual(waits[0], 900);
  assert.strictEqual(waits[1], 300);
});

async function asyncTest(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log("PASS " + name);
  } catch (err) {
    fails.push(name);
    console.log("FAIL " + name + " -- " + err.message);
  }
}

(async () => {
  await asyncTest("live teach pump overlays measured boxes and never invents", async () => {
    const hits = [];
    let tick = null;
    const pump = createLiveTeachPump({
      delayMs: 0,
      setIntervalImpl: (fn) => {
        tick = fn;
        return 1;
      },
      clearIntervalImpl: () => {
        tick = null;
      },
    });
    const screen = { x: 0, y: 0, width: 1000, height: 1000 };
    const tree = [
      { name: "Save", controlType: "Button", rect: { x: 200, y: 400, width: 100, height: 40 } },
    ];
    pump.start({
      text: "walk me through this on my screen",
      measure: () => ({ controls: tree, screen }),
      onAssist: (a) => hits.push(a),
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].act, false);
    assert.match(hits[0].deliverable, /\[BOX:20,40,10,4:\d+ Save\]/);
  assert.match(hits[0].cue, /^1 of 1 Click Save or press Enter$/);
    assert.strictEqual(hits[0].cueKind, "point");
    if (tick) await tick();
    await Promise.resolve();
    assert.strictEqual(hits.length, 1);
    pump.reset();
    const tree2 = [
      { name: "Cancel", controlType: "Button", rect: { x: 0, y: 0, width: 100, height: 40 } },
      { name: "Save", controlType: "Button", rect: { x: 200, y: 400, width: 100, height: 40 } },
    ];
    pump.start({
      text: "walk me through this on my screen",
      step: 1,
      measure: () => ({ controls: tree2, screen }),
      onAssist: (a) => hits.push(a),
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(hits.length, 2);
    assert.match(hits[1].cue, /^2 of 2 Click Cancel$/);
    assert.match(hits[1].deliverable, /\[POINT:5,2:\d+ Cancel\]/);
    assert.doesNotMatch(hits[1].deliverable, /\[POINT:.*Save/);
    pump.reset();
    pump.start({
      text: "walk me through this on my screen",
      measure: () => ({ controls: [], screen }),
      onAssist: (a) => hits.push(a),
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(hits.length, 2);
    pump.reset();
    pump.start({
      text: "walk me through this on my screen",
      measure: () => ({
        controls: [],
        screen: { x: 0, y: 0, width: 1000, height: 1000 },
        region: { x: 200, y: 400, width: 100, height: 40 },
        framed: true,
      }),
      onAssist: (a) => hits.push(a),
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(hits.length, 3);
    assert.strictEqual(hits[2].act, false);
    assert.strictEqual(hits[2].via, "frame");
    assert.match(hits[2].deliverable, /\[BOX:20,40,10,4:1 this region\]/);
    const fs = require("fs");
    const path = require("path");
    const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
    assert.match(main, /createLiveTeachPump/);
    assert.match(main, /liveTeachPump\.start/);
    assert.match(main, /teachDisplayBounds/);
    assert.match(main, /framed:/);
    assert.doesNotMatch(main.slice(main.indexOf("function publishTeachOverlay"), main.indexOf("function publishLiveMeeting") + 40), /driver\./);
  });

  await asyncTest("standing brief clock ships today and never acts", async () => {
    const hits = [];
    let tick = null;
    const clock = createBriefClock({
      delayMs: 0,
      setIntervalImpl: (fn) => {
        tick = fn;
        return 1;
      },
      clearIntervalImpl: () => {
        tick = null;
      },
    });
    clock.start({
      brief: () => todayAssist({ state: {} }),
      onBrief: (a) => hits.push(a),
    });
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].act, false);
    assert.strictEqual(hits[0].id, "standing-today");
    assert.match(hits[0].deliverable, /# Today/);
    if (tick) tick();
    assert.strictEqual(hits.length, 1);
    clock.reset();
    const fs = require("fs");
    const path = require("path");
    const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
    assert.match(main, /standingClock\.start/);
    assert.match(main, /hud:copyText/);
    const hud = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.js"), "utf8");
    assert.match(hud, /hud:copyText/);
    assert.doesNotMatch(hud.slice(hud.indexOf("const btnCopyCue"), hud.indexOf("$(\"mode-pill\")")), /hud:act/);
  });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
