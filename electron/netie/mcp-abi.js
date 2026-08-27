"use strict";
/**
 * First-party MCP-shaped JSON-RPC for the coordinator (DR-0004 / DR-0005).
 * Unknown methods refuse. Third-party MCP servers are still P-05 / P16.
 * workspace.exec is a named refusal - it is not a runtime.
 */

const { catalog, pickDesk, teachAssist, securityAssist } = require("./coworker-desks");

const TOOLS = Object.freeze([
  "tools.list",
  "skills.search",
  "skills.craft",
  "lanes.claim",
  "lanes.release",
  "lanes.list",
  "desks.list",
  "desks.pick",
  "teach.point",
  "teach.live",
  "today.brief",
  "meeting.live",
  "security.review",
  "security.live",
  "inbox.live",
  "document.live",
  "workspace.list",
  "workspace.get",
  "workspace.put",
  "workspace.exec",
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
      if (method === "tools.list") return rpcResult(id, { tools: TOOLS.slice() });
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
      if (method === "desks.list") return rpcResult(id, { desks: catalog() });
      if (method === "desks.pick") {
        const desk = pickDesk(params.goal || params.text || "", { mode: params.mode });
        return rpcResult(id, { desk: { id: desk.id, label: desk.label, act: desk.act } });
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
        const got = workspace.get("live-meeting");
        return rpcResult(id, { ...got, act: false, exec: false });
      }
      if (method === "teach.live") {
        if (!workspace) return rpcError(id, -32000, "workspace missing");
        const got = workspace.get("live-teach");
        return rpcResult(id, { ...got, act: false, exec: false });
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

  return { TOOLS, handle };
}

module.exports = { createMcpAbi, TOOLS };
