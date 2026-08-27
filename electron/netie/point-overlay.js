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
const BOX_RE =
  /\[BOX:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?::\s*([^\]]*?))?\s*\]/gi;

/** A teach layer that covers the screen in dots is not teaching anything. */
const MAX_POINTS = 8;
/** Long enough to look at, short enough not to become furniture. */
const DEFAULT_TTL_MS = 6000;

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

/**
 * @param {string} raw  assistant text, possibly containing POINT / BOX tokens
 * @returns {{text:string, points:Array<object>, dropped:number}}
 */
function parsePoints(raw) {
  const input = String(raw || "");
  if (!input) return { text: "", points: [], dropped: 0 };

  const points = [];
  let dropped = 0;

  let text = input.replace(BOX_RE, (_token, l, t, w, h, label) => {
    const box = clipBox(Number(l), Number(t), Number(w), Number(h));
    if (!box || points.length >= MAX_POINTS) {
      dropped += 1;
      return label ? String(label).trim() : "";
    }
    const clean = String(label || "").trim();
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

  return { text: text.replace(/[ \t]{2,}/g, " ").trim(), points, dropped };
}

/** True when the text is worth sending to the overlay at all. */
function hasPoints(raw) {
  return parsePoints(raw).points.length > 0;
}

/**
 * The event the HUD renders. `ttlMs` is carried with the payload so the overlay
 * never has to own a policy about how long a hint lives.
 */
function toOverlayEvent(raw, opts = {}) {
  const parsed = parsePoints(raw);
  const hold = Boolean(opts.hold);
  return {
    type: "point",
    points: parsed.points,
    hold,
    ttlMs: hold ? 0 : Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : DEFAULT_TTL_MS,
  };
}

module.exports = {
  POINT_RE,
  BOX_RE,
  MAX_POINTS,
  DEFAULT_TTL_MS,
  parsePoints,
  hasPoints,
  toOverlayEvent,
};
