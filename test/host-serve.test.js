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
    assert.strictEqual(handlePublicRequest({ method: "POST", pathname: "/api/scribe" }).status, 404);
    assert.strictEqual(handlePublicRequest({ method: "POST", pathname: "/api/meeting" }).status, 404);
    assert.strictEqual(handlePublicRequest({ method: "GET", pathname: "/api/computer" }).status, 404);
    assert.strictEqual(handlePublicRequest({ method: "GET", pathname: "/api/observe" }).status, 404);
  });

  await test("public fetch serves /today and style.css from host/", async () => {
    const fetch = createPublicFetch(readAsset);
    const html = await fetch(new Request("https://host.netie.ai/today"));
    assert.strictEqual(html.status, 200);
    const text = await html.text();
    assert.match(text, /host\.netie\.ai \/today/);
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
    const scribe = await fetch(new Request("https://host.netie.ai/api/scribe", { method: "POST", body: "{}" }));
    assert.strictEqual(scribe.status, 404);
    const meeting = await fetch(new Request("https://host.netie.ai/api/meeting", { method: "POST", body: "{}" }));
    assert.strictEqual(meeting.status, 404);
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
  });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
