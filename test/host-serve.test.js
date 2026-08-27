"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  PAGES,
  pageFor,
  publicSnapshot,
  handlePublicRequest,
  createPublicFetch,
} = require("../electron/netie/host-serve");
const { createCoordinator } = require("../electron/netie/coordinator");

const HOST = path.join(__dirname, "..", "host");

let pass = 0;
const fails = [];
function test(name, fn) {
  const run = Promise.resolve().then(fn);
  return run
    .then(() => {
      pass += 1;
      console.log("PASS " + name);
    })
    .catch((err) => {
      fails.push(name);
      console.log("FAIL " + name + " -- " + err.message);
    });
}

function readAsset(file) {
  const abs = path.resolve(HOST, file);
  if (!abs.startsWith(path.resolve(HOST) + path.sep) && abs !== path.resolve(HOST)) {
    return null;
  }
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs);
}

(async () => {
  await test("public pages match the coordinator map", () => {
    const c = createCoordinator();
    assert.deepStrictEqual(c.PAGES, PAGES);
    assert.strictEqual(pageFor("/today/"), "today");
    assert.strictEqual(pageFor("/meeting"), "meeting");
    assert.strictEqual(pageFor("/teach"), "teach");
    assert.strictEqual(pageFor("/security"), "security");
    assert.strictEqual(pageFor("/document"), "document");
    assert.strictEqual(pageFor("/inbox"), "inbox");
    assert.strictEqual(pageFor("/secret"), null);
  });

  await test("public /api/state is a local-first shell with empty lanes", () => {
    const routed = handlePublicRequest({ method: "GET", pathname: "/api/state" });
    assert.strictEqual(routed.status, 200);
    const body = JSON.parse(routed.body);
    assert.strictEqual(body.localFirst, true);
    assert.strictEqual(body.coordinator, "http://127.0.0.1:18010");
    assert.strictEqual(body.lanes["pointer-act"], null);
    assert.strictEqual(body.lanes.cortex, null);
    assert.deepStrictEqual(body.drafts, []);
    assert.ok(/laptop/.test(body.reason));
    assert.strictEqual(body.exec, false);
    const snap = publicSnapshot();
    snap.lanes["pointer-act"] = { owner: "should-not-leak" };
    const again = JSON.parse(handlePublicRequest({ method: "GET", pathname: "/api/state" }).body);
    assert.strictEqual(again.lanes["pointer-act"], null);
  });

  await test("public /mcp is refused", () => {
    const a = handlePublicRequest({ method: "POST", pathname: "/mcp" });
    assert.strictEqual(a.status, 404);
    assert.match(a.body, /127\.0\.0\.1/);
    const b = handlePublicRequest({ method: "GET", pathname: "/mcp/tools" });
    assert.strictEqual(b.status, 404);
  });

  await test("public workspace is a catalog with no runtime", async () => {
    const routed = handlePublicRequest({ method: "GET", pathname: "/api/workspace" });
    assert.strictEqual(routed.status, 200);
    const body = JSON.parse(routed.body);
    assert.strictEqual(body.localFirst, true);
    assert.strictEqual(body.exec, false);
    assert.deepStrictEqual(body.artifacts, []);
    assert.ok(body.desks.some((d) => d.id === "teach"));
    const exec = handlePublicRequest({ method: "POST", pathname: "/api/workspace/exec" });
    assert.strictEqual(exec.status, 404);
    const write = handlePublicRequest({ method: "POST", pathname: "/api/workspace" });
    assert.strictEqual(write.status, 404);
    const teachPost = handlePublicRequest({ method: "POST", pathname: "/api/teach" });
    assert.strictEqual(teachPost.status, 404);
    const meetingPost = handlePublicRequest({ method: "POST", pathname: "/api/meeting" });
    assert.strictEqual(meetingPost.status, 404);
    const askPost = handlePublicRequest({ method: "POST", pathname: "/api/ask" });
    assert.strictEqual(askPost.status, 404);
    const fetch = createPublicFetch(readAsset);
    const html = await fetch(new Request("https://host.netie.ai/workspace"));
    assert.strictEqual(html.status, 200);
    const page = await html.text();
    assert.match(page, /no runtime/i);
    assert.match(page, /id="desks"/);
    const app = fs.readFileSync(path.join(HOST, "app.js"), "utf8");
    assert.match(app, /paintDesks/);
    assert.match(app, /textContent/);
    assert.doesNotMatch(app, /innerHTML/);
    assert.match(app, /pollWhileLive/);
    assert.match(app, /ws\.exec/);
    assert.match(app, /openArtifact/);
    assert.match(app, /paintLanes/);
    assert.match(app, /artifact-filter/);
    assert.match(page, /id="artifact-filter"/);
    const leak = handlePublicRequest({
      method: "GET",
      pathname: "/api/workspace",
      search: "?id=brief-1",
    });
    assert.strictEqual(leak.status, 404);
    assert.strictEqual(JSON.parse(leak.body).exec, false);
    assert.match(JSON.parse(leak.body).reason, /laptop/);
    const lanes = await fetch(new Request("https://host.netie.ai/lanes"));
    assert.match(await lanes.text(), /id="lanes"/);
    const skills = await fetch(new Request("https://host.netie.ai/skills"));
    assert.match(await skills.text(), /id="hits"/);
    assert.match(page, /id="artifact-body"/);
    assert.match(page, /id="artifact-chips"/);
    assert.match(page, /id="session"/);
    assert.match(page, /id="session-files"/);
    assert.match(page, /id="session-md"/);
    assert.match(page, /id="session-copy"/);
    assert.match(page, /id="session-download"/);
    assert.match(page, /id="artifact-copy"/);
    assert.match(page, /id="artifact-download"/);
  });

  await test("public fetch serves /today and style.css from host/", async () => {
    const fetch = createPublicFetch(readAsset);
    const home = await fetch(new Request("https://host.netie.ai/"));
    assert.strictEqual(home.status, 200);
    const homeText = await home.text();
    assert.match(homeText, /Pointer coworker/);
    assert.match(homeText, /id="desks"/);
    assert.match(homeText, /id="rooms"/);
    assert.match(homeText, /id="session"/);
    assert.match(homeText, /id="session-files"/);
    assert.match(homeText, /id="session-md"/);
    assert.match(homeText, /id="session-copy"/);
    assert.match(homeText, /id="session-download"/);
    assert.match(homeText, /id="brief"/);
    assert.doesNotMatch(homeText, /id="state"/);
    const html = await fetch(new Request("https://host.netie.ai/today"));
    assert.strictEqual(html.status, 200);
    const text = await html.text();
    assert.match(text, /host\.netie\.ai \/today/);
    assert.match(text, /id="brief"/);
    assert.match(text, /id="today-cue-web"/);
    assert.match(text, /id="today-chips"/);
    assert.match(text, /id="events"/);
    const todayApi = handlePublicRequest({ method: "GET", pathname: "/api/today" });
    assert.strictEqual(todayApi.status, 200);
    const todayBody = JSON.parse(todayApi.body);
    assert.strictEqual(todayBody.localFirst, true);
    assert.strictEqual(todayBody.act, false);
    assert.strictEqual(todayBody.exec, false);
    assert.deepStrictEqual(todayBody.events, []);
    assert.deepStrictEqual(todayBody.chips, []);
    assert.match(todayBody.deliverable, /nothing yet/);
    assert.match(todayBody.deliverable, /P-06/);
    const app = fs.readFileSync(path.join(HOST, "app.js"), "utf8");
    assert.match(app, /paintBrief/);
    assert.match(app, /\/api\/today/);
    assert.match(app, /\/api\/meeting/);
    assert.match(app, /\/api\/teach/);
    assert.match(app, /\/api\/security/);
    assert.match(app, /\/api\/document/);
    assert.match(app, /\/api\/inbox/);
    assert.match(app, /\/api\/home/);
    assert.match(app, /paintRooms/);
    assert.match(app, /paintSession/);
    assert.match(app, /paintChrome/);
    assert.match(app, /live-cue-bar/);
    assert.match(app, /host-ask/);
    assert.match(app, /postAsk/);
    assert.match(app, /\/api\/ask/);
    assert.match(app, /paintTodayChips/);
    assert.match(app, /paintDeskChips/);
    assert.match(app, /lastOpenId/);
    assert.match(app, /host-open/);
    assert.match(app, /workspaceQueryId/);
    assert.match(app, /replaceState/);
    assert.match(app, /sessionLinkHref/);
    assert.match(app, /\/workspace\?id=/);
    const paint = app.slice(app.indexOf("function paintSession"), app.indexOf("const roomsPage"));
    assert.match(paint, /session-md/);
    assert.match(paint, /session-copy/);
    assert.match(paint, /session-download/);
    assert.match(paint, /textContent/);
    assert.match(app, /writeText/);
    assert.match(app, /createObjectURL/);
    assert.match(app, /pointer-session.md/);
    assert.match(app, /briefFileName/);
    assert.match(app, /artifact-copy/);
    assert.doesNotMatch(paint, /innerHTML/);
    assert.match(app, /Live session stays on the laptop/);
    assert.match(app, /paintTeachMap/);
    assert.match(app, /teach-map/);
    assert.match(app, /teach-map-cue/);
    assert.match(app, /teach-map-mark/);
    assert.match(app, /teach-map-rail/);
    assert.match(app, /teach-map-box then/);
    const cssText = fs.readFileSync(path.join(HOST, "style.css"), "utf8");
    assert.match(cssText, /56vh/);
    assert.match(cssText, /teach-map-cue/);
    assert.match(cssText, /teach-map-mark/);
    assert.match(cssText, /teach-map-rail/);
    assert.match(app, /They asked/);
    assert.match(app, /Heard:/);
    assert.match(app, /-heard-web/);
    assert.match(app, /Plate:/);
    assert.match(app, /Then:/);
    assert.match(app, /-rest-web/);
    assert.match(app, /paintMeetingChips/);
    assert.match(app, /postMeeting/);
    assert.match(app, /meeting-filed/);
    assert.match(app, /paintTalk/);
    assert.match(app, /meeting-talk/);
    assert.doesNotMatch(app, /innerHTML/);
    const meeting = await fetch(new Request("https://host.netie.ai/meeting"));
    assert.strictEqual(meeting.status, 200);
    const meetingText = await meeting.text();
    assert.match(meetingText, /id="meeting-brief"/);
    assert.match(meetingText, /id="meeting-asked-web"/);
    assert.match(meetingText, /id="meeting-heard-web"/);
    assert.match(meetingText, /id="meeting-chips"/);
    assert.match(meetingText, /id="meeting-filed"/);
    assert.match(meetingText, /id="brief-copy"/);
    assert.match(meetingText, /id="cue-copy"/);
    assert.match(meetingText, /id="brief-download"/);
    const meetingApi = handlePublicRequest({ method: "GET", pathname: "/api/meeting" });
    assert.strictEqual(JSON.parse(meetingApi.body).localFirst, true);
    assert.strictEqual(JSON.parse(meetingApi.body).exec, false);
    assert.strictEqual(JSON.parse(meetingApi.body).cue, "");
    assert.strictEqual(JSON.parse(meetingApi.body).asked, "");
    assert.strictEqual(JSON.parse(meetingApi.body).heard, "");
    assert.deepStrictEqual(JSON.parse(meetingApi.body).chips, []);
    assert.deepStrictEqual(JSON.parse(meetingApi.body).turns, []);
    const teach = await fetch(new Request("https://host.netie.ai/teach"));
    assert.strictEqual(teach.status, 200);
    const teachText = await teach.text();
    assert.match(teachText, /id="teach-brief"/);
    assert.match(teachText, /id="teach-cue-web"/);
    assert.match(teachText, /id="teach-rest-web"/);
    assert.match(teachText, /id="brief-copy"/);
    assert.match(teachText, /id="brief-download"/);
    assert.match(teachText, /id="teach-next"/);
    assert.match(teachText, /id="teach-back"/);
    assert.match(teachText, /Walk path/);
    const teachApi = handlePublicRequest({ method: "GET", pathname: "/api/teach" });
    assert.strictEqual(JSON.parse(teachApi.body).localFirst, true);
    assert.strictEqual(JSON.parse(teachApi.body).exec, false);
    assert.strictEqual(JSON.parse(teachApi.body).desk, "teach");
    assert.strictEqual(JSON.parse(teachApi.body).rest, "");
    assert.deepStrictEqual(JSON.parse(teachApi.body).markers, []);
    assert.deepStrictEqual(JSON.parse(teachApi.body).path, []);
    const security = await fetch(new Request("https://host.netie.ai/security"));
    assert.strictEqual(security.status, 200);
    const securityText = await security.text();
    assert.match(securityText, /id="security-brief"/);
    assert.match(securityText, /id="security-chips"/);
    assert.match(securityText, /id="security-cue-web"/);
    const securityApi = handlePublicRequest({ method: "GET", pathname: "/api/security" });
    assert.strictEqual(JSON.parse(securityApi.body).localFirst, true);
    assert.strictEqual(JSON.parse(securityApi.body).exec, false);
    assert.strictEqual(JSON.parse(securityApi.body).desk, "security");
    assert.strictEqual(JSON.parse(securityApi.body).cue, "");
    const homeApi = handlePublicRequest({ method: "GET", pathname: "/api/home" });
    const homeBody = JSON.parse(homeApi.body);
    assert.strictEqual(homeBody.localFirst, true);
    assert.strictEqual(homeBody.exec, false);
    assert.strictEqual(homeBody.rooms.security.cue, "");
    assert.strictEqual(homeBody.rooms.teach.desk, "teach");
    assert.strictEqual(homeBody.rooms.teach.advance, false);
    assert.strictEqual(homeBody.rooms.inbox.desk, "inbox");
    assert.strictEqual(homeBody.rooms.document.desk, "document");
    assert.ok(homeBody.session);
    assert.strictEqual(homeBody.session.empty, true);
    assert.strictEqual(homeBody.session.exec, false);
    assert.deepStrictEqual(homeBody.session.files, []);
    const documentPage = await fetch(new Request("https://host.netie.ai/document"));
    assert.strictEqual(documentPage.status, 200);
    const documentHtml = await documentPage.text();
    assert.match(documentHtml, /id="document-brief"/);
    assert.match(documentHtml, /id="document-chips"/);
    assert.match(documentHtml, /id="brief-copy"/);
    const inboxPage = await fetch(new Request("https://host.netie.ai/inbox"));
    assert.strictEqual(inboxPage.status, 200);
    const inboxHtml = await inboxPage.text();
    assert.match(inboxHtml, /id="inbox-brief"/);
    assert.match(inboxHtml, /id="inbox-chips"/);
    assert.match(inboxHtml, /id="inbox-heard-web"/);
    assert.match(inboxHtml, /id="brief-copy"/);
    const documentApi = handlePublicRequest({ method: "GET", pathname: "/api/document" });
    assert.strictEqual(JSON.parse(documentApi.body).localFirst, true);
    assert.strictEqual(JSON.parse(documentApi.body).exec, false);
    const inboxApi = handlePublicRequest({ method: "GET", pathname: "/api/inbox" });
    assert.strictEqual(JSON.parse(inboxApi.body).cue, "");
    const css = await fetch(new Request("https://host.netie.ai/style.css"));
    assert.strictEqual(css.status, 200);
    assert.match(css.headers.get("content-type"), /text\/css/);
  });

  await test("public fetch does not traverse host/", async () => {
    const fetch = createPublicFetch(readAsset);
    const res = await fetch(new Request("https://host.netie.ai/../package.json"));
    assert.strictEqual(res.status, 404);
    const mcp = await fetch(new Request("https://host.netie.ai/mcp", { method: "POST", body: "{}" }));
    assert.strictEqual(mcp.status, 404);
    const body = JSON.parse(await (await fetch(new Request("https://host.netie.ai/api/state"))).text());
    assert.strictEqual(body.localFirst, true);
  });

  await test("loopback /api/state stays live and is not the public shell", async () => {
    const c = createCoordinator();
    assert.strictEqual(c.claim("pointer-act", { owner: "pointer-hud", goal: "write hello" }).ok, true);
    const on = await c.listen({ host: "127.0.0.1", port: 0 });
    const port = on.address.port;
    const http = require("http");
    const st = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/state" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
      }).on("error", reject);
    });
    assert.ok(!st.localFirst);
    assert.strictEqual(st.lanes["pointer-act"].owner, "pointer-hud");
    await c.close();
  });

  await test("Worker entry uses the public router and does not load MCP", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "workers", "netie-host.js"), "utf8");
    assert.match(src, /createPublicFetch/);
    assert.doesNotMatch(src, /createCoordinator|createMcpAbi|mcp-abi/);
    const wrangler = fs.readFileSync(path.join(__dirname, "..", "wrangler.jsonc"), "utf8");
    assert.match(wrangler, /"directory": "\.\/host"/);
    assert.match(wrangler, /"main": "workers\/netie-host.js"/);
    assert.match(wrangler, /run_worker_first/);
    const app = fs.readFileSync(path.join(HOST, "app.js"), "utf8");
    assert.match(app, /localFirst/);
    assert.match(app, /paintDesks/);
  });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
