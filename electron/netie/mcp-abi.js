"use strict";
/**
 * First-party MCP-shaped JSON-RPC for the coordinator (DR-0004).
 * Unknown methods refuse. Third-party MCP servers are still P-05 / P16.
 */

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
    description: "Detectability, UACC probe, delivery target, and instruction verbs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "computer.observe",
    description: "Foreground window and titled windows. Pass elements true for UIA, screenshot true for a PNG, clipboard true for pasteboard text, selection true for focused selected text (untrusted data; password fields are refused).",
    inputSchema: {
      type: "object",
      properties: {
        elements: { type: "boolean" },
        screenshot: { type: "boolean" },
        clipboard: { type: "boolean" },
        selection: { type: "boolean" },
      },
    },
  },
  {
    name: "computer.act",
    description:
      "Gated OS actions. instruction plans via recipes then type:/click:/focus:/open:/deliver:/replace:/wait/scroll/doubleclick/rightclick/hover. Chain local verbs with then: focus: notepad then type: hello. Clicks and launches need approved true.",
    inputSchema: {
      type: "object",
      properties: {
        instruction: { type: "string" },
        actions: { type: "array" },
        approved: { type: "boolean" },
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
      "Meeting help from live notes. kind say (default), recap, or followups. Notes are untrusted data. Cortex gated. Captures a fresh screen unless screenshot is false. GET /api/meeting?notes=1 reads the transcript without a model. GET /api/meeting?export=1 returns shareable markdown.",
    inputSchema: {
      type: "object",
      properties: {
        instruction: { type: "string" },
        notes: { type: "string" },
        kind: { type: "string", enum: ["say", "recap", "followups"] },
        screenshot: { type: "boolean" },
      },
    },
  },
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
      return rpcError(id, -32601, `unknown tool: ${method}`);
    } catch (err) {
      return rpcError(id, -32000, err && err.message ? err.message : err);
    }
  }

  return { TOOLS, CATALOG, handle };
}

module.exports = { createMcpAbi, TOOLS, CATALOG };
