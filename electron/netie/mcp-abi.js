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

  async function handle(body, ctx = {}) {
    const id = body && Object.prototype.hasOwnProperty.call(body, "id") ? body.id : null;
    const method = String((body && body.method) || "").trim();
    const params = (body && body.params) || {};
    if (!TOOLS.includes(method)) {
      return rpcError(id, -32601, `unknown tool: ${method || "(empty)"}`);
    }
    const coord = ctx.coordinator;
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
      if (method === "computer.status") {
        const snap = status ? await status(params, ctx) : { ok: false, reason: "status missing" };
        return rpcResult(id, snap);
      }
      if (method === "computer.observe") {
        const snap = observe ? await observe(params, ctx) : { ok: false, reason: "observe missing" };
        return rpcResult(id, snap);
      }
      if (method === "computer.act") {
        if (typeof act !== "function") {
          return rpcError(id, -32003, "computer.act needs a Cortex /dms/secure gate");
        }
        const out = await act(params, ctx);
        if (out && out.blocked) {
          return rpcError(id, -32003, out.reason || "no Cortex /dms/secure gate");
        }
        return rpcResult(id, out);
      }
      return rpcError(id, -32601, `unknown tool: ${method}`);
    } catch (err) {
      return rpcError(id, -32000, err && err.message ? err.message : err);
    }
  }

  return { TOOLS, handle };
}

module.exports = { createMcpAbi, TOOLS };
