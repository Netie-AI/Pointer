"use strict";
/**
 * P3-POINT-OVERLAY - a thin teach layer, not a buddy.
 *
 * When Netie explains "click here", pointing is worth more than a paragraph.
 * The answer text may contain `[POINT:42.1,31:Save]` tokens; this pulls them
 * out and hands back clean prose plus the coordinates to draw.
 *
 * Clicky-class teaching also uses `[LINE:x1,y1,x2,y2:label]` or ARROW,
 * `[PATH:x,y;x,y;...]` freehand strokes, and `[BOX:x,y,w,h:label]` (or RECT)
 * to frame a control. Deliberately not a companion: no
 * orb, no ring, no bubble, no character.
 *
 * Pure parsing - the renderer only draws what comes out of here.
 */

/** `[POINT:x,y]` or `[POINT:x,y:label]`, percentages of the screen. */
const POINT_RE = /\[POINT:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?::\s*([^\]]*?))?\s*\]/gi;
/** `[LINE:x1,y1,x2,y2]` or `[ARROW:...]` with optional label. */
const LINE_RE =
  /\[(?:LINE|ARROW):\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?::\s*([^\]]*?))?\s*\]/gi;
/** `[PATH:x,y;x,y;...]` or with a trailing `:label`. */
const PATH_RE = /\[PATH:\s*([^\]]+?)\]/gi;
/** `[BOX:x,y,w,h]` or RECT, percentages, optional label. */
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

function inRange(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function emptyParse() {
  return { text: "", points: [], lines: [], paths: [], boxes: [], dropped: 0 };
}

function splitPathLabel(inner) {
  const raw = String(inner || "");
  const colon = raw.lastIndexOf(":");
  if (colon <= 0) return { body: raw, label: "" };
  const maybe = raw.slice(colon + 1).trim();
  if (!maybe) return { body: raw.slice(0, colon), label: "" };
  if (/^-?\d+(?:\.\d+)?\s*,\s*-?\d/.test(maybe) || maybe.includes(";")) {
    return { body: raw, label: "" };
  }
  return { body: raw.slice(0, colon), label: maybe };
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
 * @param {string} raw  assistant text, possibly containing POINT/LINE tokens
 * @returns {{text:string, points:Array<{xPct:number,yPct:number,label:string}>, lines:Array, paths:Array, dropped:number}}
 */
function parsePoints(raw) {
  const input = String(raw || "");
  if (!input) return emptyParse();

  const points = [];
  const lines = [];
  const paths = [];
  const boxes = [];
  let dropped = 0;

  let text = input.replace(POINT_RE, (_token, x, y, label) => {
    const xPct = Number(x);
    const yPct = Number(y);
    if (!inRange(xPct) || !inRange(yPct) || points.length >= MAX_POINTS) {
      dropped += 1;
      return label ? String(label).trim() : "";
    }
    const clean = String(label || "").trim();
    points.push({ xPct, yPct, label: clean });
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

  text = text.replace(BOX_RE, (_token, x, y, w, h, label) => {
    const xPct = Number(x);
    const yPct = Number(y);
    const wPct = Number(w);
    const hPct = Number(h);
    const clean = String(label || "").trim();
    if (
      !inRange(xPct) ||
      !inRange(yPct) ||
      !inRange(wPct) ||
      !inRange(hPct) ||
      wPct <= 0 ||
      hPct <= 0 ||
      boxes.length >= MAX_BOXES
    ) {
      dropped += 1;
      return clean;
    }
    boxes.push({ xPct, yPct, wPct, hPct, label: clean });
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

/**
 * The event the HUD renders. `ttlMs` is carried with the payload so the overlay
 * never has to own a policy about how long a hint lives.
 */
function toOverlayEvent(raw, opts = {}) {
  const parsed = parsePoints(raw);
  return {
    type: "point",
    points: parsed.points,
    lines: parsed.lines,
    paths: parsed.paths,
    boxes: parsed.boxes,
    ttlMs: Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : DEFAULT_TTL_MS,
  };
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
};
