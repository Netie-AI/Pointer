"use strict";
/**
 * P3-POINT-OVERLAY — a thin teach layer, not a buddy.
 *
 * When Netie explains "click here", pointing is worth more than a paragraph.
 * The answer text may contain `[POINT:42.1,31:Save]` tokens; this pulls them
 * out and hands back clean prose plus the coordinates to draw.
 *
 * Deliberately not a companion: no orb, no ring, no bubble, no character. A
 * crosshair and a label that fade. The floating Clicky chrome was removed for
 * good reasons and this must not smuggle it back in a new hat.
 *
 * Pure parsing — the renderer only draws what comes out of here.
 */

/** `[POINT:x,y]` or `[POINT:x,y:label]`, percentages of the screen. */
const POINT_RE = /\[POINT:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?::\s*([^\]]*?))?\s*\]/gi;

/** A teach layer that covers the screen in dots is not teaching anything. */
const MAX_POINTS = 8;
/** Long enough to look at, short enough not to become furniture. */
const DEFAULT_TTL_MS = 6000;

function inRange(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * @param {string} raw  assistant text, possibly containing POINT tokens
 * @returns {{text:string, points:Array<{xPct:number,yPct:number,label:string}>, dropped:number}}
 */
function parsePoints(raw) {
  const input = String(raw || "");
  if (!input) return { text: "", points: [], dropped: 0 };

  const points = [];
  let dropped = 0;

  const text = input.replace(POINT_RE, (_token, x, y, label) => {
    const xPct = Number(x);
    const yPct = Number(y);
    // Off-screen coordinates are a model error, not an instruction to click the
    // edge. Drop the point but keep the label so the sentence still reads.
    if (!inRange(xPct) || !inRange(yPct) || points.length >= MAX_POINTS) {
      dropped += 1;
      return label ? String(label).trim() : "";
    }
    const clean = String(label || "").trim();
    points.push({ xPct, yPct, label: clean });
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
  return {
    type: "point",
    points: parsed.points,
    ttlMs: Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : DEFAULT_TTL_MS,
  };
}

module.exports = { POINT_RE, MAX_POINTS, DEFAULT_TTL_MS, parsePoints, hasPoints, toOverlayEvent };
