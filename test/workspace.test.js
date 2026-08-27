"use strict";
const assert = require("assert");
const { createWorkspace, publicWorkspaceSnapshot } = require("../electron/netie/workspace");
const { catalog } = require("../electron/netie/coworker-desks");

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

test("put lists a brief and never grows a runtime", () => {
  const ws = createWorkspace({ clock: () => 10 });
  const miss = ws.put({ title: "empty" });
  assert.strictEqual(miss.ok, false);
  const put = ws.put({
    id: "brief-1",
    kind: "meeting-brief",
    desk: "meeting",
    title: "Standup recap",
    body: "# Meeting brief\n- ship the deck",
    cue: "I will send it Friday.",
    rest: "Click Cancel",
    heard: "Friday / $40k",
  });
  assert.strictEqual(put.ok, true);
  assert.strictEqual(ws.get("brief-1").artifact.cue, "I will send it Friday.");
  assert.strictEqual(ws.get("brief-1").artifact.rest, "Click Cancel");
  assert.strictEqual(ws.get("brief-1").artifact.heard, "Friday / $40k");
  assert.strictEqual(ws.list().length, 1);
  assert.strictEqual(ws.get("brief-1").artifact.body.includes("ship the deck"), true);
  const pub = ws.publicList();
  assert.ok(!Object.prototype.hasOwnProperty.call(pub[0], "body"));
  const withLive = ws.put({
    id: "live-teach",
    desk: "teach",
    title: "Live teach",
    body: "# Teach walkthrough\n[BOX:20,40,10,4:1 Save]",
    live: {
      controls: [{ name: "Save", controlType: "Button", rect: { x: 200, y: 400, width: 100, height: 40 } }],
      screen: { x: 0, y: 0, width: 1000, height: 1000 },
      step: 0,
      text: "walk me through this on my screen",
    },
  });
  assert.ok(withLive.artifact.live);
  assert.ok(!Object.prototype.hasOwnProperty.call(ws.list().find((r) => r.id === "live-teach"), "live"));
  assert.equal(ws.get("live-teach").artifact.live.controls[0].name, "Save");
  const meetingLive = ws.put({
    id: "live-meeting",
    desk: "meeting",
    title: "Live meeting",
    body: "# Meeting brief\n- ship it",
    cue: "I will send it Friday.",
    live: { transcript: "them: Can we ship Friday?\nyou: I will send it Friday." },
  });
  assert.match(meetingLive.artifact.live.transcript, /send it Friday/);
  assert.ok(!Object.prototype.hasOwnProperty.call(ws.list().find((r) => r.id === "live-meeting"), "live"));
  const exec = ws.exec({ backend: "container" });
  assert.strictEqual(exec.ok, false);
  assert.strictEqual(exec.exec, false);
  assert.match(exec.reason, /P-06/);
});

test("put with a stable id overwrites so a live brief does not pile up", () => {
  const ws = createWorkspace({ clock: () => 10 });
  ws.put({ id: "live-meeting", title: "Live meeting", body: "first", desk: "meeting" });
  ws.put({ id: "live-meeting", title: "Live meeting", body: "second recap", desk: "meeting" });
  assert.strictEqual(ws.list().length, 1);
  assert.strictEqual(ws.get("live-meeting").artifact.body, "second recap");
  assert.strictEqual(ws.get("missing").ok, false);
});

test("public snapshot is local-first with empty artifacts and no exec", () => {
  const snap = publicWorkspaceSnapshot(catalog());
  assert.strictEqual(snap.localFirst, true);
  assert.strictEqual(snap.exec, false);
  assert.deepStrictEqual(snap.artifacts, []);
  assert.ok(snap.session);
  assert.strictEqual(snap.session.empty, true);
  assert.strictEqual(snap.session.exec, false);
  assert.deepStrictEqual(snap.session.files, []);
  assert.ok(snap.desks.some((d) => d.id === "teach"));
  assert.match(snap.reason, /no runtime/);
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
