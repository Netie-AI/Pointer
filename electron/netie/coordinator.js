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
const { createWorkspace } = require("./workspace");
const { catalog, todayAssist, sessionBundle, advanceLiveTeach, frameLiveTeach, canAdvanceTeach, askLiveCoworker, askHostCoworker, suggestsFromAssist, chipsForArtifact, liveTalkTurns, teachWalkPath, documentDraftText } = require("./coworker-desks");
const { parsePoints } = require("./point-overlay");
const { buildDocx } = require("./word-coworker");

const LANES = Object.freeze(["pointer-act", "cursor-cloud", "cortex", "craft"]);

const HOST_DIR = path.resolve(__dirname, "..", "..", "host");

function nowMs(clock) {
  return typeof clock === "function" ? clock() : Date.now();
}

function createCoordinator(opts = {}) {
  const clock = opts.clock || Date.now;
  const lanes = Object.fromEntries(LANES.map((id) => [id, null]));
  const drafts = [];
  const today = [];
  let lastSearch = [];
  let server = null;
  const workspace = opts.workspace || createWorkspace({ clock });

  function snapshot() {
    return {
      pages: { ...PAGES },
      lanes: Object.fromEntries(
        LANES.map((id) => [id, lanes[id] ? { ...lanes[id] } : null])
      ),
      drafts: drafts.slice(-20),
      lastSearch: lastSearch.slice(),
      today: today.slice(-40),
      desks: catalog(),
      workspace: workspace.snapshot(),
      exec: false,
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

  function sendLiveRoom(res, desk, id) {
    const got = workspace.get(id);
    const markers = got.ok ? parsePoints(String(got.artifact.body || "")).points : [];
    const path = desk === "teach" && got.ok ? teachWalkPath(got.artifact.live) : [];
    const turns = desk === "meeting" && got.ok ? liveTalkTurns(got.artifact) : [];
    const artifact = got.ok
      ? Object.assign({}, got.artifact, { live: undefined })
      : null;
    if (artifact) delete artifact.live;
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: got.ok,
        act: false,
        exec: false,
        localFirst: false,
        desk,
        cue: got.ok ? String(got.artifact.cue || "") : "",
        asked: got.ok ? String(got.artifact.asked || "") : "",
        rest: got.ok ? String(got.artifact.rest || "") : "",
        heard: got.ok ? String(got.artifact.heard || "") : "",
        deliverable: got.ok ? String(got.artifact.body || "") : "",
        markers,
        path,
        turns,
        notes: desk === "meeting" && got.ok ? Boolean(got.artifact.notes) : false,
        also: desk === "meeting" && got.ok ? String(got.artifact.also || "") : "",
        avoid: desk === "meeting" && got.ok ? String(got.artifact.avoid || "") : "",
        findings: desk === "security" && got.ok && Array.isArray(got.artifact.findings) ? got.artifact.findings.slice(0, 12) : [],
        preview:
          got.ok && (desk === "inbox" || desk === "document")
            ? String(got.artifact.preview || "").slice(0, 600)
            : "",
        advance: desk === "teach" && got.ok && canAdvanceTeach(got.artifact.live),
        chips:
          got.ok && desk !== "teach"
            ? suggestsFromAssist({
                ok: true,
                desk,
                deliverable: got.artifact.body,
              }).map((c) => ({ q: c.q, label: c.label }))
            : [],
        artifact,
        reason: got.ok ? `live ${desk} on loopback; no runtime` : `no live ${desk} yet`,
      })
    );
  }

  function roomCard(got, desk, fallbackTitle) {
    const live = got.ok ? got.artifact.live : undefined;
    return {
      ok: got.ok,
      desk,
      cue: got.ok ? String(got.artifact.cue || "") : "",
      asked: got.ok ? String(got.artifact.asked || "") : "",
      rest: got.ok ? String(got.artifact.rest || "") : "",
      heard: got.ok ? String(got.artifact.heard || "") : "",
      deliverable: got.ok ? String(got.artifact.body || "") : "",
      title: got.ok && got.artifact.title ? got.artifact.title : fallbackTitle,
      advance: desk === "teach" && got.ok && canAdvanceTeach(live),
      path: desk === "teach" && got.ok ? teachWalkPath(live) : [],
      turns: desk === "meeting" && got.ok ? liveTalkTurns(got.artifact) : [],
      notes: desk === "meeting" && got.ok ? Boolean(got.artifact.notes) : false,
      also: desk === "meeting" && got.ok ? String(got.artifact.also || "") : "",
      avoid: desk === "meeting" && got.ok ? String(got.artifact.avoid || "") : "",
      findings: desk === "security" && got.ok && Array.isArray(got.artifact.findings) ? got.artifact.findings.slice(0, 12) : [],
      preview:
        got.ok && (desk === "inbox" || desk === "document")
          ? String(got.artifact.preview || "").slice(0, 600)
          : "",
    };
  }

  function handleHttp(req, res) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/api/state") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(snapshot()));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/today") {
      const assist = todayAssist({
        state: {
          today,
          lanes: snapshot().lanes,
          drafts,
          artifacts: workspace.list(),
          jobs: [],
        },
      });
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: assist.ok,
          act: false,
          exec: false,
          localFirst: false,
          desk: assist.desk,
          kind: assist.kind,
          title: assist.title,
          cue: assist.cue || "",
          plate: Array.isArray(assist.plate) ? assist.plate.slice(0, 6) : [],
          deliverable: assist.deliverable,
          events: today.slice(-40),
          artifacts: workspace.publicList(),
          chips: suggestsFromAssist(assist).map((c) => ({ q: c.q, label: c.label })),
          reason: "live today on loopback; no runtime",
        })
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/ask") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        let body = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, act: false, exec: false, reason: "parse error" }));
          return;
        }
        const ask = String((body && (body.ask || body.text || body.q)) || "").trim();
        const sourceId = String((body && (body.id || body.sourceId)) || "").trim();
        const out = askHostCoworker(workspace, ask, sourceId ? { sourceId } : undefined);
        if (out.ok && out.desk === "meeting") {
          sendLiveRoom(res, "meeting", "live-meeting");
          return;
        }
        if (out.ok && out.desk === "teach") {
          sendLiveRoom(res, "teach", "live-teach");
          return;
        }
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ...out, live: undefined, act: false, exec: false, localFirst: false }));
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/meeting") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        let body = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, act: false, exec: false, reason: "parse error" }));
          return;
        }
        const ask = String((body && (body.ask || body.text || body.q)) || "").trim();
        const out = askLiveCoworker(workspace, ask);
        if (out.ok && out.desk === "meeting") {
          sendLiveRoom(res, "meeting", "live-meeting");
          return;
        }
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ...out, live: undefined, act: false, exec: false, localFirst: false }));
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/meeting") {
      sendLiveRoom(res, "meeting", "live-meeting");
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/teach") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        let body = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, act: false, exec: false, reason: "parse error" }));
          return;
        }
        const frame = (body && (body.region || body.frame)) || null;
        if (frame && typeof frame === "object") {
          const drawn = frameLiveTeach(workspace, frame);
          if (drawn.ok && drawn.desk === "teach") {
            sendLiveRoom(res, "teach", "live-teach");
            return;
          }
          if (!String((body && (body.ask || body.text || body.q)) || "").trim()) {
            res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ...drawn, live: undefined, act: false, exec: false, localFirst: false, desk: "teach" }));
            return;
          }
        }
        const ask = String((body && (body.ask || body.text || body.q)) || "").trim();
        const out = advanceLiveTeach(workspace, ask);
        if (!out.ok) {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ...out, act: false, exec: false, localFirst: false, desk: "teach" }));
          return;
        }
        sendLiveRoom(res, "teach", "live-teach");
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/teach") {
      sendLiveRoom(res, "teach", "live-teach");
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/security") {
      sendLiveRoom(res, "security", "live-security");
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/document") {
      sendLiveRoom(res, "document", "live-document");
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/document.docx") {
      const got = workspace.get("live-document");
      const text = documentDraftText(got.ok ? got.artifact : null);
      const built = buildDocx(text);
      if (!built.ok) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, act: false, exec: false, reason: built.reason || "no document draft" }));
        return;
      }
      res.writeHead(200, {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": 'attachment; filename="pointer-draft.docx"',
      });
      res.end(built.buffer);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/inbox") {
      sendLiveRoom(res, "inbox", "live-inbox");
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/home") {
      const todayBrief = todayAssist({
        state: {
          today,
          lanes: snapshot().lanes,
          drafts,
          artifacts: workspace.list(),
          jobs: [],
        },
      });
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          act: false,
          exec: false,
          localFirst: false,
          reason: "live coworker rooms on loopback; no runtime",
          rooms: {
            teach: roomCard(workspace.get("live-teach"), "teach", "Teach"),
            meeting: roomCard(workspace.get("live-meeting"), "meeting", "Meeting"),
            today: {
              ok: todayBrief.ok,
              desk: "today",
              cue: todayBrief.cue || "",
              deliverable: todayBrief.deliverable || "",
              title: todayBrief.title || "Today",
              plate: Array.isArray(todayBrief.plate) ? todayBrief.plate.slice(0, 6) : [],
            },
            document: roomCard(workspace.get("live-document"), "document", "Document"),
            security: roomCard(workspace.get("live-security"), "security", "Security"),
            inbox: roomCard(workspace.get("live-inbox"), "inbox", "Inbox"),
          },
          session: sessionBundle(workspace.list(), todayBrief.cue),
        })
      );
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/workspace") {
      const id = url.searchParams.get("id");
      if (id) {
        const got = workspace.get(id);
        const artifact = got.ok ? Object.assign({}, got.artifact) : null;
        if (artifact) delete artifact.live;
        res.writeHead(got.ok ? 200 : 404, { "content-type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            ...got,
            artifact,
            chips: got.ok ? chipsForArtifact(got.artifact).map((c) => ({ q: c.q, label: c.label })) : [],
            exec: false,
            act: false,
          })
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      const todayBrief = todayAssist({
        state: {
          today,
          lanes: snapshot().lanes,
          drafts,
          artifacts: workspace.list(),
          jobs: [],
        },
      });
      res.end(
        JSON.stringify({
          ...workspace.snapshot(),
          session: sessionBundle(workspace.list(), todayBrief.cue),
        })
      );
      return;
    }
    if (req.method === "POST" && (url.pathname === "/api/workspace/exec" || url.pathname === "/exec")) {
      const refused = workspace.exec();
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(refused));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/workspace") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        let body = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: "parse error" }));
          return;
        }
        const out = workspace.put(body);
        res.writeHead(out.ok ? 200 : 400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(out));
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/mcp") {
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
        const mcp = opts.mcp;
        const out = mcp ? mcp.handle(body, { coordinator: api }) : {
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: { code: -32601, message: "mcp not wired" },
        };
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(out));
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

  function brief() {
    return todayAssist({
      state: {
        today,
        lanes: snapshot().lanes,
        drafts,
        artifacts: workspace.list(),
        jobs: [],
      },
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
    note,
    brief,
    workspace,
    listen,
    close,
  };
  return api;
}

module.exports = { createCoordinator, LANES, PAGES };
