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

function aimedPoint(type, xRaw, yRaw) {
  const x = Number(xRaw);
  const y = Number(yRaw);
  if (x <= 100 && y <= 100) return { type, xPct: x, yPct: y };
  return { type, x, y };
}

function parseAimedInstruction(type, text) {
  const re = new RegExp(
    `^(?:please\\s+)?${type}(?:\\s+(?:at|on))?\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)(?:\\s*%)?$`,
    "i"
  );
  const hit = text.match(re);
  if (!hit) return null;
  return { ok: true, source: type, actions: [aimedPoint(type, hit[1], hit[2])] };
}

function parseNamedInstruction(type, text) {
  const re = new RegExp(`^(?:please\\s+)?${type}\\s*:\\s*([^\\d][\\s\\S]*)$`, "i");
  const hit = text.match(re);
  if (!hit || !String(hit[1] || "").trim()) return null;
  return { ok: true, source: type, actions: [{ type, target: hit[1].trim() }] };
}

function findWindow(windows, want) {
  const needle = String(want || "").trim().toLowerCase();
  if (!needle) return null;
  const list = Array.isArray(windows) ? windows : [];
  return (
    list.find((w) => {
      const title = String((w && w.title) || "").toLowerCase();
      const proc = String((w && w.proc) || "").toLowerCase();
      return title.includes(needle) || proc.includes(needle);
    }) || null
  );
}

function windowClickPoint(win) {
  if (!win) return null;
  const x = Number(win.x);
  const y = Number(win.y);
  const width = Number(win.width);
  const height = Number(win.height);
  if (width > 0 && height > 0 && Number.isFinite(x) && Number.isFinite(y)) {
    return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
  }
  if (win.cx != null && win.cy != null) {
    const cx = Number(win.cx);
    const cy = Number(win.cy);
    if (Number.isFinite(cx) && Number.isFinite(cy)) return { x: Math.round(cx), y: Math.round(cy) };
  }
  return null;
}

const MAX_CHAIN = 8;

function looksLocalStep(text) {
  return /^(?:please\s+)?(?:observe|screenshot|screen info|type\s*:|dictate\s*:|click|doubleclick|rightclick|hover|toggle\s*:|check\s*:|uncheck\s*:|expand\s*:|collapse\s*:|wait|scroll|press\s+|open\s*:|focus|deliver\s*:|replace\s*:|copy|paste|select)/i.test(
    String(text || "").trim()
  );
}

function splitInstructionSteps(instruction) {
  const text = String(instruction || "").trim();
  if (!text) return [];
  const parts = text
    .split(/\s+then\s+|;\s*|\n+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return [text];
  if (!parts.every(looksLocalStep)) return [text];
  return parts.slice(0, MAX_CHAIN);
}

function planOneInstruction(instruction, opts = {}) {
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
  const waited = text.match(/^(?:please\s+)?wait(?:\s|:)\s*(\d+)\s*(?:ms|milliseconds?)?$/i);
  if (waited) {
    const ms = Math.min(10000, Math.max(0, Number(waited[1])));
    return { ok: true, source: "wait", actions: [{ type: "wait", ms }] };
  }
  const scrolled = text.match(
    /^(?:please\s+)?scroll(?:\s+(?:at|on))?(?:\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?))?\s+(up|down)$/i
  );
  if (scrolled) {
    const dir = String(scrolled[3] || "down").toLowerCase();
    const action = { type: "scroll", deltaY: dir === "down" ? 120 : -120 };
    if (scrolled[1] != null && scrolled[2] != null) {
      const pt = aimedPoint("scroll", scrolled[1], scrolled[2]);
      if (pt.xPct != null) {
        action.xPct = pt.xPct;
        action.yPct = pt.yPct;
      } else {
        action.x = pt.x;
        action.y = pt.y;
      }
    }
    return { ok: true, source: "scroll", actions: [action] };
  }
  for (const kind of ["click", "doubleclick", "rightclick", "hover"]) {
    const aimed = parseAimedInstruction(kind, text);
    if (aimed) return aimed;
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
  const focusTitle = text.match(/^(?:please\s+)?focus\s*:\s*([\s\S]+)$/i);
  if (focusTitle && focusTitle[1].trim()) {
    const hit = findWindow(opts.windows, focusTitle[1]);
    if (hit && hit.hwnd && String(hit.hwnd) !== "0") {
      return {
        ok: true,
        source: "focus",
        actions: [{ type: "focus_hwnd", hwnd: String(hit.hwnd) }],
      };
    }
    return { ok: false, reason: "no matching window" };
  }
  const windowClick = text.match(
    /^(?:please\s+)?(click|doubleclick|rightclick|hover)\s+window\s*:\s*([\s\S]+)$/i
  );
  if (windowClick && windowClick[2].trim()) {
    const kind = String(windowClick[1] || "click").toLowerCase();
    const hit = findWindow(opts.windows, windowClick[2]);
    if (!hit) return { ok: false, reason: "no matching window" };
    const pt = windowClickPoint(hit);
    if (!pt) return { ok: false, reason: "no window rect" };
    return {
      ok: true,
      source: "click-window",
      actions: [{ type: kind, x: pt.x, y: pt.y }],
    };
  }
  for (const kind of ["click", "doubleclick", "rightclick", "hover"]) {
    const named = parseNamedInstruction(kind, text);
    if (named) return named;
  }
  const toggled = text.match(/^(?:please\s+)?(toggle|check|uncheck)\s*:\s*(.+)$/i);
  if (toggled && String(toggled[2] || "").trim()) {
    const kind = String(toggled[1] || "toggle").toLowerCase();
    const want = kind === "check" ? "on" : kind === "uncheck" ? "off" : "flip";
    return {
      ok: true,
      source: kind,
      actions: [{ type: "uia_toggle", target: String(toggled[2]).trim(), want }],
    };
  }
  const expanded = text.match(/^(?:please\s+)?(expand|collapse)\s*:\s*(.+)$/i);
  if (expanded && String(expanded[2] || "").trim()) {
    const kind = String(expanded[1] || "expand").toLowerCase();
    const want = kind === "collapse" ? "collapse" : "expand";
    return {
      ok: true,
      source: kind,
      actions: [{ type: "uia_expand", target: String(expanded[2]).trim(), want }],
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
  const replaced = text.match(/^(?:please\s+)?replace\s*:\s*([\s\S]+)$/i);
  if (replaced && replaced[1].trim()) {
    const plan = deliverTextActions(replaced[1].trim(), {
      target: opts.target,
      via: "paste",
      replace: true,
    });
    if (plan.ok) return { ok: true, source: "replace", actions: plan.actions };
    return plan;
  }
  return { ok: false, reason: "no local plan for instruction" };
}

function planFromInstruction(instruction, opts = {}) {
  const text = String(instruction || "").trim();
  if (!text) return { ok: false, reason: "empty instruction" };
  const steps = splitInstructionSteps(text);
  if (steps.length < 2) return planOneInstruction(text, opts);
  const actions = [];
  for (const step of steps) {
    const planned = planOneInstruction(step, opts);
    if (!planned || planned.ok === false) {
      return { ok: false, reason: (planned && planned.reason) || "chain step failed", step };
    }
    actions.push(...(planned.actions || []));
  }
  if (!actions.length) return { ok: false, reason: "no local plan for instruction" };
  return { ok: true, source: "chain", actions };
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
      planned = planFromInstruction(req.instruction, {
        matchRecipe: deps.matchRecipe,
        windows: deps.windows,
        target: deps.target,
      });
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
  splitInstructionSteps,
  planOneInstruction,
  planFromInstruction,
  findWindow,
  windowClickPoint,
  prepareComputerAct,
  runComputerAct,
  MAX_CHAIN,
};
