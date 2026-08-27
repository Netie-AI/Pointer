"use strict";
/**
 * First-party loopback computer.act (DR-0005).
 * Cortex /dms/secure then plan-guard then safety.reviewPlan, then execute.
 * No Cortex gate => no OS actions. Approval still required for consequential
 * verbs unless the caller passes approved:true after a human nod.
 */

const { guardPlan } = require("./plan-guard");
const { reviewPlan } = require("./safety");
const { deliverTextActions } = require("./delivery");

function parseActRequest(params) {
  const src = params && typeof params === "object" ? params : {};
  const instruction = String(src.instruction || src.goal || src.text || "").trim();
  const raw = src.actions;
  const actions = Array.isArray(raw)
    ? raw.filter((a) => a && typeof a === "object" && a.type)
    : [];
  return {
    instruction,
    actions,
    approved: src.approved === true,
    owner: String(src.owner || "mcp-client").slice(0, 80),
  };
}

function actSecureText(req) {
  if (req.instruction) return req.instruction;
  const types = req.actions.map((a) => String(a.type || "")).join(",");
  return `computer.act ${types || "empty"}`.slice(0, 400);
}

/**
 * Turn a natural-language instruction into actions without a second Cortex hop.
 * Recipes win (Word coworker, rewrite_selection, paste:). Then a tiny verb set
 * so another agent can say "type: hello" or "click 40 50".
 */
function defaultMatchRecipe(text) {
  try {
    return require("./recipes").matchRecipe(text);
  } catch {
    return null;
  }
}

function planFromInstruction(instruction, opts = {}) {
  const text = String(instruction || "").trim();
  if (!text) return { ok: false, reason: "empty instruction" };
  const match = typeof opts.matchRecipe === "function" ? opts.matchRecipe : defaultMatchRecipe;
  if (match) {
    const recipe = match(text);
    if (recipe && Array.isArray(recipe.actions) && recipe.actions.length) {
      return { ok: true, source: "recipe", id: recipe.id, actions: recipe.actions };
    }
  }
  if (/^(?:please\s+)?(?:observe|screenshot|screen info)$/i.test(text)) {
    return { ok: true, source: "observe", actions: [{ type: "observe" }] };
  }
  const click = text.match(
    /^(?:please\s+)?click(?:\s+(?:at|on))?\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s*%)?$/i
  );
  if (click) {
    const x = Number(click[1]);
    const y = Number(click[2]);
    if (x <= 100 && y <= 100) {
      return { ok: true, source: "click", actions: [{ type: "click", xPct: x, yPct: y }] };
    }
    return { ok: true, source: "click", actions: [{ type: "click", x, y }] };
  }
  const typed = text.match(/^(?:please\s+)?(?:type|dictate)\s*:\s*([\s\S]+)$/i);
  if (typed && typed[1].trim()) {
    return { ok: true, source: "type", actions: [{ type: "type", value: typed[1].trim() }] };
  }
  const press = text.match(/^(?:please\s+)?press\s+([a-z0-9+]+)$/i);
  if (press) {
    return { ok: true, source: "press", actions: [{ type: "press", value: press[1] }] };
  }
  const opened = text.match(/^(?:please\s+)?open\s*:\s*([\s\S]+)$/i);
  if (opened && opened[1].trim()) {
    return { ok: true, source: "open", actions: [{ type: "open", value: opened[1].trim() }] };
  }
  const focusHwnd = text.match(/^(?:please\s+)?focus\s+hwnd\s*:\s*(\d+)$/i);
  if (focusHwnd) {
    return {
      ok: true,
      source: "focus",
      actions: [{ type: "focus_hwnd", hwnd: focusHwnd[1] }],
    };
  }
  const delivered = text.match(/^(?:please\s+)?deliver\s*:\s*([\s\S]+)$/i);
  if (delivered && delivered[1].trim()) {
    const plan = deliverTextActions(delivered[1].trim(), {
      target: opts.target,
      via: "paste",
    });
    if (plan.ok) return { ok: true, source: "deliver", actions: plan.actions };
    return plan;
  }
  return { ok: false, reason: "no local plan for instruction" };
}

async function prepareComputerAct(params, deps = {}) {
  const req = parseActRequest(params);
  if (!req.actions.length && !req.instruction) {
    return { ok: false, reason: "computer.act needs actions or instruction" };
  }
  if (typeof deps.secure !== "function") {
    return { ok: false, blocked: true, reason: "no Cortex /dms/secure gate" };
  }
  const gate = await deps.secure({ text: actSecureText(req), request: req });
  if (!gate || gate.ok !== true) {
    return {
      ok: false,
      blocked: true,
      reason: (gate && (gate.reason || gate.text)) || "no Cortex /dms/secure gate",
    };
  }

  let actions = req.actions.slice();
  if (!actions.length) {
    let planned = null;
    if (typeof deps.plan === "function") {
      planned = await deps.plan(req.instruction, gate);
    } else {
      planned = planFromInstruction(req.instruction, { matchRecipe: deps.matchRecipe });
    }
    if (!planned || planned.ok === false) {
      return { ok: false, reason: (planned && planned.reason) || "plan failed" };
    }
    actions = Array.isArray(planned.actions) ? planned.actions : [];
  }
  if (!actions.length) return { ok: false, reason: "no actions" };

  const guarded = guardPlan(actions);
  const policy = typeof deps.policy === "function" ? deps.policy() : deps.policy || {};
  const reviewed = reviewPlan(guarded.actions, policy);
  const needsApproval = Boolean(reviewed.needsApproval) && !req.approved;
  return {
    ok: true,
    gated: true,
    needsApproval,
    autoOnly: Boolean(reviewed.autoOnly),
    actions: reviewed.actions,
    instruction: req.instruction,
    dropped: guarded.dropped || [],
  };
}

async function runComputerAct(params, deps = {}) {
  const prepared = await prepareComputerAct(params, deps);
  if (!prepared.ok) return prepared;
  if (prepared.needsApproval) {
    return {
      ...prepared,
      ran: false,
      reason: "needs approval; pass approved:true after a human nod",
    };
  }
  if (typeof deps.execute !== "function") {
    return { ...prepared, ran: false, reason: "executor missing" };
  }
  const results = await deps.execute(prepared.actions);
  return {
    ok: true,
    gated: true,
    ran: true,
    results,
    actions: prepared.actions,
  };
}

module.exports = {
  parseActRequest,
  actSecureText,
  planFromInstruction,
  prepareComputerAct,
  runComputerAct,
};
