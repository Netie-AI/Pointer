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
      body: "# Meeting brief\n- ship it",
      cue: "I will send it Friday.",
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
    const meetingPage = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/meeting" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }).on("error", reject);
    });
    assert.strictEqual(meetingPage.status, 200);
    assert.match(meetingPage.body, /meeting-brief/);
    c.workspace.put({
      id: "live-teach",
      title: "Live teach",
      desk: "teach",
      body: "# Teach walkthrough\n[POINT:25,42:1 Save]",
      cue: "1 Save",
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
    assert.match(teach.body.cue, /1 Save/);
    const teachPage = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/teach" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }).on("error", reject);
    });
    assert.strictEqual(teachPage.status, 200);
    assert.match(teachPage.body, /teach-brief/);
    c.workspace.put({
      id: "live-security",
      title: "Security review",
      desk: "security",
      body: "# Security review\n- redacted",
      cue: "1 secret pattern(s) - do not approve",
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
      body: "# Document draft\nhello",
      cue: "draft only - not a .docx",
    });
    c.workspace.put({
      id: "live-inbox",
      title: "Draft reply",
      desk: "inbox",
      body: "# Draft (not sent)\nhello",
      cue: "not sent - parked P-05",
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
    const inbox = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/inbox" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      }).on("error", reject);
    });
    assert.strictEqual(inbox.status, 200);
    assert.match(inbox.body.cue, /not sent/);
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
    assert.match(home.body.rooms.teach.cue, /1 Save/);
    assert.match(home.body.rooms.meeting.cue, /Friday/);
    assert.match(home.body.rooms.security.cue, /do not approve/);
    assert.match(home.body.rooms.today.deliverable, /# Today/);
    assert.match(home.body.rooms.document.cue, /not a \.docx/);
    assert.match(home.body.rooms.inbox.cue, /not sent/);
    const homePage = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }).on("error", reject);
    });
    assert.strictEqual(homePage.status, 200);
    assert.match(homePage.body, /id="rooms"/);
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

  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
