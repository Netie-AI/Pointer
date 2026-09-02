"use strict";
/**
 * First-party MCP-shaped JSON-RPC for the coordinator (DR-0004 / DR-0005).
 * Unknown methods refuse. Third-party MCP servers are still P-05 / P16.
 * workspace.exec is a named refusal - it is not a runtime.
 */

const { catalog, pickDesk, teachAssist, securityAssist, sessionBundle, advanceLiveTeach, frameLiveTeach, askLiveCoworker, askHostCoworker, teachWalkPath } = require("./coworker-desks");

const TOOLS = Object.freeze([
  "tools.list",
  "skills.search",
  "skills.craft",
  "lanes.claim",
  "lanes.release",
  "lanes.list",
  "computer.status",
  "computer.observe",
  "computer.act",
  "computer.scribe",
  "computer.meeting_assist",
  "desks.list",
  "desks.pick",
  "desks.ask",
  "teach.point",
  "teach.live",
  "today.brief",
  "meeting.live",
  "security.review",
  "security.live",
  "inbox.live",
  "document.live",
  "session.live",
  "workspace.list",
  "workspace.get",
  "workspace.put",
  "workspace.exec",
]);

const CATALOG = Object.freeze([
  {
    name: "tools.list",
    description: "Allowlist plus JSON schemas so another agent can drive this computer.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "skills.search",
    description: "Search local recipes and Cortex skill hits. Hits never carry executable actions.",
    inputSchema: {
      type: "object",
      properties: { goal: { type: "string" }, limit: { type: "number" } },
    },
  },
  {
    name: "skills.craft",
    description: "Draft a hint skill with empty actions. Cannot emit clicks.",
    inputSchema: { type: "object", properties: { goal: { type: "string" } }, required: ["goal"] },
  },
  {
    name: "lanes.claim",
    description: "Claim a named lane so two agents do not share the Act surface.",
    inputSchema: {
      type: "object",
      properties: { lane: { type: "string" }, owner: { type: "string" }, goal: { type: "string" } },
      required: ["lane", "owner"],
    },
  },
  {
    name: "lanes.release",
    description: "Release a lane previously claimed by owner.",
    inputSchema: {
      type: "object",
      properties: { lane: { type: "string" }, owner: { type: "string" } },
      required: ["lane"],
    },
  },
  {
    name: "lanes.list",
    description: "Snapshot of who holds pointer-act, cursor-cloud, cortex, craft.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "computer.status",
    description: "Detectability, live mode, session, token totals, Claude 5-hour vs Cursor route, hotkeys, STT/LLM URL, on-device vs off-device, UACC probe, delivery target, and instruction verbs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "computer.observe",
    description: "Foreground window and titled windows with screen rects (x y width height plus center cx cy). Pass elements true for UIA, screenshot true for a PNG, clipboard true for pasteboard text, selection true for focused selected text, captions true for LIVE speech lines (untrusted data; password fields are refused).",
    inputSchema: {
      type: "object",
      properties: {
        elements: { type: "boolean" },
        screenshot: { type: "boolean" },
        clipboard: { type: "boolean" },
        selection: { type: "boolean" },
        captions: { type: "boolean" },
      },
    },
  },
  {
    name: "computer.act",
    description:
      "Gated OS actions. instruction plans via recipes then type:/click:/click window:/focus:/open:/deliver:/replace:/wait/scroll/doubleclick/rightclick/hover. Clicks restore the real cursor and the previous window; hover still travels; warp:true keeps the old pointer animation. Type/fill still steal focus so text lands. Chain local verbs with then: focus: notepad then type: hello or click window: notepad then type: hello. use Claude opens Claude Code while the 5-hour window is open; use Cursor when that limit is used. Clicks and launches need approved true. mode alone switches Agent/General/Transcribe/Scribe/Meeting like the tray (no Cortex).",
    inputSchema: {
      type: "object",
      properties: {
        instruction: { type: "string" },
        actions: { type: "array" },
        approved: { type: "boolean" },
        mode: { type: "string", enum: ["agent", "general", "transcribe", "scribe", "meeting"] },
      },
    },
  },
  {
    name: "computer.scribe",
    description:
      "Rewrite or compose, then paste into the remembered window. Cortex gated. retry true re-runs a failed take; dictate true pastes the raw transcript.",
    inputSchema: {
      type: "object",
      properties: {
        instruction: { type: "string" },
        selectedText: { type: "string" },
        retry: { type: "boolean" },
        dictate: { type: "boolean" },
      },
    },
  },
  {
    name: "computer.meeting_assist",
    description:
      "Meeting help from live notes. kind say (default), recap, followups, email, or actions. Notes are untrusted data. Cortex gated. Captures a fresh screen unless screenshot is false. GET /api/meeting?notes=1 reads the transcript without a model. GET /api/meeting?export=1 returns shareable notes markdown. GET /api/meeting?recap=1 returns the last recap. GET /api/meeting?say=1 returns the last Say. GET /api/meeting?email=1 returns the last follow-up email. GET /api/meeting?actions=1 returns the last action items. GET /api/meeting?pack=1 returns notes plus last recap/say/email/actions in one markdown.",
    inputSchema: {
      type: "object",
      properties: {
        instruction: { type: "string" },
        notes: { type: "string" },
        kind: { type: "string", enum: ["say", "recap", "followups", "email", "actions"] },
        screenshot: { type: "boolean" },
      },
    },
  },
  {
    name: "desks.list",
    description: "List coworker desks. Never Act.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "desks.pick",
    description: "Pick a desk from a goal. Never Act.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "desks.ask",
    description: "Ask the open coworker file. Never Act.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "teach.point",
    description: "Measured teach points. Never Act.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "teach.live",
    description: "Live teach walk. Never Act.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "today.brief",
    description: "Today plate. Never Act.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "meeting.live",
    description: "Live meeting notes. Never Act.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "security.review",
    description: "Security review draft. Never approve.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "security.live",
    description: "Live Needs you file. Never approve.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "inbox.live",
    description: "Live unsent mail. Never send.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "document.live",
    description: "Live Notes file. Never Act.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "session.live",
    description: "This session bundle. Never Act.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "workspace.list",
    description: "List workspace artifacts. Never exec.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "workspace.get",
    description: "Read one workspace artifact. Never exec.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "workspace.put",
    description: "Store a workspace artifact. Never exec.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "workspace.exec",
    description: "Named refusal: workspace has no runtime (P-06).",
    inputSchema: { type: "object", properties: {} },
  }
]);

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message: String(message) } };
}

function createMcpAbi(opts = {}) {
  const search = opts.search;
  const craft = opts.craft;
  const status = opts.status;
  const observe = opts.observe;
  const act = opts.act;
  const scribe = opts.scribe;
  const meetingAssist = opts.meetingAssist;
  const setMode = opts.setMode;

  async function gated(id, fn, missing, params, ctx) {
    if (typeof fn !== "function") {
      return rpcError(id, -32003, missing);
    }
    const out = await fn(params, ctx);
    if (out && out.blocked) {
      return rpcError(id, -32003, out.reason || "no Cortex /dms/secure gate");
    }
    return rpcResult(id, out);
  }

  async function handle(body, ctx = {}) {
    const id = body && Object.prototype.hasOwnProperty.call(body, "id") ? body.id : null;
    const method = String((body && body.method) || "").trim();
    const params = (body && body.params) || {};
    if (!TOOLS.includes(method)) {
      return rpcError(id, -32601, `unknown tool: ${method || "(empty)"}`);
    }
    const coord = ctx.coordinator;
    const workspace = (coord && coord.workspace) || opts.workspace;
    try {
      if (method === "tools.list") return rpcResult(id, { tools: TOOLS.slice(), catalog: CATALOG.slice() });
      if (method === "lanes.list") {
        return rpcResult(id, { lanes: coord ? coord.snapshot().lanes : {} });
      }
      if (method === "lanes.claim") {
        if (!coord) return rpcError(id, -32000, "coordinator missing");
        return rpcResult(id, coord.claim(params.lane, params));
      }
      if (method === "lanes.release") {
        if (!coord) return rpcError(id, -32000, "coordinator missing");
        return rpcResult(id, coord.release(params.lane, params));
      }
      if (method === "skills.search") {
        const goal = String(params.goal || params.text || "").trim();
        const hits = search ? await search(goal, params) : { ok: true, hits: [] };
        if (coord && hits && hits.hits) coord.rememberSearch(hits.hits);
        return rpcResult(id, hits);
      }
      if (method === "skills.craft") {
        const goal = String(params.goal || params.text || "").trim();
        if (!goal) return rpcError(id, -32602, "skills.craft needs a goal");
        const draft = craft ? craft(goal) : { ok: false, reason: "craft missing" };
        if (Array.isArray(draft.actions) && draft.actions.length) {
          return rpcError(id, -32600, "craft cannot emit executable actions");
        }
        if (coord && draft && draft.ok !== false) coord.noteDraft(draft);
        return rpcResult(id, { ...draft, tier: "hint", actions: [] });
      }
      if (method === "computer.status") {
        const snap = status ? await status(params, ctx) : { ok: false, reason: "status missing" };
        return rpcResult(id, snap);
      }
      if (method === "computer.observe") {
        const snap = observe ? await observe(params, ctx) : { ok: false, reason: "observe missing" };
        return rpcResult(id, snap);
      }
      if (method === "computer.act") {
        const p = params && typeof params === "object" ? params : {};
        const mode = String(p.mode || "").trim().toLowerCase();
        const hasAct = Boolean(
          String(p.instruction || p.text || p.goal || "").trim() ||
            (Array.isArray(p.actions) && p.actions.length)
        );
        if (mode && !hasAct) {
          if (typeof setMode !== "function") {
            return rpcError(id, -32003, "mode switch missing");
          }
          const out = await setMode(mode, ctx);
          if (out && out.ok === false) {
            return rpcError(id, -32602, out.reason || "unknown mode");
          }
          return rpcResult(id, out);
        }
        return gated(id, act, "computer.act needs a Cortex /dms/secure gate", params, ctx);
      }
      if (method === "computer.scribe") {
        return gated(id, scribe, "computer.scribe needs a Cortex /dms/secure gate", params, ctx);
      }
      if (method === "computer.meeting_assist") {
        return gated(
          id,
          meetingAssist,
          "computer.meeting_assist needs a Cortex /dms/secure gate",
          params,
          ctx
        );
      }
      if (method === "desks.list") return rpcResult(id, { desks: catalog() });
      if (method === "desks.pick") {
        const desk = pickDesk(params.goal || params.text || "", { mode: params.mode });
        return rpcResult(id, { desk: { id: desk.id, label: desk.label, act: desk.act } });
      }
      if (method === "desks.ask") {
        if (!workspace) return rpcError(id, -32000, "workspace missing");
        const ask = String(params.ask || params.text || params.goal || "").trim();
        const sourceId = String(params.id || params.sourceId || "").trim();
        const out = askHostCoworker(workspace, ask, sourceId ? { sourceId } : undefined);
        return rpcResult(id, { ...out, live: undefined, act: false, exec: false });
      }
      if (method === "teach.point") {
        const assist = teachAssist({
          text: params.text || params.goal || "walk me through this on my screen",
          controls: params.controls,
          screen: params.screen,
        });
        return rpcResult(id, { ...assist, act: false, exec: false });
      }
      if (method === "today.brief") {
        if (!coord) return rpcError(id, -32000, "coordinator missing");
        const assist = coord.brief();
        return rpcResult(id, { ...assist, act: false, exec: false });
      }
      if (method === "meeting.live") {
        if (!workspace) return rpcError(id, -32000, "workspace missing");
        const ask = String(params.ask || params.text || "").trim();
        if (ask) {
          const out = askLiveCoworker(workspace, ask);
          return rpcResult(id, { ...out, live: undefined, act: false, exec: false });
        }
        const got = workspace.get("live-meeting");
        const artifact = got.ok ? Object.assign({}, got.artifact) : null;
        if (artifact) delete artifact.live;
        return rpcResult(id, { ...got, artifact, act: false, exec: false });
      }
      if (method === "teach.live") {
        if (!workspace) return rpcError(id, -32000, "workspace missing");
        const frame = params.region || params.frame;
        if (frame && typeof frame === "object") {
          const drawn = frameLiveTeach(workspace, frame);
          return rpcResult(id, { ...drawn, live: undefined, act: false, exec: false });
        }
        const ask = String(params.ask || params.text || "").trim();
        if (ask) {
          const out = advanceLiveTeach(workspace, ask);
          return rpcResult(id, { ...out, live: undefined, act: false, exec: false });
        }
        const got = workspace.get("live-teach");
        const artifact = got.ok ? Object.assign({}, got.artifact) : null;
        const path = got.ok ? teachWalkPath(got.artifact.live) : [];
        if (artifact) delete artifact.live;
        return rpcResult(id, { ...got, artifact, path, act: false, exec: false });
      }
      if (method === "security.review") {
        const assist = securityAssist({
          text: params.text || params.goal || "security review",
          files: params.files,
        });
        return rpcResult(id, { ...assist, act: false, exec: false });
      }
      if (method === "security.live") {
        if (!workspace) return rpcError(id, -32000, "workspace missing");
        const got = workspace.get("live-security");
        return rpcResult(id, { ...got, act: false, exec: false });
      }
      if (method === "inbox.live") {
        if (!workspace) return rpcError(id, -32000, "workspace missing");
        const got = workspace.get("live-inbox");
        return rpcResult(id, { ...got, act: false, exec: false });
      }
      if (method === "document.live") {
        if (!workspace) return rpcError(id, -32000, "workspace missing");
        const got = workspace.get("live-document");
        return rpcResult(id, { ...got, act: false, exec: false });
      }
      if (method === "session.live") {
        if (!coord) return rpcError(id, -32000, "coordinator missing");
        const assist = coord.brief();
        const bundle = sessionBundle(coord.workspace.list(), assist && assist.cue);
        return rpcResult(id, { ...bundle, act: false, exec: false });
      }
      if (method === "workspace.list") {
        if (!workspace) return rpcError(id, -32000, "workspace missing");
        return rpcResult(id, { artifacts: workspace.list(), exec: false });
      }
      if (method === "workspace.get") {
        if (!workspace) return rpcError(id, -32000, "workspace missing");
        const got = workspace.get(params.id);
        return rpcResult(id, { ...got, exec: false, act: false });
      }
      if (method === "workspace.put") {
        if (!workspace) return rpcError(id, -32000, "workspace missing");
        return rpcResult(id, workspace.put(params));
      }
      if (method === "workspace.exec") {
        const refused = workspace
          ? workspace.exec(params)
          : { ok: false, exec: false, reason: "workspace has no runtime; Act stays on the laptop (P-06)" };
        return rpcError(id, -32600, refused.reason);
      }
      return rpcError(id, -32601, `unknown tool: ${method}`);
    } catch (err) {
      return rpcError(id, -32000, err && err.message ? err.message : err);
    }
  }

  return { TOOLS, CATALOG, handle };
}

module.exports = { createMcpAbi, TOOLS, CATALOG };
