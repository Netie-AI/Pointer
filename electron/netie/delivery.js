"use strict";
/**
 * OpenWillow-class text delivery: remember the user's window, then type or
 * paste into it. First-party Pointer code. Do not dump GPLv3 OpenWillow.
 *
 * The HUD often steals focus when a mode pill is clicked. Capture the last
 * non-Pointer foreground window so dictation/scribe still land in Notepad,
 * Word, or the browser the user was in.
 */

const POINTER_CHROME = Object.freeze([
  /netie pointer/i,
  /netie clicks/i,
  /pointer hud/i,
]);

function isPointerChrome(fg = {}) {
  const title = String(fg.title || "");
  const proc = String(fg.proc || "");
  return POINTER_CHROME.some((re) => re.test(title) || re.test(proc));
}

function snapshotTarget(fg = {}, opts = {}) {
  if (!fg || typeof fg !== "object") return { ok: false, reason: "no target" };
  if (isPointerChrome(fg)) return { ok: false, reason: "skipped pointer chrome" };
  const hwnd = String(fg.hwnd || fg.handle || "").trim();
  const title = String(fg.title || "").trim();
  const proc = String(fg.proc || "").trim();
  const hasHwnd = Boolean(hwnd) && hwnd !== "0";
  const hasName = Boolean(title) && title !== "?";
  if (!hasHwnd && !hasName && (!proc || proc === "?")) {
    return { ok: false, reason: "no target" };
  }
  return {
    ok: true,
    hwnd: hasHwnd ? hwnd : "0",
    title: hasName ? title : "",
    proc: proc && proc !== "?" ? proc : "",
    at: Number(opts.now) || Date.now(),
  };
}

function isUsableTarget(target) {
  return Boolean(target && target.ok !== false && (String(target.hwnd || "") !== "0" || target.title));
}

/**
 * Actions that restore the remembered window then insert text.
 * Prefer clipboard paste for Unicode; `via: "type"` uses SendInput Unicode.
 */
function deliverTextActions(text, opts = {}) {
  const value = String(text || "");
  if (!value) return { ok: false, reason: "empty text" };
  const actions = [];
  const hwnd = opts.target && String(opts.target.hwnd || "").trim();
  if (hwnd && hwnd !== "0") {
    actions.push({ type: "focus_hwnd", hwnd });
  }
  if (opts.replace) {
    actions.push({ type: "press", value: "backspace" });
  }
  if (opts.via === "type") {
    actions.push({ type: "type", value });
  } else {
    actions.push({ type: "clipboard_paste", value });
  }
  return { ok: true, actions };
}

function publicTarget(target) {
  if (!isUsableTarget(target)) {
    return { present: false, title: "", hwnd: false };
  }
  return {
    present: true,
    title: String(target.title || "").slice(0, 80),
    hwnd: String(target.hwnd || "") !== "0",
  };
}

/** Electron `desktopCapturer` window id is `window:<hwnd>:<generation>`. */
function parseWindowSourceHwnd(id) {
  const parts = String(id || "").split(":");
  if (parts[0] !== "window") return "";
  return String(parts[1] || "").trim();
}

/**
 * Pick the remembered app's window thumbnail. Skip Pointer chrome.
 * No hwnd/title match returns null so the caller can crop the display.
 */
function pickWindowSource(sources, target = {}) {
  const list = Array.isArray(sources) ? sources : [];
  const usable = list.filter((s) => s && !isPointerChrome({ title: s.name }));
  const hwnd = String(target.hwnd || "").trim();
  if (hwnd && hwnd !== "0") {
    const hit = usable.find((s) => parseWindowSourceHwnd(s.id) === hwnd);
    if (hit) return hit;
  }
  const title = String(target.title || "").trim().toLowerCase();
  if (!title) return null;
  const exact = usable.find((s) => String(s.name || "").toLowerCase() === title);
  if (exact) return exact;
  return usable.find((s) => String(s.name || "").toLowerCase().includes(title)) || null;
}

module.exports = {
  POINTER_CHROME,
  isPointerChrome,
  snapshotTarget,
  isUsableTarget,
  deliverTextActions,
  publicTarget,
  parseWindowSourceHwnd,
  pickWindowSource,
};
