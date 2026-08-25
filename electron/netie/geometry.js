"use strict";
/**
 * Pure multi-monitor mapping helpers for Netie Clicks.
 * No Electron imports — unit-tested in test/geometry.test.js.
 *
 * Spaces:
 *   overlay-local  CSS px inside the fullscreen overlay window (origin = its display)
 *   screen DIP     Electron's logical desktop coordinates (screen API space)
 *   image px       physical pixels inside a per-display capture (DIP × scaleFactor)
 */

function _num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Overlay-local rect → global DIP screen rect (offset by the overlay's display). */
function overlayRegionToScreen(region, displayBounds) {
  const r = region || {};
  const b = displayBounds || { x: 0, y: 0 };
  return {
    x: Math.round(_num(r.x) + _num(b.x)),
    y: Math.round(_num(r.y) + _num(b.y)),
    width: Math.round(_num(r.width)),
    height: Math.round(_num(r.height)),
  };
}

/**
 * Global DIP region → clamped crop rect (image px) within one display's capture.
 * @param {object} region   { x, y, width, height } in DIP screen space
 * @param {object} display  { bounds: {x,y,width,height}, scaleFactor }
 * @param {object} [imageSize] { width, height } of the captured image
 * @returns {object|null} crop rect, or null when the intersection is empty
 */
function regionToDisplayCrop(region, display, imageSize) {
  if (!region || !display || !display.bounds) return null;
  const scale = display.scaleFactor || 1;
  let x = Math.round((_num(region.x) - _num(display.bounds.x)) * scale);
  let y = Math.round((_num(region.y) - _num(display.bounds.y)) * scale);
  let width = Math.round(_num(region.width) * scale);
  let height = Math.round(_num(region.height) * scale);
  if (x < 0) {
    width += x;
    x = 0;
  }
  if (y < 0) {
    height += y;
    y = 0;
  }
  if (imageSize) {
    width = Math.min(width, _num(imageSize.width) - x);
    height = Math.min(height, _num(imageSize.height) - y);
  }
  if (!(width > 0) || !(height > 0)) return null;
  return { x, y, width, height };
}

module.exports = { overlayRegionToScreen, regionToDisplayCrop };
