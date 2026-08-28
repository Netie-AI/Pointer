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
const { publicMeetingNotes, exportMeetingNotes, publicMeetingRecap, exportMeetingRecap, publicMeetingSay, exportMeetingSay, publicMeetingEmail, exportMeetingEmail, publicMeetingActions, exportMeetingActions } = require("./meeting");
const { publicPendingTranscript } = require("./pending-scribe");
const { createWorkspace } = require("./workspace");
const { catalog, todayAssist, sessionBundle, sessionPacketParts, advanceLiveTeach, frameLiveTeach, canAdvanceTeach, askLiveCoworker, askHostCoworker, suggestsFromAssist, chipsForArtifact, liveTalkTurns, meetingCaptions, teachWalkPath, teachActionCue, documentDraftText, inboxDraftText, securityReportText, buildEml, buildSecurityReport } = require("./coworker-desks");
const { parsePoints } = require("./point-overlay");
const { buildDocx, zipStore } = require("./word-coworker");

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
    const captions = desk === "meeting" && got.ok ? meetingCaptions(got.artifact) : [];
    const action = desk === "teach" && got.ok ? teachActionCue({ cue: got.artifact.cue, path }) : "";
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
        captions,
        action,
        notes: desk === "meeting" && got.ok ? Boolean(got.artifact.notes) : false,
        also: desk === "meeting" && got.ok ? String(got.artifact.also || "") : "",
        avoid: desk === "meeting" && got.ok ? String(got.artifact.avoid || "") : "",
        findings: desk === "security" && got.ok && Array.isArray(got.artifact.findings) ? got.artifact.findings.slice(0, 12) : [],
        preview:
          got.ok && (desk === "inbox" || desk === "document" || desk === "security")
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
    const path = desk === "teach" && got.ok ? teachWalkPath(live) : [];
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
      path,
      action: desk === "teach" && got.ok ? teachActionCue({ cue: got.artifact.cue, path }) : "",
      turns: desk === "meeting" && got.ok ? liveTalkTurns(got.artifact) : [],
      captions: desk === "meeting" && got.ok ? meetingCaptions(got.artifact) : [],
      notes: desk === "meeting" && got.ok ? Boolean(got.artifact.notes) : false,
      also: desk === "meeting" && got.ok ? String(got.artifact.also || "") : "",
      avoid: desk === "meeting" && got.ok ? String(got.artifact.avoid || "") : "",
      findings: desk === "security" && got.ok && Array.isArray(got.artifact.findings) ? got.artifact.findings.slice(0, 12) : [],
      preview:
        got.ok && (desk === "inbox" || desk === "document" || desk === "security")
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
    if (req.method === "GET" && url.pathname === "/api/meeting" && queryFlag(url, "recap")) {
      let raw = null;
      try {
        raw = typeof opts.meetingRecap === "function" ? opts.meetingRecap() : null;
      } catch {
        raw = null;
      }
      const recap = publicMeetingRecap(raw);
      const exp = exportMeetingRecap(recap.text);
      const body = { ok: true, recap, markdown: exp.markdown, exported: exp.ok };
      if (!exp.ok) body.reason = exp.reason;
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/meeting" && queryFlag(url, "say")) {
      let raw = null;
      try {
        raw = typeof opts.meetingSay === "function" ? opts.meetingSay() : null;
      } catch {
        raw = null;
      }
      const say = publicMeetingSay(raw);
      const exp = exportMeetingSay(say.text);
      const body = { ok: true, say, markdown: exp.markdown, exported: exp.ok };
      if (!exp.ok) body.reason = exp.reason;
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/meeting" && queryFlag(url, "email")) {
      let raw = null;
      try {
        raw = typeof opts.meetingEmail === "function" ? opts.meetingEmail() : null;
      } catch {
        raw = null;
      }
      const email = publicMeetingEmail(raw);
      const exp = exportMeetingEmail(email.text);
      const body = { ok: true, email, markdown: exp.markdown, exported: exp.ok };
      if (!exp.ok) body.reason = exp.reason;
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/meeting" && queryFlag(url, "actions")) {
      let raw = null;
      try {
        raw = typeof opts.meetingActions === "function" ? opts.meetingActions() : null;
      } catch {
        raw = null;
      }
      const actions = publicMeetingActions(raw);
      const exp = exportMeetingActions(actions.text);
      const body = { ok: true, actions, markdown: exp.markdown, exported: exp.ok };
      if (!exp.ok) body.reason = exp.reason;
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
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
      (url.pathname === "/api/computer" || url.pathname === "/api/scribe")
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
                selection: queryFlag(url, "selection"),
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
        const gatedAssist = Boolean(
          body && (body.notes != null || body.instruction || body.kind || body.retry || body.dictate)
        );
        if (gatedAssist) {
          const mapped = {
            jsonrpc: "2.0",
            id: body.id ?? 1,
            method: "computer.meeting_assist",
            params: body.params || body,
          };
          const raw = opts.mcp
            ? opts.mcp.handle(mapped, { coordinator: api })
            : { jsonrpc: "2.0", id: mapped.id, error: { code: -32601, message: "mcp not wired" } };
          Promise.resolve(raw).then((out) => {
            res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify(out));
          });
          return;
        }
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
    if (req.method === "GET" && url.pathname === "/api/inbox.eml") {
      const got = workspace.get("live-inbox");
      const text = inboxDraftText(got.ok ? got.artifact : null);
      const built = buildEml(text);
      if (!built.ok) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, act: false, exec: false, send: false, reason: built.reason || "no inbox draft" }));
        return;
      }
      res.writeHead(200, {
        "content-type": "message/rfc822",
        "content-disposition": 'attachment; filename="pointer-draft.eml"',
      });
      res.end(built.buffer);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/security.md") {
      const got = workspace.get("live-security");
      const text = securityReportText(got.ok ? got.artifact : null);
      const built = buildSecurityReport(text);
      if (!built.ok) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, act: false, exec: false, approve: false, reason: built.reason || "no security review" }));
        return;
      }
      res.writeHead(200, {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": 'attachment; filename="pointer-review.md"',
      });
      res.end(built.buffer);
      return;
    }
    if (req.method === "GET" && (url.pathname === "/api/session.zip" || url.pathname === "/session.zip")) {
      const todayBrief = todayAssist({
        state: {
          today,
          lanes: snapshot().lanes,
          drafts,
          artifacts: workspace.list(),
          jobs: [],
        },
      });
      const parts = sessionPacketParts(workspace.list(), todayBrief.cue);
      const zipFiles = Array.isArray(parts.files) ? parts.files.slice() : [];
      if (parts.documentText) {
        const built = buildDocx(parts.documentText);
        if (built.ok) zipFiles.push({ name: "pointer-draft.docx", data: built.buffer });
      }
      if (!parts.ok || !zipFiles.length) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            ok: false,
            act: false,
            exec: false,
            send: false,
            approve: false,
            reason: parts.reason || "no live session",
          })
        );
        return;
      }
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="pointer-session.zip"',
      });
      res.end(zipStore(zipFiles));
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
          exec: false,
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
    if (req.method === "POST" && (url.pathname === "/mcp" || url.pathname === "/api/computer" || url.pathname === "/api/scribe")) {
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
