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
    assert.strictEqual(c.pageFor("/secret"), null);
  });

  await test("loopback HTTP serves /today and refuses 0.0.0.0", async () => {
    const mcp = createMcpAbi();
    const c = createCoordinator({
      mcp,
      computerStatus: () => ({ ok: true, detectable: true, captureVisible: true }),
    });
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
    const comp = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/computer" }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
      }).on("error", reject);
    });
    assert.strictEqual(comp.ok, true);
    assert.strictEqual(comp.detectable, true);

    const post = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/computer", method: "POST" },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve({
            status: res.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ actions: [{ type: "observe" }] }));
    });
    assert.strictEqual(post.status, 200);
    assert.ok(post.body.error || post.body.result);
    await c.close();
  });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
