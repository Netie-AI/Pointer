"use strict";
const assert = require("assert");
const http = require("http");
const { createCoordinator } = require("../electron/netie/coordinator");
const { createMcpAbi } = require("../electron/netie/mcp-abi");

let pass = 0;
const fails = [];
function test(name, fn) {
  const run = Promise.resolve().then(fn);
  return run.then(() => {
    pass += 1;
    console.log("PASS " + name);
  }).catch((err) => {
    fails.push(name);
    console.log("FAIL " + name + " -- " + err.message);
  });
}

(async () => {
  await test("unknown lane is refused", () => {
    const c = createCoordinator({ clock: () => 1 });
    const r = c.claim("desktop", { owner: "x" });
    assert.strictEqual(r.ok, false);
  });

  await test("second owner cannot take pointer-act", () => {
    const c = createCoordinator({ clock: () => 10 });
    assert.strictEqual(c.claim("pointer-act", { owner: "pointer-hud", goal: "write hello" }).ok, true);
    const clash = c.claim("pointer-act", { owner: "cursor-cloud", goal: "also write" });
    assert.strictEqual(clash.ok, false);
    assert.strictEqual(clash.conflict, true);
    assert.match(clash.reason, /pointer-hud/);
    const same = c.claim("pointer-act", { owner: "pointer-hud", goal: "write hello in Word" });
    assert.strictEqual(same.ok, true);
    assert.strictEqual(c.release("pointer-act", { owner: "cursor-cloud" }).ok, false);
    assert.strictEqual(c.release("pointer-act", { owner: "pointer-hud" }).ok, true);
    assert.strictEqual(c.snapshot().lanes["pointer-act"], null);
  });

  await test("pages are the host.netie.ai paths", () => {
    const c = createCoordinator();
    assert.strictEqual(c.pageFor("/"), "home");
    assert.strictEqual(c.pageFor("/today/"), "today");
    assert.strictEqual(c.pageFor("/lanes"), "lanes");
    assert.strictEqual(c.pageFor("/skills"), "skills");
    assert.strictEqual(c.pageFor("/workspace"), "workspace");
    assert.strictEqual(c.pageFor("/meeting"), "meeting");
    assert.strictEqual(c.pageFor("/teach"), "teach");
    assert.strictEqual(c.pageFor("/security"), "security");
    assert.strictEqual(c.pageFor("/document"), "document");
    assert.strictEqual(c.pageFor("/inbox"), "inbox");
    assert.strictEqual(c.pageFor("/secret"), null);
  });

  await test("loopback HTTP serves /today and refuses 0.0.0.0", async () => {
    const mcp = createMcpAbi();
    const c = createCoordinator({ mcp });
    const bad = await Promise.resolve(c.listen({ host: "0.0.0.0", port: 0 }));
    assert.strictEqual(bad.ok, false);
    const on = await c.listen({ host: "127.0.0.1", port: 0 });
    assert.strictEqual(on.ok, true);
    const port = on.address.port;
    const html = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/today" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }).on("error", reject);
    });
    assert.strictEqual(html.status, 200);
    assert.match(html.body, /\/today/);
    assert.match(html.body, /today-chips/);
    assert.match(html.body, /id="today-plate"/);
    const wsPage = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/workspace" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }).on("error", reject);
    });
    assert.strictEqual(wsPage.status, 200);
    assert.match(wsPage.body, /id="computer-dock"/);
    assert.match(wsPage.body, /id="computer-run"/);
    const st = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/state" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
      }).on("error", reject);
    });
    assert.ok(st.pages["/today"]);
    await c.close();
  });

  await test("loopback workspace put is live and exec is refused", async () => {
    const c = createCoordinator({ clock: () => 3 });
    const on = await c.listen({ host: "127.0.0.1", port: 0 });
    const port = on.address.port;
    const put = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/workspace", method: "POST" },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ title: "Standup", body: "# Meeting brief\n- ship it", desk: "meeting" }));
    });
    assert.strictEqual(put.status, 200);
    assert.strictEqual(put.body.ok, true);
    const listed = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/workspace" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
      }).on("error", reject);
    });
    assert.strictEqual(listed.exec, false);
    assert.strictEqual(listed.artifacts.length, 1);
    const exec = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/workspace/exec", method: "POST" },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
        }
      );
      req.on("error", reject);
      req.end("{}");
    });
    assert.strictEqual(exec.status, 404);
    assert.strictEqual(exec.body.ok, false);
    assert.strictEqual(exec.body.exec, false);
    assert.match(exec.body.reason, /no runtime/);
    const today = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/today" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(today.status, 200);
    assert.strictEqual(today.body.act, false);
    assert.strictEqual(today.body.exec, false);
    assert.ok(today.body.artifacts.some((row) => /Standup/.test(row.title)));
    assert.match(today.body.deliverable, /# Today/);
    assert.match(today.body.deliverable, /Standup/);
    assert.ok(Array.isArray(today.body.chips));
    assert.ok(today.body.chips.some((row) => /follow-up email/.test(row.q)));
    const got = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/workspace?id=" + encodeURIComponent(listed.artifacts[0].id) }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(got.status, 200);
    assert.strictEqual(got.body.act, false);
    assert.strictEqual(got.body.exec, false);
    assert.match(got.body.artifact.body, /ship it/);
    c.workspace.put({
      id: "live-meeting",
      title: "Live assist",
      desk: "meeting",
      body: "# Meeting brief\n## Commitments\n- You [Friday]: I will send it Friday.\n## Open questions\n- Them: What is the launch date?",
      cue: "I'll send it Friday.",
      asked: "What is the launch date?",
      heard: "Friday / $40k",
      notes: true,
      live: {
        transcript: [
          "them: I'm Sarah Chen",
          "them: we're with Acme",
          "them: What is the launch date?",
          "you: I will send it Friday.",
        ].join("\n"),
      },
    });
    const meeting = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/meeting" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(meeting.status, 200);
    assert.strictEqual(meeting.body.act, false);
    assert.strictEqual(meeting.body.exec, false);
    assert.match(meeting.body.cue, /Friday/);
    assert.match(meeting.body.asked, /launch date/);
    assert.match(meeting.body.heard, /Friday/);
    assert.ok(Array.isArray(meeting.body.chips));
    assert.ok(meeting.body.chips.some((row) => /follow-up email/.test(row.q)));
    assert.ok(meeting.body.chips.some((row) => /write this recap in Word/.test(row.q)));
    assert.ok(!meeting.body.live);
    assert.ok(!meeting.body.artifact || !meeting.body.artifact.live);
    assert.ok(Array.isArray(meeting.body.turns));
    assert.ok(meeting.body.turns.some((row) => row.speaker === "them" && /launch date/.test(row.text)));
    assert.ok(meeting.body.turns.some((row) => row.speaker === "you" && /send it Friday/.test(row.text)));
    assert.ok(Array.isArray(meeting.body.captions));
    assert.ok(meeting.body.captions.some((row) => /Sarah Chen/.test(row.text)));
    assert.ok(!meeting.body.captions.some((row) => /launch date/.test(row.text)));
    assert.strictEqual(meeting.body.notes, true);
    const meetingPage = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/meeting" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }).on("error", reject);
    });
    assert.strictEqual(meetingPage.status, 200);
    assert.match(meetingPage.body, /meeting-brief/);
    assert.match(meetingPage.body, /meeting-asked-web/);
    assert.match(meetingPage.body, /meeting-heard-web/);
    assert.match(meetingPage.body, /meeting-chips/);
    assert.match(meetingPage.body, /meeting-filed/);
    assert.match(meetingPage.body, /Live meeting answer/);
    const mailed = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/meeting", method: "POST", headers: { "content-type": "application/json" } },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ ask: "draft a follow-up email from this meeting", act: true }));
    });
    assert.strictEqual(mailed.status, 200);
    assert.strictEqual(mailed.body.ok, true);
    assert.strictEqual(mailed.body.act, false);
    assert.strictEqual(mailed.body.exec, false);
    assert.strictEqual(mailed.body.desk, "inbox");
    assert.strictEqual(mailed.body.href, "/inbox");
    assert.ok(!mailed.body.live);
    assert.match(mailed.body.deliverable, /Hi Sarah Chen/);
    assert.match(mailed.body.cue, /not sent/);
    assert.match(c.workspace.get("live-meeting").artifact.asked, /launch date/);
    const worded = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/meeting", method: "POST", headers: { "content-type": "application/json" } },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ ask: "write this recap in Word", act: true }));
    });
    assert.strictEqual(worded.body.act, false);
    assert.strictEqual(worded.body.desk, "document");
    assert.match(worded.body.cue, /not a \.docx/);
    const taught = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/meeting", method: "POST", headers: { "content-type": "application/json" } },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ ask: "walk me through this on my screen" }));
    });
    assert.strictEqual(taught.body.ok, false);
    assert.strictEqual(taught.body.act, false);
    assert.strictEqual(taught.body.desk, "teach");
    const assisted = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/meeting", method: "POST", headers: { "content-type": "application/json" } },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ ask: "What should I say?", act: true }));
    });
    assert.strictEqual(assisted.body.ok, true);
    assert.strictEqual(assisted.body.act, false);
    assert.strictEqual(assisted.body.desk, "meeting");
    assert.ok(Array.isArray(assisted.body.chips));
    assert.ok(!assisted.body.live);
    const opened = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/workspace?id=live-meeting" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(opened.status, 200);
    assert.ok(!opened.body.artifact.live);
    assert.ok(Array.isArray(opened.body.chips));
    assert.ok(opened.body.chips.some((row) => /this file/.test(row.q)));
    const askedHost = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/ask", method: "POST", headers: { "content-type": "application/json" } },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ ask: "draft a follow-up email from this meeting", act: true }));
    });
    assert.strictEqual(askedHost.status, 200);
    assert.strictEqual(askedHost.body.ok, true);
    assert.strictEqual(askedHost.body.act, false);
    assert.strictEqual(askedHost.body.exec, false);
    assert.strictEqual(askedHost.body.desk, "inbox");
    assert.ok(!askedHost.body.live);
    assert.match(askedHost.body.deliverable, /Hi Sarah Chen/);
    c.workspace.put({
      id: "leak-1",
      desk: "document",
      title: "notes",
      body: "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nhello",
    });
    const reviewedFile = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/ask", method: "POST", headers: { "content-type": "application/json" } },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ ask: "Security review this file", id: "leak-1", act: true }));
    });
    assert.strictEqual(reviewedFile.body.act, false);
    assert.strictEqual(reviewedFile.body.desk, "security");
    assert.match(reviewedFile.body.deliverable, /AKIA\*\*\*\*/);
    assert.doesNotMatch(reviewedFile.body.deliverable, /AKIAIOSFODNN7EXAMPLE/);
    c.workspace.put({
      id: "live-teach",
      title: "Live teach",
      desk: "teach",
      body: "# Teach walkthrough\n[BOX:20,40,10,4:1 Save]\n[POINT:25,42:1 Save]",
      cue: "1 of 1 Click Save",
      rest: "Click Cancel",
    });
    const teach = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/teach" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(teach.status, 200);
    assert.strictEqual(teach.body.act, false);
    assert.strictEqual(teach.body.exec, false);
    assert.match(teach.body.deliverable, /1 Save/);
    assert.match(teach.body.cue, /Click Save/);
    assert.match(teach.body.rest, /Click Cancel/);
    assert.ok(Array.isArray(teach.body.markers));
    assert.ok(teach.body.markers.some((m) => m.kind === "box" && /Save/.test(m.label)));
    assert.deepStrictEqual(teach.body.path, []);
    const teachPage = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/teach" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }).on("error", reject);
    });
    assert.strictEqual(teachPage.status, 200);
    assert.match(teachPage.body, /teach-brief/);
    assert.match(teachPage.body, /teach-rest-web/);
    assert.match(teachPage.body, /id="teach-next"/);
    assert.match(teachPage.body, /id="teach-back"/);
    assert.match(teachPage.body, /Walk path/);
    assert.match(teachPage.body, /Draw around/);
    const form = require("../electron/netie/coworker-desks").teachAssist({
      text: "walk me through this on my screen",
      controls: [
        { name: "Cancel", controlType: "Button", rect: { x: 0, y: 0, width: 100, height: 40 } },
        { name: "Save", controlType: "Button", rect: { x: 200, y: 400, width: 100, height: 40 } },
        { name: "Email", controlType: "Edit", rect: { x: 50, y: 80, width: 200, height: 32 } },
      ],
      screen: { x: 0, y: 0, width: 1000, height: 1000 },
    });
    c.workspace.put({
      id: "live-teach",
      title: "Live teach",
      desk: "teach",
      body: form.deliverable,
      cue: form.cue,
      rest: form.rest,
      live: form.live,
    });
    const advanced = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/teach", method: "POST", headers: { "content-type": "application/json" } },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ ask: "got it, next", act: true }));
    });
    assert.strictEqual(advanced.status, 200);
    assert.strictEqual(advanced.body.act, false);
    assert.strictEqual(advanced.body.exec, false);
    assert.ok(!advanced.body.live);
    assert.ok(!advanced.body.artifact || !advanced.body.artifact.live);
    assert.match(advanced.body.cue, /Click Save or press Enter/);
    assert.strictEqual(advanced.body.advance, true);
    assert.ok(Array.isArray(advanced.body.path));
    assert.ok(advanced.body.path.some((p) => p.now && /Save/.test(p.label)));
    assert.ok(advanced.body.path.some((p) => !p.now && !p.later && /Email/.test(p.label)));
    const savedTeach = c.workspace.get("live-teach");
    const framed = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/teach", method: "POST", headers: { "content-type": "application/json" } },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ region: { leftPct: 20, topPct: 40, wPct: 10, hPct: 4 }, act: true }));
    });
    assert.strictEqual(framed.status, 200);
    assert.strictEqual(framed.body.ok, true);
    assert.strictEqual(framed.body.act, false);
    assert.strictEqual(framed.body.exec, false);
    assert.ok(!framed.body.live);
    assert.match(framed.body.cue, /Click Save/);
    assert.ok(Array.isArray(framed.body.path));
    assert.ok(framed.body.path.some((p) => p.now && /Save/.test(p.label)));
    assert.ok(framed.body.path.some((p) => /region/.test(p.label)));
    const tiny = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/teach", method: "POST", headers: { "content-type": "application/json" } },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ region: { x0: 10, y0: 10, x1: 10.1, y1: 10.1 } }));
    });
    assert.strictEqual(tiny.body.ok, false);
    assert.strictEqual(tiny.body.act, false);
    c.workspace.put({
      id: "live-teach",
      title: savedTeach.artifact.title,
      desk: "teach",
      body: savedTeach.artifact.body,
      cue: savedTeach.artifact.cue,
      rest: savedTeach.artifact.rest,
      live: savedTeach.artifact.live,
    });
    c.workspace.put({
      id: "live-security",
      title: "Security review",
      desk: "security",
      body: "# Security review\n## Findings (redacted)\n- .env: aws-access-key (AKIA****)",
      cue: "1 secret pattern(s) - do not approve",
      findings: [{ file: ".env", kind: "aws-access-key", excerpt: "AKIA****" }],
    });
    const security = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/security" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(security.status, 200);
    assert.strictEqual(security.body.act, false);
    assert.strictEqual(security.body.exec, false);
    assert.match(security.body.cue, /do not approve/);
    assert.ok(Array.isArray(security.body.findings));
    assert.ok(security.body.findings.some((row) => row.kind === "aws-access-key"));
    const securityPage = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/security" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }).on("error", reject);
    });
    assert.strictEqual(securityPage.status, 200);
    assert.match(securityPage.body, /security-brief/);
    c.workspace.put({
      id: "live-document",
      title: "Document draft",
      desk: "document",
      body: "# Document draft\n## Draft to write\nhello from the recap",
      cue: "draft only - not a .docx",
      preview: "hello from the recap",
    });
    c.workspace.put({
      id: "live-inbox",
      title: "Draft reply",
      desk: "inbox",
      body: "# Draft (not sent)\n## Draft\nHi Sarah Chen,\n\nWanted to confirm Friday.",
      cue: "not sent - parked P-05",
      preview: "Hi Sarah Chen,\n\nWanted to confirm Friday.",
    });
    const document = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/document" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(document.status, 200);
    assert.strictEqual(document.body.act, false);
    assert.strictEqual(document.body.exec, false);
    assert.match(document.body.cue, /not a \.docx/);
    assert.match(document.body.preview, /hello from the recap/);
    const inbox = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/inbox" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(inbox.status, 200);
    assert.match(inbox.body.cue, /not sent/);
    assert.match(inbox.body.preview, /Sarah Chen/);
    c.workspace.put({
      id: "brief-notes",
      desk: "document",
      title: "launch notes",
      body: "Launch is Friday for $40k.",
    });
    const fromNotes = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/ask", method: "POST", headers: { "content-type": "application/json" } },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ ask: "What should I say?", id: "brief-notes", act: true }));
    });
    assert.strictEqual(fromNotes.status, 200);
    assert.strictEqual(fromNotes.body.act, false);
    assert.strictEqual(fromNotes.body.desk, "meeting");
    assert.strictEqual(fromNotes.body.notes, true);
    assert.match(fromNotes.body.also, /\$40k|Sarah|Acme|confirm/);
    assert.match(fromNotes.body.avoid, /Don't send/);
    const home = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/home" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(home.status, 200);
    assert.strictEqual(home.body.act, false);
    assert.strictEqual(home.body.exec, false);
    assert.match(home.body.rooms.teach.cue, /Click Save/);
    assert.strictEqual(home.body.rooms.teach.advance, true);
    assert.ok(Array.isArray(home.body.rooms.teach.path));
    assert.ok(home.body.rooms.teach.path.some((p) => p.now && /Save/.test(p.label)));
    assert.match(home.body.rooms.meeting.cue, /Friday/);
    assert.match(home.body.rooms.meeting.asked, /launch date/);
    assert.ok(Array.isArray(home.body.rooms.meeting.turns));
    assert.ok(home.body.rooms.meeting.turns.some((row) => /Sarah Chen/.test(row.text)));
    assert.strictEqual(home.body.rooms.meeting.notes, true);
    assert.match(home.body.rooms.meeting.also, /\$40k|Sarah|Acme|confirm/);
    assert.match(home.body.rooms.meeting.avoid, /Don't send/);
    assert.match(home.body.rooms.today.cue, /send it Friday/);
    assert.match(home.body.rooms.security.cue, /do not approve/);
    assert.match(home.body.rooms.today.deliverable, /# Today/);
    assert.ok(Array.isArray(home.body.rooms.today.plate));
    assert.ok(home.body.rooms.today.plate.some((line) => /Friday/.test(line)));
    assert.match(home.body.rooms.document.cue, /not a \.docx/);
    assert.match(home.body.rooms.document.preview, /hello from the recap/);
    assert.match(home.body.rooms.inbox.cue, /not sent/);
    assert.match(home.body.rooms.inbox.preview, /Sarah Chen/);
    assert.ok(home.body.rooms.security.findings.some((row) => row.kind === "aws-access-key"));
    assert.ok(home.body.session);
    assert.strictEqual(home.body.session.exec, false);
    assert.strictEqual(home.body.session.empty, false);
    assert.match(home.body.session.asked, /launch date/);
    assert.match(home.body.session.heard, /Friday/);
    assert.ok(home.body.session.files.some((row) => row.id === "live-inbox" && row.href === "/workspace?id=live-inbox"));
    assert.ok(home.body.session.files.some((row) => row.id === "live-document" && row.href === "/workspace?id=live-document"));
    const listedWs = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/workspace" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(listedWs.body.exec, false);
    assert.ok(listedWs.body.session);
    assert.strictEqual(listedWs.body.session.exec, false);
    assert.ok(listedWs.body.session.files.some((row) => row.id === "live-meeting" && row.href === "/workspace?id=live-meeting"));
    const homePage = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }).on("error", reject);
    });
    assert.strictEqual(homePage.status, 200);
    assert.match(homePage.body, /id="rooms"/);
    assert.match(homePage.body, /id="stage"/);
    assert.match(homePage.body, /id="session"/);
    assert.match(homePage.body, /id="session-files"/);
    assert.match(homePage.body, /id="session-md"/);
    assert.match(homePage.body, /id="session-copy"/);
    assert.match(homePage.body, /id="session-download"/);
    const miss = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/workspace?id=nope" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(miss.status, 404);
    assert.strictEqual(miss.body.ok, false);
    await c.close();
  });

  await test("loopback document.docx is a generated package and never acts", async () => {
    const { documentAssist } = require("../electron/netie/coworker-desks");
    const { zipRead } = require("../electron/netie/word-coworker");
    const c = createCoordinator({ clock: () => 9 });
    const on = await c.listen({ host: "127.0.0.1", port: 0 });
    const port = on.address.port;
    const miss = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/document.docx" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      }).on("error", reject);
    });
    assert.strictEqual(miss.status, 404);
    const missJson = JSON.parse(miss.body.toString("utf8"));
    assert.strictEqual(missJson.act, false);
    assert.strictEqual(missJson.exec, false);
    const draft = documentAssist({ text: "write hello in Word" });
    c.workspace.put({
      id: "live-document",
      desk: "document",
      title: draft.title,
      body: draft.deliverable,
      cue: draft.cue,
      preview: draft.preview,
    });
    const opened = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/workspace?id=live-document" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(opened.status, 200);
    assert.strictEqual(opened.body.act, false);
    assert.strictEqual(opened.body.exec, false);
    assert.strictEqual(opened.body.artifact.desk, "document");
    assert.match(opened.body.artifact.preview, /hello in Word/i);
    const hit = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/document.docx" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            type: String(res.headers["content-type"] || ""),
            body: Buffer.concat(chunks),
          })
        );
      }).on("error", reject);
    });
    assert.strictEqual(hit.status, 200);
    assert.match(hit.type, /wordprocessingml/);
    assert.strictEqual(hit.body.subarray(0, 2).toString("binary"), "PK");
    const pkg = zipRead(hit.body);
    assert.ok(pkg.ok);
    const xml = pkg.entries.find((e) => e.name === "word/document.xml").data.toString("utf8");
    assert.match(xml, /hello in Word/i);
    await c.close();
  });

  await test("loopback inbox.eml is a generated draft and never sends", async () => {
    const { inboxAssist } = require("../electron/netie/coworker-desks");
    const c = createCoordinator({ clock: () => 11 });
    const on = await c.listen({ host: "127.0.0.1", port: 0 });
    const port = on.address.port;
    const miss = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/inbox.eml" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      }).on("error", reject);
    });
    assert.strictEqual(miss.status, 404);
    const missJson = JSON.parse(miss.body.toString("utf8"));
    assert.strictEqual(missJson.act, false);
    assert.strictEqual(missJson.send, false);
    const draft = inboxAssist({ text: "draft a follow-up email" });
    c.workspace.put({
      id: "live-inbox",
      desk: "inbox",
      title: draft.title,
      body: draft.deliverable,
      cue: draft.cue,
      preview: draft.preview,
    });
    const opened = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/workspace?id=live-inbox" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(opened.status, 200);
    assert.strictEqual(opened.body.act, false);
    assert.strictEqual(opened.body.exec, false);
    assert.strictEqual(opened.body.artifact.desk, "inbox");
    const hit = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/inbox.eml" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            type: String(res.headers["content-type"] || ""),
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }).on("error", reject);
    });
    assert.strictEqual(hit.status, 200);
    assert.match(hit.type, /rfc822/);
    assert.match(hit.body, /X-Pointer-Send: never/);
    assert.match(hit.body, /not sent/i);
    await c.close();
  });

  await test("loopback security.md is a generated review and never approval", async () => {
    const { securityAssist } = require("../electron/netie/coworker-desks");
    const c = createCoordinator({ clock: () => 13 });
    const on = await c.listen({ host: "127.0.0.1", port: 0 });
    const port = on.address.port;
    const miss = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/security.md" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      }).on("error", reject);
    });
    assert.strictEqual(miss.status, 404);
    const missJson = JSON.parse(miss.body.toString("utf8"));
    assert.strictEqual(missJson.act, false);
    assert.strictEqual(missJson.exec, false);
    assert.strictEqual(missJson.approve, false);
    const review = securityAssist({
      text: "security review this session",
      files: [{ name: ".env", body: "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n" }],
    });
    c.workspace.put({
      id: "live-security",
      desk: "security",
      title: review.title,
      body: review.deliverable,
      cue: review.cue,
      preview: review.preview,
      findings: review.findings,
    });
    const opened = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/workspace?id=live-security" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(opened.status, 200);
    assert.strictEqual(opened.body.act, false);
    assert.strictEqual(opened.body.exec, false);
    assert.strictEqual(opened.body.artifact.desk, "security");
    const hit = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/security.md" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            type: String(res.headers["content-type"] || ""),
            disp: String(res.headers["content-disposition"] || ""),
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }).on("error", reject);
    });
    assert.strictEqual(hit.status, 200);
    assert.match(hit.type, /markdown/);
    assert.match(hit.disp, /pointer-review\.md/);
    assert.match(hit.body, /> approve: never/);
    assert.match(hit.body, /aws-access-key/);
    assert.doesNotMatch(hit.body, /AKIAIOSFODNN7EXAMPLE/);
    await c.close();
  });

  await test("loopback session.zip is a packet of finished files and never execs", async () => {
    const {
      documentAssist,
      inboxAssist,
      securityAssist,
    } = require("../electron/netie/coworker-desks");
    const { zipRead } = require("../electron/netie/word-coworker");
    const c = createCoordinator({ clock: () => 17 });
    const on = await c.listen({ host: "127.0.0.1", port: 0 });
    const port = on.address.port;
    const miss = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/session.zip" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      }).on("error", reject);
    });
    assert.strictEqual(miss.status, 404);
    const missJson = JSON.parse(miss.body.toString("utf8"));
    assert.strictEqual(missJson.act, false);
    assert.strictEqual(missJson.exec, false);
    assert.strictEqual(missJson.send, false);
    assert.strictEqual(missJson.approve, false);
    c.workspace.put({
      id: "live-meeting",
      desk: "meeting",
      title: "Live meeting",
      body: "# Meeting brief\nThey asked: What is the launch date?",
      cue: "We'll ship Friday.",
      asked: "What is the launch date?",
    });
    c.workspace.put({
      id: "live-teach",
      desk: "teach",
      title: "Teach walk",
      body: "# Teach walk\nType in Email then Tab",
      cue: "Type in Email then Tab",
    });
    const draft = documentAssist({ text: "write hello in Word" });
    c.workspace.put({
      id: "live-document",
      desk: "document",
      title: draft.title,
      body: draft.deliverable,
      cue: draft.cue,
      preview: draft.preview,
    });
    const mail = inboxAssist({
      text: "draft a follow-up email",
      transcript: "system: Hi this is Sarah Chen from acme.\nsystem: Can you send the deck by Friday for $40k?\nmic: I will send it Friday.",
    });
    c.workspace.put({
      id: "live-inbox",
      desk: "inbox",
      title: mail.title,
      body: mail.deliverable,
      cue: mail.cue,
      preview: mail.preview,
    });
    const review = securityAssist({
      text: "security review this session",
      files: [{ name: "notes.md", body: "Launch is Friday for $40k." }],
    });
    c.workspace.put({
      id: "live-security",
      desk: "security",
      title: review.title,
      body: review.deliverable,
      cue: review.cue,
      preview: review.preview,
      findings: review.findings,
    });
    const hit = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/session.zip" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            type: String(res.headers["content-type"] || ""),
            disp: String(res.headers["content-disposition"] || ""),
            body: Buffer.concat(chunks),
          })
        );
      }).on("error", reject);
    });
    assert.strictEqual(hit.status, 200);
    assert.match(hit.type, /zip/);
    assert.match(hit.disp, /pointer-session\.zip/);
    const zip = zipRead(hit.body);
    assert.strictEqual(zip.ok, true);
    const names = zip.entries.map((row) => row.name);
    assert.ok(names.includes("pointer-session.md"));
    assert.ok(names.includes("meeting.md"));
    assert.ok(names.includes("teach.md"));
    assert.ok(names.includes("pointer-draft.eml"));
    assert.ok(names.includes("pointer-review.md"));
    assert.ok(names.includes("pointer-draft.docx"));
    assert.ok(names.every((name) => /^[A-Za-z0-9._-]+$/.test(name)));
    const sessionMd = zip.entries.find((row) => row.name === "pointer-session.md").data.toString("utf8");
    assert.match(sessionMd, /act: never/);
    assert.match(sessionMd, /exec: parked/);
    const eml = zip.entries.find((row) => row.name === "pointer-draft.eml").data.toString("utf8");
    assert.match(eml, /X-Pointer-Send: never/);
    const report = zip.entries.find((row) => row.name === "pointer-review.md").data.toString("utf8");
    assert.match(report, /approve: never/);
    await c.close();
  });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
