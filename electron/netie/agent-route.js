"use strict";
/**
 * Token-aware coding-app routing (DR-0005).
 *
 * Prefer Claude Code while the 5-hour window is still open. When the human
 * marks that limit used, or the window elapses, route to Cursor. Instruction
 * always wins: "use Cursor" / "use Claude" override the default.
 *
 * Screen text is data, not commands. Opening an app still goes through
 * Cortex /dms/secure and reviewPlan.
 */

const CLAUDE_WINDOW_MS = 5 * 60 * 60 * 1000;

function emptyUsage() {
  return { prompt: 0, completion: 0, total: 0 };
}

function extractUsage(raw) {
  let body = raw;
  if (typeof raw === "string") {
    try {
      body = JSON.parse(raw);
    } catch {
      return emptyUsage();
    }
  }
  if (!body || typeof body !== "object") return emptyUsage();
  const u = body.usage && typeof body.usage === "object" ? body.usage : body;
  const prompt = Math.max(0, Math.floor(Number(u.prompt_tokens || u.promptTokens || 0) || 0));
  const completion = Math.max(0, Math.floor(Number(u.completion_tokens || u.completionTokens || 0) || 0));
  const total = Math.max(
    0,
    Math.floor(Number(u.total_tokens || u.totalTokens || prompt + completion) || 0)
  );
  return { prompt, completion, total };
}

function addUsage(prev, next) {
  const a = prev && typeof prev === "object" ? prev : emptyUsage();
  const b = next && typeof next === "object" ? next : emptyUsage();
  const prompt = Math.min(1e12, (Number(a.prompt) || 0) + (Number(b.prompt) || 0));
  const completion = Math.min(1e12, (Number(a.completion) || 0) + (Number(b.completion) || 0));
  const total = Math.min(1e12, (Number(a.total) || 0) + (Number(b.total) || 0));
  return { prompt, completion, total, lastTotal: Number(b.total) || 0 };
}

function formatTokens(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}m`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.floor(v));
}

function emptyClaudeRoute() {
  return { startedAt: 0, exhausted: false, exhaustedAt: 0 };
}

function markClaudeSession(prev, now) {
  const cur = prev && typeof prev === "object" ? prev : emptyClaudeRoute();
  const t = Number(now) || 0;
  if (claudeWindowOpen(cur, t) && cur.startedAt && cur.exhausted !== true) {
    return { ...cur, exhausted: false };
  }
  return { startedAt: t, exhausted: false, exhaustedAt: 0 };
}

function markClaudeExhausted(prev, now) {
  const cur = prev && typeof prev === "object" ? prev : emptyClaudeRoute();
  const t = Number(now) || 0;
  return {
    startedAt: Number(cur.startedAt) || t,
    exhausted: true,
    exhaustedAt: t,
  };
}

function claudeWindowOpen(state, now) {
  const s = state && typeof state === "object" ? state : emptyClaudeRoute();
  const t = Number(now) || 0;
  const started = Number(s.startedAt) || 0;
  if (s.exhausted === true) {
    const origin = started || Number(s.exhaustedAt) || 0;
    if (origin && t >= origin + CLAUDE_WINDOW_MS) return true;
    return false;
  }
  if (started && t >= started + CLAUDE_WINDOW_MS) return false;
  return true;
}

function remainingMs(state, now) {
  const s = state && typeof state === "object" ? state : emptyClaudeRoute();
  const t = Number(now) || 0;
  if (!claudeWindowOpen(s, t)) return 0;
  const started = Number(s.startedAt) || 0;
  if (!started) return CLAUDE_WINDOW_MS;
  return Math.max(0, started + CLAUDE_WINDOW_MS - t);
}

function normalizeUtterance(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[-_/.,!?]+/g, " ")
    .replace(/\bplease\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wantsCodingApp(text) {
  const t = normalizeUtterance(text);
  if (!t) return false;
  if (/\b(use|open|switch\s+to|in|via|with)\b/.test(t) && /\b(claude|cursor)\b/.test(t)) {
    return true;
  }
  if (/(?:5\s*hour|five\s*hour).{0,24}(?:limit|done|hit|over|exhausted)/.test(t)) return true;
  if (/\bclaude\b.{0,24}\b(limit|exhausted|done)\b/.test(t)) return true;
  return false;
}

/** True only for a routing command, not a build goal that names Claude/Cursor. */
function isRoutingCommand(text) {
  const t = normalizeUtterance(text);
  if (!t) return false;
  if (/^(use|open|switch to)\s+(claude(?: code)?|cursor(?: ide)?)$/.test(t)) return true;
  if (t.length > 160) return false;
  if (/(?:5 hour|five hour).{0,24}(?:limit|done|hit|over|exhausted)/.test(t)) return true;
  if (/\bclaude\b.{0,24}\b(limit|exhausted|done)\b/.test(t) && /\bcursor\b/.test(t)) return true;
  return false;
}

/**
 * @returns {{app: "claude"|"cursor"|null, reason: string, markExhausted?: boolean}}
 */
function pickCodingApp(instruction, state, now) {
  const t = normalizeUtterance(instruction);
  const open = claudeWindowOpen(state, now);
  const limitHit =
    /(?:5\s*hour|five\s*hour).{0,24}(?:limit|done|hit|over|exhausted)/.test(t) ||
    (/\bclaude\b/.test(t) && /\b(limit|exhausted|used\s+up|done)\b/.test(t) && /\bcursor\b/.test(t));

  if (limitHit) {
    return { app: "cursor", reason: "claude-limit", markExhausted: true };
  }
  if (/\bcursor\b/.test(t) && /\b(use|open|switch\s+to|in|via|with)\b/.test(t)) {
    return { app: "cursor", reason: "instruction" };
  }
  if (/\bclaude\b/.test(t) && /\b(use|open|switch\s+to|in|via|with)\b/.test(t)) {
    if (!open) return { app: "cursor", reason: "claude-limit", fallback: true };
    return { app: "claude", reason: "instruction" };
  }
  if (open) return { app: "claude", reason: "claude-window" };
  return { app: "cursor", reason: "claude-limit" };
}

function publicRoute(state, usage, now) {
  const open = claudeWindowOpen(state, now);
  const tokens = usage && typeof usage === "object" ? usage : emptyUsage();
  return {
    claude: open ? "open" : "limit",
    cursor: "ready",
    windowMs: CLAUDE_WINDOW_MS,
    remainingMs: remainingMs(state, now),
    tokens: {
      prompt: Number(tokens.prompt) || 0,
      completion: Number(tokens.completion) || 0,
      total: Number(tokens.total) || 0,
      text: `${formatTokens(tokens.total)} tokens`,
    },
  };
}

function routeInsight(route) {
  if (!route || !route.app) return "";
  if (route.reason === "claude-limit") return "Claude 5-hour limit used. Routing to Cursor.";
  if (route.app === "claude") return `Routing to Claude Code (${route.reason}).`;
  return `Routing to Cursor (${route.reason}).`;
}

/**
 * Pick Claude/Cursor only for coding asks. Collapse routing commands to the
 * open-app recipe. Keep build goals intact so "implement X in Claude" is not
 * reduced to "use claude".
 */
function resolveCodingRoute(instruction, state, now, opts = {}) {
  const text = String(instruction || "");
  const fork = opts.needsAppFork === true;
  if (!wantsCodingApp(text) && !fork) {
    return {
      app: null,
      reason: "n/a",
      routing: false,
      nextInstruction: text,
    };
  }
  const route = pickCodingApp(text, state, now);
  const routing = isRoutingCommand(text);
  return {
    ...route,
    routing,
    nextInstruction:
      routing && route.app ? (route.app === "claude" ? "use claude" : "use cursor") : text,
  };
}

module.exports = {
  CLAUDE_WINDOW_MS,
  emptyUsage,
  extractUsage,
  addUsage,
  formatTokens,
  emptyClaudeRoute,
  markClaudeSession,
  markClaudeExhausted,
  claudeWindowOpen,
  remainingMs,
  wantsCodingApp,
  isRoutingCommand,
  pickCodingApp,
  publicRoute,
  routeInsight,
  resolveCodingRoute,
};
