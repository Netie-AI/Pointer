"use strict";
/**
 * Live agent coordinator - local-first (DR-0004).
 *
 * Cursor Cloud, Cortex, and Pointer Act each take a named lane. A second
 * owner is refused so two agents do not click the same desktop. Pages are
 * short paths for host.netie.ai (loopback now; Worker is the public shell).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { PAGES, pageFor, fileFor } = require("./host-serve");
const { TOOLS, CATALOG } = require("./mcp-abi");
const { publicMeetingNotes, exportMeetingNotes } = require("./meeting");
const { publicPendingTranscript } = require("./pending-scribe");

const LANES = Object.freeze(["pointer-act", "cursor-cloud", "cortex", "craft"]);

const HOST_DIR = path.resolve(__dirname, "..", "..", "host");

function nowMs(clock) {
  return typeof clock === "function" ? clock() : Date.now();
}

function queryFlag(url, name) {
  const v = String(url.searchParams.get(name) || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function createCoordinator(opts = {}) {
  const clock = opts.clock || Date.now;
  const lanes = Object.fromEntries(LANES.map((id) => [id, null]));
  const drafts = [];
  const today = [];
  let lastSearch = [];
  let server = null;

  function snapshot() {
    return {
      pages: { ...PAGES },
      lanes: Object.fromEntries(
        LANES.map((id) => [id, lanes[id] ? { ...lanes[id] } : null])
      ),
      drafts: drafts.slice(-20),
      lastSearch: lastSearch.slice(),
      today: today.slice(-40),
      bind: server ? server.address() : null,
    };
  }

  function note(kind, detail) {
    today.push({ t: nowMs(clock), kind, detail: String(detail || "").slice(0, 240) });
    if (today.length > 80) today.splice(0, today.length - 80);
  }

  function claim(lane, spec = {}) {
    const id = String(lane || "").trim();
    if (!LANES.includes(id)) {
      return { ok: false, reason: `unknown lane: ${id || "(empty)"}` };
    }
    const owner = String(spec.owner || "").trim();
    if (!owner) return { ok: false, reason: "lane claim needs an owner" };
    const held = lanes[id];
    if (held && held.owner !== owner) {
      return {
        ok: false,
        conflict: true,
        reason: `${id} is held by ${held.owner}`,
        held: { ...held },
      };
    }
    lanes[id] = {
      owner,
      goal: String(spec.goal || held && held.goal || "").slice(0, 240),
      since: held && held.owner === owner ? held.since : nowMs(clock),
    };
    note("claim", `${id} -> ${owner}`);
    return { ok: true, lane: id, claim: { ...lanes[id] } };
  }

  function release(lane, spec = {}) {
    const id = String(lane || "").trim();
    if (!LANES.includes(id)) return { ok: false, reason: `unknown lane: ${id}` };
    const held = lanes[id];
    if (!held) return { ok: true, lane: id, released: false };
    const owner = String(spec.owner || "").trim();
    if (owner && held.owner !== owner) {
      return { ok: false, conflict: true, reason: `${id} is held by ${held.owner}` };
    }
    lanes[id] = null;
    note("release", `${id} <- ${held.owner}`);
    return { ok: true, lane: id, released: true };
  }

  function rememberSearch(hits) {
    lastSearch = Array.isArray(hits) ? hits.slice(0, 8) : [];
    note("search", `${lastSearch.length} hit(s)`);
    return lastSearch;
  }

  function noteDraft(draft) {
    if (!draft || typeof draft !== "object") return { ok: false, reason: "empty draft" };
    const row = {
      id: String(draft.id || "draft").slice(0, 80),
      title: String(draft.title || draft.id || "untitled").slice(0, 120),
      tier: "hint",
      preamble: String(draft.preamble || "").slice(0, 800),
      t: nowMs(clock),
    };
    drafts.push(row);
    if (drafts.length > 40) drafts.splice(0, drafts.length - 40);
    note("craft", row.id);
    return { ok: true, draft: row };
  }

  function handleHttp(req, res) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/api/state") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(snapshot()));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/scribe" && queryFlag(url, "pending")) {
      let raw = null;
      try {
        raw = typeof opts.scribePending === "function" ? opts.scribePending() : null;
      } catch {
        raw = null;
      }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, pending: publicPendingTranscript(raw) }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/meeting" && (queryFlag(url, "notes") || queryFlag(url, "export"))) {
      let raw = null;
      try {
        raw = typeof opts.meetingNotes === "function" ? opts.meetingNotes() : null;
      } catch {
        raw = null;
      }
      const notes = publicMeetingNotes(raw);
      const body = { ok: true, notes };
      if (queryFlag(url, "export")) {
        const exp = exportMeetingNotes(notes.text);
        body.markdown = exp.markdown;
        body.exported = exp.ok;
        if (!exp.ok) body.reason = exp.reason;
      }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
      return;
    }
    if (
      req.method === "GET" &&
      (url.pathname === "/api/computer" || url.pathname === "/api/scribe" || url.pathname === "/api/meeting")
    ) {
      const statusFn = opts.computerStatus;
      const snap = statusFn
        ? statusFn()
        : { ok: true, detectable: false, reason: "computer status not wired" };
      const pick = (out) => {
        if (url.pathname === "/api/scribe") {
          return { ok: true, detectable: Boolean(out && out.detectable), ...(out && out.scribe) };
        }
        if (url.pathname === "/api/meeting") {
          return { ok: true, detectable: Boolean(out && out.detectable), ...(out && out.meeting) };
        }
        return out;
      };
      const body = snap && typeof snap.then === "function" ? null : snap;
      if (body) {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(pick(body)));
        return;
      }
      Promise.resolve(snap).then((out) => {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(pick(out)));
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/tools") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, tools: TOOLS.slice(), catalog: CATALOG.slice() }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/observe") {
      const mcp = opts.mcp;
      const raw = mcp
        ? mcp.handle(
            {
              jsonrpc: "2.0",
              id: 1,
              method: "computer.observe",
              params: {
                elements: queryFlag(url, "elements"),
                screenshot: queryFlag(url, "screenshot"),
                clipboard: queryFlag(url, "clipboard"),
              },
            },
            { coordinator: api }
          )
        : {
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32601, message: "mcp not wired" },
          };
      Promise.resolve(raw).then((out) => {
        const body = out && out.result ? out.result : out;
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(body));
      });
      return;
    }
    if (req.method === "POST" && (url.pathname === "/mcp" || url.pathname === "/api/computer" || url.pathname === "/api/scribe" || url.pathname === "/api/meeting")) {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        let body = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "parse error" } }));
          return;
        }
        if (url.pathname === "/api/computer") {
          body = {
            jsonrpc: "2.0",
            id: body.id ?? 1,
            method: "computer.act",
            params: body.params || body,
          };
        } else if (url.pathname === "/api/scribe") {
          body = {
            jsonrpc: "2.0",
            id: body.id ?? 1,
            method: "computer.scribe",
            params: body.params || body,
          };
        } else if (url.pathname === "/api/meeting") {
          body = {
            jsonrpc: "2.0",
            id: body.id ?? 1,
            method: "computer.meeting_assist",
            params: body.params || body,
          };
        }
        const mcp = opts.mcp;
        const raw = mcp ? mcp.handle(body, { coordinator: api }) : {
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: { code: -32601, message: "mcp not wired" },
        };
        Promise.resolve(raw).then((out) => {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(out));
        });
      });
      return;
    }
    const file = req.method === "GET" ? fileFor(url.pathname) : null;
    if (file) {
      const abs = path.resolve(HOST_DIR, file);
      const root = path.resolve(HOST_DIR);
      if (!abs.startsWith(root + path.sep) && abs !== root) {
        res.writeHead(404).end("not a coordinator page");
        return;
      }
      if (!fs.existsSync(abs)) {
        res.writeHead(404).end("missing page");
        return;
      }
      const type = file.endsWith(".css")
        ? "text/css"
        : file.endsWith(".js")
          ? "text/javascript"
          : "text/html";
      res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
      res.end(fs.readFileSync(abs));
      return;
    }
    res.writeHead(404).end("not a coordinator page");
  }

  function listen(spec = {}) {
    if (server) return Promise.resolve({ ok: true, already: true, address: server.address() });
    const host = spec.host || "127.0.0.1";
    if (host !== "127.0.0.1" && host !== "localhost") {
      return Promise.resolve({ ok: false, reason: "coordinator binds loopback only" });
    }
    const port = Number.isFinite(Number(spec.port)) ? Number(spec.port) : 18010;
    server = http.createServer(handleHttp);
    return new Promise((resolve, reject) => {
      server.once("error", (err) => {
        server = null;
        reject(err);
      });
      server.listen(port, host, () => {
        resolve({ ok: true, address: server.address() });
      });
    });
  }

  function close() {
    return new Promise((resolve) => {
      if (!server) return resolve({ ok: true, closed: false });
      server.close(() => {
        server = null;
        resolve({ ok: true, closed: true });
      });
    });
  }

  const api = {
    LANES,
    PAGES,
    snapshot,
    pageFor,
    claim,
    release,
    rememberSearch,
    noteDraft,
    listen,
    close,
  };
  return api;
}

module.exports = { createCoordinator, LANES, PAGES };
