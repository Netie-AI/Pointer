"use strict";
/**
 * Client for the persistent Rust pointer-core (DR-0006).
 *
 * Loopback only. Missing binary is engine:none, not a crash. Electron prefers
 * this for click/move/wheel; PowerShell remains the fallback.
 */

const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pointerHome } = require("./settings");

const DEFAULT_PORT = 18011;
const ROOT = path.join(__dirname, "..", "..");

function corePort(env = process.env) {
  const n = Number(env.POINTER_CORE_PORT);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_PORT;
}

function binaryPath(root = ROOT) {
  const name = process.platform === "win32" ? "pointer-core.exe" : "pointer-core";
  return path.join(root, "native", "pointer-core", "target", "release", name);
}

function requestJson({ method, path: urlPath, body, host, port, timeoutMs }) {
  const payload = body == null ? "" : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: host || "127.0.0.1",
        port: port || corePort(),
        method: method || "GET",
        path: urlPath || "/health",
        timeout: timeoutMs || 800,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          raw += c;
          if (raw.length > 64 * 1024) req.destroy();
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("pointer-core timeout"));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function health(opts = {}) {
  try {
    const j = await requestJson({
      method: "GET",
      path: "/health",
      host: "127.0.0.1",
      port: opts.port || corePort(opts.env),
      timeoutMs: opts.timeoutMs || 400,
    });
    if (j && j.ok) return j;
    return null;
  } catch {
    return null;
  }
}

async function sendOp(cmd, opts = {}) {
  return requestJson({
    method: "POST",
    path: "/v1/op",
    body: cmd || {},
    host: "127.0.0.1",
    port: opts.port || corePort(opts.env),
    timeoutMs: opts.timeoutMs || 1500,
  });
}

function publicCore(opts = {}) {
  const live = opts.live || {};
  const home = String(opts.home || pointerHome(opts.env)).slice(0, 240);
  const port = opts.port || corePort(opts.env);
  const ok = live.ok === true && live.engine === "rust";
  const ops = ["click", "move", "wheel", "pos", "type", "tap", "combo", "keys"];
  return {
    ok,
    engine: ok ? "rust" : live.engine ? String(live.engine).slice(0, 24) : "none",
    persistent: true,
    bind: `127.0.0.1:${port}`,
    home,
    api: `http://127.0.0.1:${port}/health`,
    ops: ok ? ops : [],
  };
}

async function ensureCore(opts = {}) {
  const env = opts.env || process.env;
  const port = opts.port || corePort(env);
  const home = opts.home || pointerHome(env);
  try {
    fs.mkdirSync(home, { recursive: true });
  } catch {
    /* best effort */
  }
  const already = await health({ port, timeoutMs: 300 });
  if (already && already.ok) {
    return { ...publicCore({ live: already, home, port, env }), spawned: false };
  }
  const bin = opts.binary || binaryPath(opts.root || ROOT);
  if (!fs.existsSync(bin)) {
    return {
      ...publicCore({ live: { ok: false, engine: "none" }, home, port, env }),
      spawned: false,
      reason: "binary-missing",
    };
  }
  const child = spawn(bin, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...env, POINTER_HOME: home, POINTER_CORE_PORT: String(port) },
  });
  if (child.unref) child.unref();
  const deadline = Date.now() + (opts.waitMs || 2000);
  while (Date.now() < deadline) {
    const live = await health({ port, timeoutMs: 250 });
    if (live && live.ok) {
      return { ...publicCore({ live, home, port, env }), spawned: true, pid: child.pid };
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  return {
    ...publicCore({ live: { ok: false, engine: "none" }, home, port, env }),
    spawned: true,
    reason: "start-timeout",
    pid: child.pid,
  };
}

module.exports = {
  DEFAULT_PORT,
  corePort,
  binaryPath,
  health,
  sendOp,
  publicCore,
  ensureCore,
  requestJson,
};
