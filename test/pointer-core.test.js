"use strict";
/**
 * Persistent Rust pointer-core client + home (DR-0006).
 * Run: node test/pointer-core.test.js
 */
const assert = require("assert");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { pointerHome, ensurePointerHome } = require("../electron/netie/settings");
const {
  corePort,
  binaryPath,
  publicCore,
  sendOp,
  health,
  DEFAULT_PORT,
} = require("../electron/netie/pointer-core");
const { InputDriver } = require("../electron/netie/driver");

let pass = 0;
const fails = [];
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass += 1;
      console.log("PASS " + name);
    })
    .catch((err) => {
      fails.push(name);
      console.log("FAIL " + name + " -- " + err.message);
    });
}

(async () => {
  await test("pointerHome is ~/.pointer unless POINTER_HOME is set", () => {
    const prev = process.env.POINTER_HOME;
    delete process.env.POINTER_HOME;
    assert.strictEqual(pointerHome({}), path.join(os.homedir(), ".pointer"));
    const forced = path.join(os.tmpdir(), "pointer-home-test");
    assert.strictEqual(pointerHome({ POINTER_HOME: forced }), path.resolve(forced));
    const made = ensurePointerHome({ POINTER_HOME: forced });
    assert.strictEqual(made, path.resolve(forced));
    assert.ok(fs.existsSync(made));
    if (prev == null) delete process.env.POINTER_HOME;
    else process.env.POINTER_HOME = prev;
  });

  await test("publicCore is none until rust health answers", () => {
    const none = publicCore({ env: { POINTER_HOME: "/tmp/p", POINTER_CORE_PORT: "18011" } });
    assert.strictEqual(none.ok, false);
    assert.strictEqual(none.engine, "none");
    assert.strictEqual(none.persistent, true);
    assert.strictEqual(none.bind, "127.0.0.1:18011");
    const live = publicCore({
      live: { ok: true, engine: "rust" },
      home: "/tmp/p",
      port: 18011,
    });
    assert.strictEqual(live.ok, true);
    assert.strictEqual(live.engine, "rust");
    assert.ok(live.api.includes("/health"));
  });

  await test("binaryPath points at native/pointer-core release", () => {
    assert.ok(binaryPath().includes(path.join("native", "pointer-core", "target", "release")));
    assert.strictEqual(corePort({}), DEFAULT_PORT);
    assert.strictEqual(corePort({ POINTER_CORE_PORT: "19001" }), 19001);
  });

  await test("sendOp talks JSON to a standing loopback core", async () => {
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
      });
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/health") {
          res.end(JSON.stringify({ ok: true, engine: "rust", persistent: true }));
          return;
        }
        const body = raw ? JSON.parse(raw) : {};
        res.end(JSON.stringify({ ok: true, engine: "rust", op: body.op, x: body.x, y: body.y }));
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    const h = await health({ port });
    assert.strictEqual(h.engine, "rust");
    const click = await sendOp({ op: "click", x: 40, y: 50 }, { port });
    assert.strictEqual(click.ok, true);
    assert.strictEqual(click.op, "click");
    assert.strictEqual(click.x, 40);
    server.close();
  });

  await test("driver prefers rust coreSend for click and skips PowerShell", async () => {
    let spawned = 0;
    let rustOps = 0;
    const d = new InputDriver({
      spawnImpl: () => {
        spawned += 1;
        throw new Error("must not spawn powershell");
      },
      coreSend: async (cmd) => {
        rustOps += 1;
        return { ok: true, engine: "rust", op: cmd.op, x: cmd.x, y: cmd.y };
      },
    });
    const r = await d.clickAt(10, 20);
    assert.strictEqual(r.op, "click");
    assert.strictEqual(rustOps, 1);
    assert.strictEqual(spawned, 0);
    d.dispose();
  });

  await test("Cargo.toml names pointer-core", () => {
    const toml = fs.readFileSync(path.join(__dirname, "..", "native", "pointer-core", "Cargo.toml"), "utf8");
    assert.match(toml, /name = "pointer-core"/);
    const src = fs.readFileSync(path.join(__dirname, "..", "native", "pointer-core", "src", "main.rs"), "utf8");
    assert.match(src, /127\.0\.0\.1/);
    assert.match(src, /engine/);
    assert.match(src, /persistent/);
  });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
