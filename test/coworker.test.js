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
  securityReportText,
  buildSecurityReport,
  teachAssist,
  inboxAssist,
  inboxDraftText,
  buildEml,
  todayAssist,
  documentAssist,
  documentDraftText,
  wantsSpawn,
  spawnCoworker,
  spawnFollowOns,
  suggestsFromAssist,
  liveMeetingUpdate,
  createLiveMeetingPump,
  createLiveTeachPump,
  createBriefClock,
  sessionBundle,
  sessionPacketParts,
  publicSessionSnapshot,
  heardFacts,
  DESK_CHIPS,
  FRAME_TEACH_TEXT,
  shouldTeachFramedRegion,
  replayTeachWalk,
  advanceLiveTeach,
  frameLiveTeach,
  hitTeachBox,
  askLiveCoworker,
  askHostCoworker,
  chipsForArtifact,
  teachWalkPath,
  teachActionCue,
  cueCaptionTurns,
  meetingCaptions,
  publicTeachSnapshot,
  enrichMeetingAssist,
  groundMeetingLine,
  MEETING_LLM_MS,
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
  assert.match(bundle.markdown, /\/workspace\?id=live-inbox/);
  assert.match(empty.markdown, /none yet/);
  assert.deepStrictEqual(
    bundle.files.map((row) => row.id),
    ["live-meeting", "live-inbox", "live-document"]
  );
  assert.strictEqual(bundle.files[0].href, "/workspace?id=live-meeting");
  assert.strictEqual(bundle.files[1].href, "/workspace?id=live-inbox");
  assert.strictEqual(bundle.files[2].href, "/workspace?id=live-document");
  const sneaky = sessionBundle([{ id: "live-meeting", desk: "../etc", title: "nope", cue: "x" }]);
  assert.strictEqual(sneaky.files[0].href, "/workspace?id=live-meeting");
  assert.doesNotMatch(sneaky.files[0].href, /\.\.|\/etc/);
  const extra = sessionBundle([{ id: "leak-1", desk: "document", title: "notes", cue: "open this file" }]);
  assert.ok(extra.files.some((row) => row.id === "leak-1" && row.href === "/workspace?id=leak-1"));
  const badId = sessionBundle([{ id: "../etc", desk: "meeting", title: "nope" }]);
  assert.strictEqual(badId.empty, true);
  assert.ok(!badId.files.some((row) => /\.\.|\/etc/.test(String(row.id || "") + String(row.href || ""))));
});

test("session packet is finished files and never execs", () => {
  const empty = sessionPacketParts([]);
  assert.strictEqual(empty.ok, false);
  assert.strictEqual(empty.exec, false);
  assert.strictEqual(empty.act, false);
  assert.strictEqual(empty.send, false);
  assert.strictEqual(empty.approve, false);
  assert.deepStrictEqual(empty.files, []);
  const inbox = inboxAssist({
    text: "draft a follow-up email",
    transcript: "system: Hi this is Sarah Chen from acme.\nsystem: Can you send the deck by Friday for $40k?\nmic: I will send it Friday.",
  });
  const document = documentAssist({ text: "write hello in Word" });
  const security = securityAssist({
    text: "review this",
    files: [{ name: "notes.md", body: "Launch is Friday for $40k." }],
  });
  const packet = sessionPacketParts(
    [
      {
        id: "live-meeting",
        desk: "meeting",
        title: "Live meeting",
        body: "# Meeting brief\nThey asked: What is the launch date?",
        cue: "We'll ship Friday.",
      },
      { id: "live-teach", desk: "teach", title: "Teach walk", body: "# Teach walk\nType in Email then Tab" },
      {
        id: "live-inbox",
        desk: "inbox",
        title: inbox.title,
        body: inbox.deliverable,
        preview: inbox.preview,
        cue: inbox.cue,
      },
      {
        id: "live-document",
        desk: "document",
        title: document.title,
        body: document.deliverable,
        preview: document.preview,
        cue: document.cue,
      },
      {
        id: "live-security",
        desk: "security",
        title: security.title,
        body: security.deliverable,
        preview: security.preview,
        cue: security.cue,
      },
      { id: "../etc/passwd", desk: "meeting", title: "nope", body: "leak" },
    ],
    "I'll send it Friday."
  );
  assert.strictEqual(packet.ok, true);
  assert.strictEqual(packet.act, false);
  assert.strictEqual(packet.exec, false);
  assert.strictEqual(packet.send, false);
  assert.strictEqual(packet.approve, false);
  const names = packet.files.map((row) => row.name);
  assert.deepStrictEqual(names, [
    "pointer-session.md",
    "meeting.md",
    "teach.md",
    "pointer-draft.eml",
    "pointer-review.md",
  ]);
  assert.ok(names.every((name) => /^[A-Za-z0-9._-]+$/.test(name)));
  assert.ok(!names.some((name) => name.includes("/") || name.includes("..")));
  assert.match(packet.files[0].data.toString("utf8"), /act: never/);
  assert.match(packet.files[1].data.toString("utf8"), /Meeting brief/);
  assert.match(packet.files[2].data.toString("utf8"), /Teach walk/);
  assert.match(packet.files[3].data.toString("utf8"), /X-Pointer-Send: never/);
  assert.match(packet.files[4].data.toString("utf8"), /approve: never/);
  assert.match(packet.documentText, /hello in Word/i);
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
    assert.ok(Array.isArray(recap.turns));
    assert.ok(recap.turns.some((row) => row.speaker === "them" && /launch date/.test(row.text) && row.asked));
    assert.ok(recap.turns.some((row) => row.speaker === "you" && /ship Friday/.test(row.text)));
    assert.match(recap.heard, /Friday/);
  assert.match(recap.heard, /\$40k/);
  const caps = cueCaptionTurns(assist.turns, { asked: assist.asked, max: 2 });
  assert.ok(caps.some((row) => /send the deck/i.test(row.text)));
  assert.ok(caps.some((row) => /\$40k/.test(row.text)));
  assert.ok(!caps.some((row) => /launch date/.test(row.text)));
  assert.deepStrictEqual(
    meetingCaptions({
      asked: assist.asked,
      live: { transcript },
    }).map((row) => row.text),
    caps.map((row) => row.text)
  );
  assert.strictEqual(teachActionCue({ cue: "1 of 3 Click Save" }), "Click Save");
  assert.strictEqual(
    teachActionCue({
      cue: "1 of 2 Click Save",
      path: [{ now: true, cue: "Click Save or press Enter" }],
    }),
    "Click Save or press Enter"
  );
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
  const groundedYou = meetingAssist({
    transcript: "them: Have you shipped the React dashboard?\nyou: I shipped the React dashboard last quarter.",
    question: "what should I say",
  });
  assert.strictEqual(groundedYou.act, false);
  assert.match(groundedYou.cue, /React dashboard/);
  assert.doesNotMatch(groundedYou.cue, /no answer/);
  assert.ok(groundedYou.turns.some((row) => row.speaker === "you" && /React/.test(row.text)));
  const unrelated = meetingAssist({
    transcript: "you: bananas are yellow\nthem: What is the launch date?",
    question: "what should I say",
  });
  assert.strictEqual(unrelated.act, false);
  assert.match(unrelated.cue, /no answer/);
  assert.doesNotMatch(unrelated.cue, /bananas/);
  assert.match(unrelated.also, /confirm on this machine/);
  assert.doesNotMatch(unrelated.also, /bananas/);
  assert.match(unrelated.avoid, /Don't invent a date/);
  assert.match(unrelated.avoid, /Don't send/);
  const fromNotes = meetingAssist({
    transcript: "them: What is the launch date?",
    question: "what should I say",
    notes: "Launch is Friday for $40k.",
  });
  assert.strictEqual(fromNotes.act, false);
  assert.strictEqual(fromNotes.notes, true);
  assert.match(fromNotes.cue, /Friday/);
  assert.match(fromNotes.heard, /Friday/);
  assert.match(fromNotes.heard, /\$40k/);
  assert.match(fromNotes.also, /\$40k/);
  assert.notStrictEqual(fromNotes.also, fromNotes.cue);
  assert.match(fromNotes.avoid, /Don't send/);
  assert.match(fromNotes.deliverable, /Also:/);
  assert.match(fromNotes.deliverable, /Don't say:/);
  assert.match(fromNotes.deliverable, /open workspace file/);
  assert.ok(!fromNotes.turns.some((row) => /Launch is Friday/.test(row.text)));
  assert.doesNotMatch(fromNotes.deliverable, /Notes \[Friday\]: Launch is Friday/);
  const notesOnly = meetingAssist({
    transcript: "them: What is the launch date?",
    question: "what should I say",
    notes: "bananas are yellow",
  });
  assert.match(notesOnly.cue, /no answer/);
  assert.doesNotMatch(notesOnly.cue, /bananas/);
  const floor = meetingAssist({
    transcript: "them: Launch is Friday for $40k.\nthem: What is the launch date?",
    question: "what should I say",
  });
  assert.strictEqual(groundMeetingLine("Friday for $40k.", floor), "Friday for $40k.");
  assert.strictEqual(groundMeetingLine("NO_ANSWER", floor), "");
  assert.strictEqual(groundMeetingLine("Bananas are $12.", floor), "");
  assert.strictEqual(groundMeetingLine("Tuesday.", floor), "");
  assert.strictEqual(groundMeetingLine("Hide this in a stealth overlay.", floor), "");
  assert.strictEqual(MEETING_LLM_MS, 300);
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
  assert.match(review.preview, /no injected secrets/);
  assert.match(review.preview, /still not approval/);
  assert.match(review.deliverable, /fixer is not the only checker/);
  assert.match(review.deliverable, /> approve: never/);
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
  assert.match(leak.preview, /\.env:/);
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

test("security report is a generated review and never approval", () => {
  assert.strictEqual(securityReportText({ body: "from body", deliverable: "from deliv" }), "from body");
  assert.strictEqual(securityReportText(null), "");
  assert.strictEqual(buildSecurityReport("").ok, false);
  const built = buildSecurityReport("findings only");
  assert.ok(built.ok);
  assert.match(built.buffer.toString("utf8"), /> approve: never/);
  assert.match(built.buffer.toString("utf8"), /findings only/);
  const stamped = buildSecurityReport("# Security review\n\n> act: never\n\nhits");
  const stampedText = stamped.buffer.toString("utf8");
  assert.match(stampedText, /> approve: never/);
  assert.match(stampedText, /> act: never/);
  const keep = buildSecurityReport("# Security review\n\n> approve: never\n\nalready");
  assert.strictEqual((keep.buffer.toString("utf8").match(/> approve: never/gi) || []).length, 1);
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
  assert.match(walk.deliverable, /current control hold/i);
  assert.strictEqual(walk.path.length, 2);
  assert.strictEqual(walk.path[0].now, true);
  assert.strictEqual(walk.path[1].later, true);
  assert.match(walk.path[0].label, /Save/);
  assert.match(walk.path[1].label, /Cancel/);
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
  assert.strictEqual(form.path.length, 3);
  assert.strictEqual(form.path[0].now, true);
  assert.match(form.path[0].label, /Email/);
  assert.strictEqual(form.path[0].key, "Tab");
  assert.strictEqual(form.path[1].later, true);
  assert.match(form.path[1].label, /Save/);
  assert.strictEqual(form.path[1].key, "Enter");
  assert.strictEqual(form.path[2].key, "");
  assert.strictEqual(form.path[2].later, true);
  assert.deepStrictEqual(teachWalkPath(form.live).map((p) => p.label), form.path.map((p) => p.label));
  assert.deepStrictEqual(publicTeachSnapshot().path, []);
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
  const replayed = replayTeachWalk({ live: form.live, ask: "got it" });
  assert.strictEqual(replayed.act, false);
  assert.match(replayed.cue, /^2 of 3 Click Save or press Enter$/);
  assert.strictEqual(replayed.path[1].now, true);
  assert.strictEqual(replayed.path[0].later, false);
  assert.strictEqual(replayed.path[0].now, false);
  const { createWorkspace } = require("../electron/netie/workspace");
  const ws = createWorkspace({ clock: () => 1 });
  ws.put({
    id: "live-teach",
    desk: "teach",
    title: "Live teach",
    body: form.deliverable,
    cue: form.cue,
    rest: form.rest,
    live: form.live,
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(ws.list()[0], "live"));
  const stepped = advanceLiveTeach(ws, "got it, next");
  assert.strictEqual(stepped.act, false);
  assert.strictEqual(stepped.exec, false);
  assert.match(stepped.cue, /Click Save or press Enter/);
  assert.ok(!stepped.live);
  assert.match(ws.get("live-teach").artifact.cue, /Click Save/);
  const noLive = advanceLiveTeach(createWorkspace({ clock: () => 2 }), "got it");
  assert.strictEqual(noLive.ok, false);
  assert.strictEqual(noLive.act, false);
  const tiny = frameLiveTeach(ws, { x0: 10, y0: 10, x1: 10.1, y1: 10.1 });
  assert.strictEqual(tiny.ok, false);
  assert.strictEqual(tiny.act, false);
  assert.strictEqual(tiny.exec, false);
  const blank = frameLiveTeach(ws, {});
  assert.strictEqual(blank.ok, false);
  const drawn = frameLiveTeach(createWorkspace({ clock: () => 9 }), {
    leftPct: 20,
    topPct: 40,
    wPct: 10,
    hPct: 4,
  });
  assert.strictEqual(drawn.ok, true);
  assert.strictEqual(drawn.act, false);
  assert.strictEqual(drawn.exec, false);
  assert.strictEqual(drawn.via, "frame");
  assert.match(drawn.deliverable, /\[BOX:20,40,10,4:1 region 1\]/);
  assert.match(drawn.cue, /Look at region 1/);
  assert.ok(!drawn.live);
  assert.strictEqual(drawn.path.length, 1);
  assert.strictEqual(drawn.path[0].now, true);
  const corners = frameLiveTeach(createWorkspace({ clock: () => 10 }), {
    x0: 30,
    y0: 50,
    x1: 20,
    y1: 40,
  });
  assert.strictEqual(corners.ok, true);
  assert.strictEqual(corners.act, false);
  assert.match(corners.deliverable, /\[BOX:20,40,10,10:1 region 1\]/);
  const strokeWs = createWorkspace({ clock: () => 10.5 });
  const strokeBox = frameLiveTeach(strokeWs, {
    stroke: [
      { x: 20, y: 40 },
      { x: 30, y: 40 },
      { x: 30, y: 50 },
      { x: 20, y: 50 },
      { x: 20, y: 42 },
    ],
  });
  assert.strictEqual(strokeBox.ok, true);
  assert.strictEqual(strokeBox.act, false);
  assert.match(strokeBox.deliverable, /\[BOX:20,40,10,10:1 region 1\]/);
  assert.ok(Array.isArray(strokeBox.path[0].stroke));
  assert.ok(strokeBox.path[0].stroke.length >= 2);
  assert.strictEqual(strokeBox.path[0].stroke[0].x, 20);
  const storedStroke = strokeWs.get("live-teach");
  assert.ok(Array.isArray(storedStroke.artifact.live.controls[0].stroke));
  assert.ok(storedStroke.artifact.live.controls[0].stroke.length >= 2);
  const moreInk = frameLiveTeach(strokeWs, {
    leftPct: 50,
    topPct: 20,
    wPct: 12,
    hPct: 8,
  });
  assert.strictEqual(moreInk.ok, true);
  assert.ok(Array.isArray(moreInk.path[0].stroke));
  assert.ok(!moreInk.path[1].stroke);
  assert.ok(strokeWs.get("live-teach").artifact.live.controls[0].stroke.length >= 2);
  const skinny = frameLiveTeach(createWorkspace({ clock: () => 10.6 }), {
    stroke: [
      { x: 10, y: 10 },
      { x: 40, y: 10.1 },
    ],
  });
  assert.strictEqual(skinny.ok, false);
  assert.strictEqual(skinny.act, false);
  const stackWs = createWorkspace({ clock: () => 11 });
  const firstBox = frameLiveTeach(stackWs, {
    leftPct: 20,
    topPct: 40,
    wPct: 10,
    hPct: 4,
  });
  assert.match(firstBox.cue, /Look at region 1/);
  assert.match(firstBox.deliverable, /\[BOX:20,40,10,4:1 region 1\]/);
  const secondBox = frameLiveTeach(stackWs, {
    leftPct: 50,
    topPct: 20,
    wPct: 12,
    hPct: 8,
  });
  assert.strictEqual(secondBox.ok, true);
  assert.strictEqual(secondBox.act, false);
  assert.strictEqual(secondBox.path.length, 2);
  assert.strictEqual(secondBox.path[0].now, true);
  assert.strictEqual(secondBox.path[1].later, true);
  assert.match(secondBox.path[0].label, /region 1/);
  assert.match(secondBox.path[1].label, /region 2/);
  assert.match(secondBox.cue, /Look at region 1/);
  assert.match(secondBox.rest, /Look at region 2/);
  const stackedClick = advanceLiveTeach(stackWs, "i clicked");
  assert.strictEqual(stackedClick.act, false);
  assert.match(stackedClick.cue, /Look at region 2/);
  assert.strictEqual(stackedClick.path[1].now, true);
  assert.strictEqual(stackedClick.path[0].now, false);
  assert.strictEqual(hitTeachBox({ leftPct: 20, topPct: 40, wPct: 10, hPct: 4 }, 25, 42), true);
  assert.strictEqual(hitTeachBox({ leftPct: 20, topPct: 40, wPct: 10, hPct: 4 }, 5, 5), false);
  assert.strictEqual(hitTeachBox(null, 25, 42), false);
  const uiaWs = createWorkspace({ clock: () => 12 });
  uiaWs.put({
    id: "live-teach",
    desk: "teach",
    title: "Live teach",
    body: form.deliverable,
    cue: form.cue,
    rest: form.rest,
    live: form.live,
  });
  const uiaDrag = frameLiveTeach(uiaWs, { leftPct: 70, topPct: 70, wPct: 10, hPct: 8 });
  assert.strictEqual(uiaDrag.ok, true);
  assert.strictEqual(uiaDrag.act, false);
  assert.ok(uiaDrag.path.some((p) => /Save/.test(p.label)));
  assert.ok(uiaDrag.path.some((p) => /region/.test(p.label)));
  assert.strictEqual(uiaDrag.path.length, 4);
  assert.match(uiaDrag.cue, /Type in Email/);
  const capWs = createWorkspace({ clock: () => 13 });
  for (let i = 0; i < 8; i++) {
    const row = frameLiveTeach(capWs, {
      leftPct: 2 + i * 8,
      topPct: 10,
      wPct: 6,
      hPct: 10,
    });
    assert.strictEqual(row.ok, true);
  }
  const ninth = frameLiveTeach(capWs, { leftPct: 80, topPct: 80, wPct: 10, hPct: 10 });
  assert.strictEqual(ninth.ok, false);
  assert.strictEqual(ninth.act, false);
  assert.match(ninth.reason, /walk is full/);
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
  assert.match(main, /path: assist.path/);
  assert.match(main, /live: assist.live/);
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
  assert.match(main, /sendTeachOverlay/);
  assert.match(main, /publishPointOverlay/);
  assert.match(main, /setIgnoreMouseEvents\(true/);
  assert.match(main, /teach-overlay.html/);
  const hideHud = main.slice(main.indexOf("function hideHud"), main.indexOf("function sendHudQuiet"));
  assert.doesNotMatch(hideHud, /teachOverlayWindow/);
  const resetWalk = main.slice(main.indexOf("function resetTeachWalk"), main.indexOf("function noteTeachStep"));
  assert.match(resetWalk, /sendTeachOverlay/);
  const openFrame = main.slice(main.indexOf("function openOverlay"), main.indexOf("function sampleForeground"));
  assert.match(openFrame, /closeTeachOverlay/);
  const teachOverlay = fs.readFileSync(path.join(__dirname, "..", "electron", "teach-overlay.html"), "utf8");
  assert.match(teachOverlay, /id="walk-chrome"/);
  assert.match(teachOverlay, /Got it/);
  assert.match(teachOverlay, /Then:/);
  assert.match(teachOverlay, /Type in Email/);
  assert.match(teachOverlay, /Click Save/);
  assert.match(teachOverlay, /point-face/);
  assert.match(teachOverlay, /point-key/);
  assert.match(teachOverlay, /got it, next/);
  assert.match(teachOverlay, /pointer-events:\s*none/);
  assert.match(teachOverlay, /point-box\.later/);
  assert.match(teachOverlay, /demo=1/);
  assert.doesNotMatch(teachOverlay, /innerHTML/);
  assert.doesNotMatch(teachOverlay, /clicky-orb|stage-orb|chat-bubble/);
  const teachPreload = fs.readFileSync(path.join(__dirname, "..", "electron", "teach-overlay-preload.js"), "utf8");
  assert.match(teachPreload, /teach-overlay:point/);
  assert.match(teachPreload, /teach-overlay:ask/);
  assert.match(teachPreload, /teach-overlay:setIgnoreMouse/);
  assert.match(teachPreload, /teach-overlay:frame/);
  assert.doesNotMatch(teachPreload, /hud:act/);
  assert.match(teachOverlay, /id="walk-draw"/);
  assert.match(teachOverlay, />Draw</);
  assert.match(teachOverlay, /id="draw-stroke"/);
  assert.match(teachOverlay, /id="walk-ink"/);
  assert.match(teachOverlay, /paintWalkInk/);
  assert.match(teachOverlay, /\\d\+\\s\+of\\s\+\\d\+/);
  assert.match(teachOverlay, /createElementNS/);
  assert.match(teachOverlay, /stroke:/);
  assert.match(teachOverlay, /teach-overlay:frame/);
  assert.match(teachOverlay, /i clicked/);
  assert.match(teachOverlay, /demoAdvance/);
  assert.match(teachOverlay, /html\.demo/);
  assert.match(teachOverlay, /#point-layer/);
  const overlayAsk = main.slice(main.indexOf('ipcMain.handle("teach-overlay:ask"'), main.indexOf('ipcMain.handle("hud:setMode"'));
  assert.match(overlayAsk, /teachAdvance/);
  assert.match(overlayAsk, /act: false/);
  assert.match(overlayAsk, /advanceLiveTeach/);
  assert.match(overlayAsk, /frameLiveTeach/);
  assert.match(overlayAsk, /liveTeachPump\.reset/);
  assert.doesNotMatch(overlayAsk, /driver\./);
  assert.doesNotMatch(overlayAsk, /spawnCoworker/);
  assert.doesNotMatch(overlayAsk, /hud:act/);
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
  assert.match(named.deliverable, /To: Sarah Chen/);
  assert.match(named.deliverable, /Wanted to confirm/);
  assert.match(named.deliverable, /Friday/);
  assert.match(named.deliverable, /\$40k/);
  assert.match(named.deliverable, /with Acme/);
  assert.doesNotMatch(named.deliverable, /Hi Acme/);
  assert.doesNotMatch(named.deliverable, /To: Acme/);
  assert.match(named.heard, /Sarah Chen/);
  assert.match(named.cue, /not sent/);
  assert.match(named.preview, /Hi Sarah Chen/);
  assert.match(fromMeet.deliverable, /To: not sent/);
  assert.match(named.deliverable, /generated \.eml/);
  assert.match(inboxDraftText({ body: named.deliverable }), /Hi Sarah Chen/);
  assert.strictEqual(
    inboxDraftText({
      preview: "short",
      body: "# Draft (not sent)\n\n## Draft\n\nfull follow-up\n\n---\nPointer will not send this.\n",
    }),
    "full follow-up"
  );
  assert.strictEqual(inboxDraftText({}), "");
  const eml = buildEml("Thanks - Friday.\nLine 2", { subject: "Hi\r\nBcc: evil@x" });
  assert.ok(eml.ok);
  const raw = eml.buffer.toString("utf8");
  assert.match(raw, /X-Pointer-Send: never/);
  assert.match(raw, /Subject: Hi Bcc: evil@x/);
  assert.match(raw, /undisclosed-recipients/);
  assert.doesNotMatch(raw, /\nBcc:/);
  assert.match(raw, /Thanks - Friday\./);
  const namedMail = buildEml(inboxDraftText({ body: named.deliverable }));
  assert.ok(namedMail.ok);
  const namedRaw = namedMail.buffer.toString("utf8");
  assert.match(namedRaw, /To: Sarah Chen/);
  assert.match(namedRaw, /X-Pointer-Send: never/);
  assert.doesNotMatch(namedRaw, /\nBcc:/);
  const blank = buildEml(" \n\t ");
  assert.strictEqual(blank.ok, false);
  const ownName = inboxAssist({
    text: "draft a follow-up email from this meeting",
    transcript: "mic: I'm Alex.\nsystem: Can you send the deck Friday?",
  });
  assert.doesNotMatch(ownName.deliverable, /Hi Alex/);
  assert.doesNotMatch(ownName.deliverable, /To: Alex/);
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

test("askLiveCoworker files inbox and Word from a stored meeting and never acts", () => {
  const { createWorkspace } = require("../electron/netie/workspace");
  const transcript = [
    "them: I'm Sarah Chen",
    "them: we're with Acme",
    "them: Can we ship Friday for $40k?",
    "you: I will send it Friday.",
  ].join("\n");
  const recap = meetingAssist({ transcript, question: "recap this meeting" });
  const ws = createWorkspace({ clock: () => 3 });
  ws.put({
    id: recap.id,
    desk: recap.desk,
    title: recap.title,
    body: recap.deliverable,
    cue: recap.cue,
    asked: recap.asked,
    heard: recap.heard,
    live: recap.live,
  });
  const asked = recap.asked;
  const cue = recap.cue;
  const mail = askLiveCoworker(ws, "draft a follow-up email from this meeting");
  assert.strictEqual(mail.ok, true);
  assert.strictEqual(mail.act, false);
  assert.strictEqual(mail.exec, false);
  assert.strictEqual(mail.desk, "inbox");
  assert.strictEqual(mail.href, "/inbox");
  assert.ok(!mail.live);
  assert.match(mail.cue, /not sent/);
  assert.match(mail.deliverable, /Hi Sarah Chen/);
  assert.match(mail.deliverable, /with Acme/);
  assert.doesNotMatch(mail.deliverable, /Hi Acme/);
  assert.match(ws.get("live-inbox").artifact.body, /Pointer will not send/);
  assert.strictEqual(ws.get("live-meeting").artifact.asked, asked);
  assert.strictEqual(ws.get("live-meeting").artifact.cue, cue);
  assert.match(ws.get("live-meeting").artifact.live.transcript, /Sarah Chen/);
  const doc = askLiveCoworker(ws, "write this recap in Word");
  assert.strictEqual(doc.ok, true);
  assert.strictEqual(doc.act, false);
  assert.strictEqual(doc.desk, "document");
  assert.strictEqual(doc.href, "/document");
  assert.match(doc.cue, /not a \.docx/);
  assert.match(doc.title, /Sarah Chen at Acme/);
  assert.strictEqual(ws.get("live-meeting").artifact.cue, cue);
  const review = askLiveCoworker(ws, "Security review this session");
  assert.strictEqual(review.ok, true);
  assert.strictEqual(review.act, false);
  assert.strictEqual(review.desk, "security");
  const assist = askLiveCoworker(ws, "What should I say?");
  assert.strictEqual(assist.ok, true);
  assert.strictEqual(assist.act, false);
  assert.strictEqual(assist.desk, "meeting");
  assert.ok(!assist.live);
  assert.match(assist.cue, /Friday/);
  const teach = askLiveCoworker(ws, "walk me through this on my screen");
  assert.strictEqual(teach.ok, false);
  assert.strictEqual(teach.act, false);
  assert.strictEqual(teach.desk, "teach");
  assert.match(teach.reason, /\/teach/);
  const empty = askLiveCoworker(ws, "   ");
  assert.strictEqual(empty.ok, false);
  assert.strictEqual(empty.act, false);
  const quiet = createWorkspace({ clock: () => 31 });
  quiet.put({
    id: "live-meeting",
    desk: "meeting",
    title: "Live meeting",
    body: "# Meeting brief",
    live: { transcript: "them: What is the launch date?" },
  });
  quiet.put({
    id: "brief-1",
    desk: "document",
    title: "brief",
    body: "Launch is Saturday for $12k.",
  });
  const fromFile = askLiveCoworker(quiet, "What should I say?", { sourceId: "brief-1" });
  assert.strictEqual(fromFile.ok, true);
  assert.strictEqual(fromFile.act, false);
  assert.match(fromFile.cue, /Saturday/);
  assert.match(fromFile.heard, /\$12k/);
  assert.strictEqual(fromFile.notes, true);
  assert.strictEqual(quiet.get("live-meeting").artifact.notes, true);
  assert.ok(!fromFile.turns.some((row) => /Saturday/.test(row.text)));
  const ignoreLiveBody = askLiveCoworker(quiet, "What should I say?", { sourceId: "live-meeting" });
  assert.match(ignoreLiveBody.cue, /no answer/);
});

test("askHostCoworker Asks from chrome and advances a stored teach walk", () => {
  const { createWorkspace } = require("../electron/netie/workspace");
  const transcript = [
    "them: I'm Sarah Chen",
    "them: we're with Acme",
    "them: Can we ship Friday for $40k?",
    "you: I will send it Friday.",
  ].join("\n");
  const recap = meetingAssist({ transcript, question: "recap this meeting" });
  const ws = createWorkspace({ clock: () => 4 });
  ws.put({
    id: recap.id,
    desk: recap.desk,
    title: recap.title,
    body: recap.deliverable,
    cue: recap.cue,
    asked: recap.asked,
    heard: recap.heard,
    live: recap.live,
  });
  const mail = askHostCoworker(ws, "draft a follow-up email from this meeting");
  assert.strictEqual(mail.ok, true);
  assert.strictEqual(mail.act, false);
  assert.strictEqual(mail.exec, false);
  assert.strictEqual(mail.desk, "inbox");
  assert.match(mail.deliverable, /Hi Sarah Chen/);
  const form = teachAssist({
    text: "walk me through this on my screen",
    controls: [
      { name: "Cancel", controlType: "Button", rect: { x: 0, y: 0, width: 100, height: 40 } },
      { name: "Save", controlType: "Button", rect: { x: 200, y: 400, width: 100, height: 40 } },
      { name: "Email", controlType: "Edit", rect: { x: 50, y: 80, width: 200, height: 32 } },
    ],
    screen: { x: 0, y: 0, width: 1000, height: 1000 },
  });
  ws.put({
    id: "live-teach",
    desk: "teach",
    title: "Live teach",
    body: form.deliverable,
    cue: form.cue,
    rest: form.rest,
    live: form.live,
  });
  const stepped = askHostCoworker(ws, "got it, next");
  assert.strictEqual(stepped.ok, true);
  assert.strictEqual(stepped.act, false);
  assert.strictEqual(stepped.desk, "teach");
  assert.strictEqual(stepped.href, "/teach");
  assert.match(stepped.cue, /Click Save or press Enter/);
  const refused = askHostCoworker(ws, "walk me through this on my screen");
  assert.strictEqual(refused.ok, false);
  assert.strictEqual(refused.act, false);
  assert.match(refused.reason, /\/teach/);
  const blank = askHostCoworker(ws, "");
  assert.strictEqual(blank.ok, false);
  assert.strictEqual(blank.act, false);
  ws.put({
    id: "leak-1",
    desk: "document",
    title: "notes",
    body: "token = AKIAIOSFODNN7EXAMPLE\n",
  });
  const fileReview = askLiveCoworker(ws, "Security review this file", { sourceId: "leak-1" });
  assert.strictEqual(fileReview.ok, true);
  assert.strictEqual(fileReview.act, false);
  assert.strictEqual(fileReview.desk, "security");
  assert.match(fileReview.deliverable, /AKIA\*\*\*\*/);
  assert.doesNotMatch(fileReview.deliverable, /AKIAIOSFODNN7EXAMPLE/);
  const fromOpen = askHostCoworker(ws, "write this recap in Word", { sourceId: "leak-1" });
  assert.strictEqual(fromOpen.desk, "document");
  assert.match(fromOpen.deliverable, /AKIA\*\*\*\*|token = AKIA/);
  const chips = chipsForArtifact(ws.get("live-meeting").artifact);
  assert.ok(chips.some((c) => /this file/.test(c.q)));
  assert.ok(chips.some((c) => /follow-up email/.test(c.q)));
  assert.strictEqual(chipsForArtifact({ desk: "teach", body: "x" }).length, 0);
});

test("today assist ships a standing brief and never invents work", () => {
  const empty = todayAssist({ state: {} });
  assert.strictEqual(empty.ok, true);
  assert.strictEqual(empty.act, false);
  assert.strictEqual(empty.skipLlm, true);
  assert.strictEqual(empty.id, "standing-today");
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
  assert.ok(Array.isArray(plated.plate));
  assert.ok(plated.plate.some((line) => /Friday/.test(line)));
  assert.doesNotMatch(plated.deliverable, /will execute/i);
  const publicPlate = todayAssist({
    state: { transcript: "mic: I will send it Friday." },
    localFirst: true,
  });
  assert.strictEqual(publicPlate.act, false);
  assert.strictEqual(publicPlate.cue || "", "");
  assert.deepStrictEqual(publicPlate.plate, []);
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
  const dumped = todayAssist({
    state: {
      artifacts: [
        {
          id: "live-meeting",
          desk: "meeting",
          body:
            "# Meeting brief\n\n## What you can say\n\nSuggested reply (say it yourself; Pointer will not send this):\n\nSarah Chen at Acme. I will not send or click anything.\n\n## Commitments\n\n- Them [Friday]: Can you send the deck by Friday for $40k?\n- You [Friday]: I will send it Friday.\n",
        },
      ],
    },
  });
  assert.match(dumped.cue, /send it Friday/);
  assert.match(dumped.deliverable, /On your plate/);
  assert.doesNotMatch(dumped.deliverable, /Suggested reply/);
  assert.doesNotMatch(dumped.deliverable, /Sarah Chen at Acme/);
  assert.doesNotMatch(dumped.deliverable, /I'll not send/);
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
  assert.match(draft.deliverable, /not a \.docx in Word\.app/);
  assert.match(draft.deliverable, /generated \.docx/);
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
  assert.match(fromMeet.preview, /ship the deck Friday/);
  assert.doesNotMatch(fromMeet.deliverable, /will execute/i);
  const bare = documentAssist({
    text: "write in Word",
    source: "# Meeting brief\n- ship the deck Friday",
  });
  assert.strictEqual(bare.act, false);
  assert.strictEqual(bare.skipLlm, true);
  assert.match(bare.deliverable, /ship the deck Friday/);
  const cleaned = documentAssist({
    text: "write this recap in Word",
    source:
      "# Meeting brief\n> kind: assist\n\n## Recap\n- ship the deck Friday\n\n## What you can say\nDon't dump this.\n\n## Commitments\n- You: I will send it Friday.",
  });
  assert.strictEqual(cleaned.act, false);
  assert.match(cleaned.preview, /ship the deck Friday/);
  assert.match(cleaned.preview, /I will send it Friday/);
  assert.doesNotMatch(cleaned.preview, /kind: assist/);
  assert.doesNotMatch(cleaned.preview, /Don't dump this/);
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
  assert.strictEqual(documentDraftText({ preview: "Ship Friday for $40k." }), "Ship Friday for $40k.");
  assert.match(documentDraftText({ body: draft.deliverable }), /hello in Word/i);
  assert.strictEqual(
    documentDraftText({
      preview: "short",
      body: "## Draft to write\n\nfull draft text\n\n## How\n",
    }),
    "full draft text"
  );
  assert.strictEqual(documentDraftText({}), "");
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
  const hostTeach = fs.readFileSync(path.join(__dirname, "..", "host", "teach.html"), "utf8");
  assert.match(hostTeach, /id="teach-next"/);
  assert.match(hostTeach, /id="teach-back"/);
  assert.match(hostTeach, /id="cue-copy"/);
  assert.match(hostTeach, /Draw around/);
  const hostApp = fs.readFileSync(path.join(__dirname, "..", "host", "app.js"), "utf8");
  assert.match(hostApp, /got it, next/);
  assert.match(hostApp, /wireTeachAdvance/);
  assert.match(hostApp, /wireTeachFrame/);
  assert.match(hostApp, /postTeachFrame/);
  assert.match(hostApp, /Draw another BOX to add a step/);
  assert.match(hostApp, /stroke:/);
  assert.match(hostApp, /paintTeachInk/);
  assert.match(hostApp, /teach-map-ink/);
  assert.match(hostApp, /teachControlFace/);
  assert.match(hostApp, /teach-map-control/);
  assert.match(hostApp, /teach-map-screen/);
  assert.match(hostApp, /applyOpenTeach/);
  assert.match(hostApp, /applyOpenMeeting/);
  assert.match(hostApp, /applyOpenDocument/);
  assert.match(hostApp, /applyOpenInbox/);
  assert.match(hostApp, /applyOpenSecurity/);
  assert.match(hostApp, /paintDeskWindow/);
  assert.match(hostApp, /notesPaper/);
  assert.match(hostApp, /notesWindowBody/);
  assert.match(hostApp, /inboxComposeBody/);
  assert.match(hostApp, /paintOpenFileBody/);
  assert.match(hostApp, /desk === "document"/);
  assert.match(hostApp, /desk === "inbox"/);
  assert.match(hostApp, /desk === "security"/);
  const liveRoom = hostApp.slice(hostApp.indexOf("function applyLiveRoom"), hostApp.indexOf("function paintLiveRoom"));
  assert.match(liveRoom, /applyOpenDocument/);
  assert.match(liveRoom, /applyOpenInbox/);
  assert.match(liveRoom, /applyOpenSecurity/);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "host", "document.html"), "utf8"), /Notes from this laptop/);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "host", "inbox.html"), "utf8"), /Unsent mail from this laptop/);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "host", "security.html"), "utf8"), /Needs you from this laptop/);
  assert.match(hostApp, /## Draft to write/);
  assert.match(hostApp, /teachActionLine/);
  assert.match(hostApp, /showMeeting = !onTeach/);
  assert.match(hostApp, /onTeach/);
  assert.match(hostApp, /Then: /);
  assert.match(hostApp, /canWalk = onTeach &&/);
  assert.match(hostApp, /meeting-card-kicker/);
  assert.match(hostApp, /meeting-card-captions/);
  assert.match(hostApp, /Live answer/);
  assert.match(hostApp, /paintChrome/);
  assert.match(hostApp, /\/api\/session\.zip/);
  assert.match(hostApp, /pointer-session.zip/);
  assert.match(hostApp, /setFinishedDownloads/);
  assert.match(hostApp, /report-download/);
  assert.match(hostApp, /\/api\/security\.md/);
  assert.match(hostApp, /\/workspace\?id=live-security/);
  assert.match(hostApp, /Not approval/);
  assert.match(hostApp, /Open in workspace/);
  assert.match(hostApp, /hitTeachBox/);
  assert.match(hostApp, /i clicked/);
  assert.match(hostApp, /Click the current BOX to Got it/);
  assert.match(hostApp, /Finished file/);
  assert.match(hostApp, /paintOpenFileTabs/);
  assert.match(hostApp, /open-file-tab/);
  assert.match(hostApp, /paintSessionTile/);
  assert.match(hostApp, /sessionTileKind/);
  assert.match(hostApp, /session-tile/);
  assert.match(hostApp, /Word file/);
  assert.match(hostApp, /Unsent mail/);
  const hostWorkspace = fs.readFileSync(path.join(__dirname, "..", "host", "workspace.html"), "utf8");
  assert.match(hostWorkspace, /id="report-download"/);
  assert.match(hostWorkspace, /id="computer-files-kicker"/);
  assert.match(hostWorkspace, /session-grid/);
  assert.match(hostWorkspace, /workspace-page/);
  assert.match(hostWorkspace, /Open a Teach walk/);
  assert.match(hostWorkspace, /Live answer/);
  assert.match(hostWorkspace, /Needs you/);
  assert.match(hostWorkspace, /unsent mail/i);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "host", "security.html"), "utf8"), /id="report-download"/);
  assert.match(hostApp, /live-cue-next/);
  assert.match(hostApp, /live-cue-captions/);
  assert.match(hostApp, /Live:/);
  assert.doesNotMatch(hostApp, /innerHTML/);
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
  assert.match(main, /enrichMeetingAssist/);
  assert.match(main, /queueMeetingEnrich/);
  assert.match(main, /timeoutMs: 300/);
  const enrichFn = main.slice(main.indexOf("function queueMeetingEnrich"), main.indexOf("const liveTeachPump"));
  assert.doesNotMatch(enrichFn, /visionChat/);
  assert.doesNotMatch(enrichFn, /dms\/secure/);
  const briefFn = main.slice(main.indexOf("function publishBrief"), main.indexOf("function publishSuggests"));
  assert.match(briefFn, /also:/);
  assert.match(briefFn, /avoid:/);
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
  assert.match(hud, /point-face/);
  assert.match(hud, /overlayControlFace/);
  assert.match(hud, /later/);
  assert.match(hud, /event\.hold/);
  assert.match(hud, /renderPoints\(event\.points, event\.ttlMs, event\.hold\)/);
  const html = fs.readFileSync(path.join(__dirname, "..", "electron", "hud.html"), "utf8");
  assert.match(html, /id="meeting-cue"/);
  assert.match(html, /id="meeting-asked"/);
  assert.match(html, /id="meeting-talk"/);
  assert.match(hud, /paintMeetingTalk/);
  assert.match(hud, /You:/);
  assert.match(hud, /event\.turns/);
  assert.match(html, /id="live-cue-bar"/);
  assert.match(html, /id="live-cue-text"/);
  assert.match(html, /id="live-cue-also"/);
  assert.match(html, /id="live-cue-avoid"/);
  assert.match(html, /id="live-cue-them"/);
  assert.match(html, /id="live-cue-you"/);
  assert.match(html, /id="live-cue-captions"/);
  assert.match(html, /id="btn-live-next"/);
  assert.doesNotMatch(html, /clicky-orb|stage-orb/);
  const mainCue = main.slice(main.indexOf("function publishLiveCoworker"), main.indexOf("function publishTeachOverlay"));
  assert.match(mainCue, /cue:/);
  assert.match(mainCue, /asked:/);
  assert.match(mainCue, /heard:/);
  assert.match(mainCue, /turns:/);
  assert.match(mainCue, /cueKind/);
  assert.match(mainCue, /teachActionCue/);
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
  assert.match(css, /\.live-cue-also/);
  assert.match(css, /\.live-cue-them/);
  assert.match(css, /\.live-cue-caption/);
  assert.match(css, /\.hud\.morph-hidden \.live-cue-bar/);
  assert.doesNotMatch(css, /chat-open \.live-cue-bar/);
  assert.doesNotMatch(css, /\.hud\.morph-hidden \.live-cue-bar[\s\S]{0,80}display:\s*none/);
  assert.match(css, /\.hud\.morph-hidden \.subtitle-live/);
  const liveFn = hud.slice(hud.indexOf("function paintLiveBrief"), hud.indexOf("const hudSettings"));
  assert.match(liveFn, /live-cue-bar/);
  assert.match(liveFn, /live-cue-also/);
  assert.match(liveFn, /live-cue-avoid/);
  assert.match(liveFn, /live-cue-them/);
  assert.match(liveFn, /live-cue-you/);
  assert.match(liveFn, /paintLiveCueCaptions/);
  assert.match(liveFn, /Them:/);
  assert.match(liveFn, /Don't say:/);
  assert.doesNotMatch(liveFn, /innerHTML/);
  const capFn = hud.slice(hud.indexOf("function paintLiveCueCaptions"), hud.indexOf("function paintMeetingTalk"));
  assert.match(capFn, /Live:/);
  assert.match(capFn, /cueCaptionLines/);
  assert.match(capFn, /cueCaptionTurns/);
  assert.match(capFn, /lastCueKind === "point"/);
  assert.match(hud, /cueCaptionTurns/);
  assert.match(capFn, /textContent/);
  assert.doesNotMatch(capFn, /innerHTML/);
  assert.match(hud, /function renderSubtitle/);
  const subFn = hud.slice(hud.indexOf("function renderSubtitle"), hud.indexOf("function positionSubtitle"));
  assert.match(subFn, /paintLiveCueCaptions/);
  const moveFn = hud.slice(hud.indexOf('"pointermove"'), hud.indexOf('"pointerdown"'));
  assert.match(moveFn, /hitChrome/);
  assert.doesNotMatch(moveFn, /syncClickThrough\(false\)/);
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

function ovReply(text) {
  return {
    fetch: () => ({
      ok: true,
      json: () => ({ choices: [{ message: { content: text } }] }),
    }),
    url: "http://ov.test",
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {},
  };
}

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

  await asyncTest("meeting LLM enrich grounds a cue and fails closed", async () => {
    const floor = meetingAssist({
      transcript: "them: Launch is Friday for $40k.\nthem: What is the launch date?",
      question: "what should I say",
    });
    assert.strictEqual(floor.act, false);
    assert.match(floor.cue, /Friday/);
    const hit = await enrichMeetingAssist(floor, ovReply("Friday for $40k."));
    assert.strictEqual(hit.act, false);
    assert.strictEqual(hit.skipLlm, true);
    assert.ok(hit.enriched);
    assert.match(hit.cue, /Friday/);
    assert.match(hit.cue, /\$40k/);
    assert.match(hit.avoid, /Don't send/);
    assert.doesNotMatch(hit.cue, /stealth|overlay|bananas/i);
    const same = await enrichMeetingAssist(floor, ovReply("Friday."));
    assert.ok(!same.enriched);
    assert.strictEqual(same.cue, floor.cue);
    const bananas = meetingAssist({
      transcript: "you: bananas are yellow\nthem: What is the launch date?",
      question: "what should I say",
    });
    let calls = 0;
    const skipped = await enrichMeetingAssist(bananas, {
      fetch: async () => {
        calls += 1;
        return { ok: true, json: async () => ({ choices: [{ message: { content: "Bananas are $12." } }] }) };
      },
      url: "http://ov.test",
      setTimeoutImpl: () => 1,
      clearTimeoutImpl: () => {},
    });
    assert.strictEqual(calls, 0);
    assert.match(skipped.cue, /no answer/);
    assert.doesNotMatch(skipped.cue, /bananas/);
    const notes = meetingAssist({
      transcript: "them: What is the launch date?",
      question: "what should I say",
      notes: "Launch is Friday for $40k.",
    });
    const ungrounded = await enrichMeetingAssist(notes, ovReply("Bananas are $12."));
    assert.ok(!ungrounded.enriched);
    assert.match(ungrounded.cue, /Friday/);
    assert.doesNotMatch(ungrounded.cue, /bananas/);
    const timed = await enrichMeetingAssist(notes, {
      fetch: () => new Promise(() => {}),
      url: "http://ov.test",
      setTimeoutImpl: (fn) => {
        fn();
        return 1;
      },
      clearTimeoutImpl: () => {},
    });
    assert.ok(!timed.enriched);
    assert.strictEqual(timed.cue, notes.cue);
    let recapCalls = 0;
    const recap = meetingAssist({
      transcript: "mic: We decided to ship Friday.",
      question: "recap this meeting",
    });
    await enrichMeetingAssist(recap, {
      fetch: async () => {
        recapCalls += 1;
        return { ok: true, json: async () => ({ choices: [{ message: { content: "Tuesday." } }] }) };
      },
      url: "http://ov.test",
      setTimeoutImpl: () => 1,
      clearTimeoutImpl: () => {},
    });
    assert.strictEqual(recapCalls, 0);
    let nextCalls = 0;
    const next = meetingAssist({
      transcript: "them: Can you send the deck by Friday?\nyou: I will send it.",
      question: "list next steps",
    });
    await enrichMeetingAssist(next, {
      fetch: async () => {
        nextCalls += 1;
        return { ok: true, json: async () => ({}) };
      },
      url: "http://ov.test",
      setTimeoutImpl: () => 1,
      clearTimeoutImpl: () => {},
    });
    assert.strictEqual(nextCalls, 0);
    const missing = await enrichMeetingAssist(floor, {
      fetch: async () => ({ ok: true }),
      url: "",
    });
    assert.ok(!missing.enriched);
    assert.strictEqual(missing.cue, floor.cue);
  });

  await asyncTest("live meeting pump publishes a grounded enrich after the heuristic", async () => {
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
      enrich: (assist) => enrichMeetingAssist(assist, ovReply("Friday for $40k.")),
    });
    const ring = "them: Launch is Friday for $40k.\nthem: What is the launch date?";
    pump.push({ transcript: ring, onBrief: (a) => briefs.push(a) });
    pending();
    assert.strictEqual(briefs.length, 1);
    assert.strictEqual(briefs[0].act, false);
    assert.ok(!briefs[0].enriched);
    assert.match(briefs[0].cue, /Friday/);
    for (let i = 0; i < 20 && briefs.length < 2; i++) await Promise.resolve();
    assert.strictEqual(briefs.length, 2);
    assert.strictEqual(briefs[1].act, false);
    assert.strictEqual(briefs[1].skipLlm, true);
    assert.ok(briefs[1].enriched);
    assert.match(briefs[1].cue, /Friday/);
    assert.match(briefs[1].cue, /\$40k/);
    assert.match(briefs[1].avoid, /Don't send/);
    pump.push({ transcript: ring, onBrief: (a) => briefs.push(a) });
    pending();
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(briefs.length, 2);
    pump.reset();
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
