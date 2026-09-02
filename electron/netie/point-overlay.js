"use strict";
/**
 * P3-POINT-OVERLAY — a thin teach layer, not a buddy.
 *
 * When Netie explains "click here", pointing is worth more than a paragraph.
 * The answer text may contain `[POINT:42.1,31:Save]` tokens; this pulls them
 * out and hands back clean prose plus the coordinates to draw.
 *
 * Measured UIA walkthroughs also emit `[BOX:left,top,w,h:label]` so the overlay
 * can draw around a real control instead of guessing a dot. Vision still uses
 * POINT only. Neither token is a click. Neither is a companion.
 *
 * Deliberately not a companion: no orb, no ring, no bubble, no character. A
 * crosshair, an optional measured box, and a label that fade.
 *
 * Pure parsing — the renderer only draws what comes out of here.
 */

/** `[POINT:x,y]` or `[POINT:x,y:label]`, percentages of the screen. */
const POINT_RE = /\[POINT:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?::\s*([^\]]*?))?\s*\]/gi;
/** `[BOX:left,top,w,h:label]` — measured top-left box, percentages. */
/** `[LINE:x1,y1,x2,y2]` or `[ARROW:...]` with optional label. */
const LINE_RE =
  /\[(?:LINE|ARROW):\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?::\s*([^\]]*?))?\s*\]/gi;
/** `[PATH:x,y;x,y;...]` or with a trailing `:label`. */
const PATH_RE = /\[PATH:\s*([^\]]+?)\]/gi;
const BOX_RE =
  /\[(?:BOX|RECT):\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?::\s*([^\]]*?))?\s*\]/gi;

/** A teach layer that covers the screen in dots is not teaching anything. */
const MAX_POINTS = 8;
const MAX_LINES = 6;
const MAX_PATHS = 4;
const MAX_PATH_PTS = 24;
const MAX_BOXES = 6;
/** Long enough to look at, short enough not to become furniture. */
const DEFAULT_TTL_MS = 6000;

function emptyParse() {
  return { text: "", points: [], lines: [], paths: [], boxes: [], dropped: 0 };
}

function splitPathLabel(inner) {
  const raw = String(inner || "");
  const colon = raw.lastIndexOf(":");
  if (colon <= 0) return { body: raw, label: "" };
  const maybe = raw.slice(colon + 1).trim();
  if (!maybe) return { body: raw.slice(0, colon), label: "" };
  if (/[;,]/.test(maybe)) return { body: raw, label: "" };
  return { body: raw.slice(0, colon), label: maybe };
}

function inRange(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function clipBox(leftPct, topPct, wPct, hPct) {
  if (!inRange(leftPct) || !inRange(topPct) || !(wPct > 0) || !(hPct > 0)) return null;
  if (leftPct >= 100 || topPct >= 100) return null;
  const right = Math.min(100, leftPct + wPct);
  const bottom = Math.min(100, topPct + hPct);
  const w = right - leftPct;
  const h = bottom - topPct;
  if (w < 0.4 || h < 0.4) return null;
  return { leftPct, topPct, wPct: w, hPct: h };
}

function parsePathPoints(body) {
  const pts = [];
  for (const part of String(body).split(";")) {
    const m = String(part).trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) continue;
    const xPct = Number(m[1]);
    const yPct = Number(m[2]);
    if (!inRange(xPct) || !inRange(yPct)) continue;
    if (pts.length >= MAX_PATH_PTS) break;
    pts.push({ xPct, yPct });
  }
  return pts;
}

/**
 * @param {string} raw  assistant text, possibly containing POINT / LINE / PATH / BOX tokens
 * @returns {{text:string, points:Array, lines:Array, paths:Array, boxes:Array, dropped:number}}
 */
function parsePoints(raw) {
  const input = String(raw || "");
  if (!input) return emptyParse();

  const points = [];
  const lines = [];
  const paths = [];
  const boxes = [];
  let dropped = 0;

  let text = input.replace(BOX_RE, (_token, l, t, w, h, label) => {
    const box = clipBox(Number(l), Number(t), Number(w), Number(h));
    const clean = String(label || "").trim();
    if (!box || boxes.length >= MAX_BOXES || points.length >= MAX_POINTS) {
      dropped += 1;
      return clean;
    }
    boxes.push({ xPct: box.leftPct, yPct: box.topPct, wPct: box.wPct, hPct: box.hPct, label: clean });
    points.push({
      xPct: box.leftPct + box.wPct / 2,
      yPct: box.topPct + box.hPct / 2,
      leftPct: box.leftPct,
      topPct: box.topPct,
      wPct: box.wPct,
      hPct: box.hPct,
      label: clean,
      kind: "box",
    });
    return clean;
  });

  text = text.replace(POINT_RE, (_token, x, y, label) => {
    const xPct = Number(x);
    const yPct = Number(y);
    if (!inRange(xPct) || !inRange(yPct) || points.length >= MAX_POINTS) {
      dropped += 1;
      return label ? String(label).trim() : "";
    }
    const clean = String(label || "").trim();
    points.push({ xPct, yPct, label: clean, kind: "point" });
    return clean;
  });

  text = text.replace(LINE_RE, (_token, x1, y1, x2, y2, label) => {
    const a = Number(x1);
    const b = Number(y1);
    const c = Number(x2);
    const d = Number(y2);
    if (!inRange(a) || !inRange(b) || !inRange(c) || !inRange(d) || lines.length >= MAX_LINES) {
      dropped += 1;
      return label ? String(label).trim() : "";
    }
    const clean = String(label || "").trim();
    lines.push({ x1Pct: a, y1Pct: b, x2Pct: c, y2Pct: d, label: clean });
    return clean;
  });

  text = text.replace(PATH_RE, (_token, inner) => {
    const { body, label } = splitPathLabel(inner);
    const pts = parsePathPoints(body);
    const clean = String(label || "").trim();
    if (pts.length < 2 || paths.length >= MAX_PATHS) {
      dropped += 1;
      return clean;
    }
    paths.push({ points: pts, label: clean });
    return clean;
  });

  return { text: text.replace(/[ \t]{2,}/g, " ").trim(), points, lines, paths, boxes, dropped };
}

/** True when the text is worth sending to the overlay at all. */
function hasPoints(raw) {
  const parsed = parsePoints(raw);
  return (
    parsed.points.length > 0 ||
    parsed.lines.length > 0 ||
    parsed.paths.length > 0 ||
    parsed.boxes.length > 0
  );
}

function clipStroke(stroke) {
  if (!Array.isArray(stroke)) return [];
  const out = [];
  const limit = Math.min(stroke.length, 80);
  for (let i = 0; i < limit; i++) {
    const p = stroke[i];
    const x = Number(p && (p.x != null ? p.x : p.xPct));
    const y = Number(p && (p.y != null ? p.y : p.yPct));
    if (!inRange(x) || !inRange(y)) continue;
    out.push({ x, y });
  }
  return out.length >= 2 ? out : [];
}

function laterOverlayPoints(path) {
  const list = Array.isArray(path) ? path : [];
  const out = [];
  for (const p of list) {
    if (p && p.now) continue;
    const box = clipBox(Number(p && p.leftPct), Number(p && p.topPct), Number(p && p.wPct), Number(p && p.hPct));
    if (!box || out.length >= MAX_POINTS) continue;
    const row = {
      xPct: box.leftPct + box.wPct / 2,
      yPct: box.topPct + box.hPct / 2,
      leftPct: box.leftPct,
      topPct: box.topPct,
      wPct: box.wPct,
      hPct: box.hPct,
      label: String((p && p.label) || "").trim(),
      kind: "box",
      later: Boolean(p && p.later),
      done: !Boolean(p && p.later),
    };
    if (p && p.cue) row.cue = String(p.cue);
    const stroke = clipStroke(p && p.stroke);
    if (stroke.length) row.stroke = stroke;
    stampOverlayFace(row);
    out.push(row);
  }
  return out;
}

/**
 * The event the HUD renders. `ttlMs` is carried with the payload so the overlay
 * never has to own a policy about how long a hint lives.
 * `path` later/done boxes are dashed catalog marks. Current tokens stay on top.
 */
function toOverlayEvent(raw, opts = {}) {
  const parsed = parsePoints(raw);
  const later = laterOverlayPoints(opts.path);
  const points = later.concat(stampCurrentAction(parsed.points, opts));
  return {
    type: "point",
    points,
    lines: parsed.lines || [],
    paths: parsed.paths || [],
    boxes: parsed.boxes || [],
    hold: Boolean(opts.hold),
    ttlMs: holdTtl(opts),
  };
}

function holdTtl(opts) {
  const hold = Boolean(opts && opts.hold);
  if (hold) return 0;
  return Number(opts && opts.ttlMs) > 0 ? Number(opts.ttlMs) : DEFAULT_TTL_MS;
}

/**
 * Current hold label is the action (Click Save / Type in Email), not the
 * numbered catalog name. BOX tokens stay `1 Save`. Never a buddy.
 */
function overlayControlFace(cue) {
  const t = String(cue || "").toLowerCase();
  if (/\btype in\b|\bedit\b|\bemail\b|\bfield\b|\binput\b/.test(t)) return "field";
  if (/\bclick\b|\bsave\b|\bcancel\b|\bbutton\b|\bsubmit\b/.test(t)) return "button";
  return "region";
}

function overlayControlCaption(cue) {
  return (
    String(cue || "control")
      .replace(/^\d+\s+of\s+\d+\s+/i, "")
      .replace(/^\d+\s+/, "")
      .replace(/^(type in|click|look at)\s+/i, "")
      .replace(/\s+then\s+tab$/i, "")
      .trim()
      .slice(0, 24) || "control"
  );
}

function stampOverlayFace(point) {
  if (!point || !(Number(point.wPct) > 0)) return point;
  const cue = String(point.cue || point.label || "");
  point.face = overlayControlFace(cue);
  point.caption = overlayControlCaption(cue);
  return point;
}

function overlayActionLabel(cue, stepCue) {
  const step = String(stepCue || "").trim();
  if (step) return step.slice(0, 40);
  const raw = String(cue || "")
    .trim()
    .replace(/^\d+\s+of\s+\d+\s+/i, "")
    .trim();
  return raw.slice(0, 40);
}

function stampCurrentAction(points, opts) {
  const path = Array.isArray(opts && opts.path) ? opts.path : [];
  let now = null;
  for (let i = 0; i < path.length; i++) {
    if (path[i] && path[i].now) {
      now = path[i];
      break;
    }
  }
  const action = overlayActionLabel((opts && opts.cue) || "", now && now.cue);
  const key = String((now && now.key) || "").slice(0, 12);
  return (Array.isArray(points) ? points : []).map((p) => {
    if (!p || p.later || p.done) return p;
    const next = Object.assign({}, p);
    if (action) next.label = action;
    if (key) next.key = key;
    const stroke = clipStroke(now && now.stroke);
    if (stroke.length) next.stroke = stroke;
    stampOverlayFace(next);
    return next;
  });
}

module.exports = {
  POINT_RE,
  LINE_RE,
  PATH_RE,
  BOX_RE,
  MAX_POINTS,
  MAX_LINES,
  MAX_PATHS,
  MAX_PATH_PTS,
  MAX_BOXES,
  DEFAULT_TTL_MS,
  parsePoints,
  hasPoints,
  toOverlayEvent,
  laterOverlayPoints,
  overlayActionLabel,
  overlayControlFace,
  overlayControlCaption,
  stampCurrentAction,
  clipBox,
};
