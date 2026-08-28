"use strict";
/**
 * Plan guard — the gate between what a model emits and what touches the OS.
 *
 * Three defects this closes, all confirmed against the running code:
 *
 * 1. NO ALLOWLIST. ecosystem.js `_parseActions` accepted any object with a
 *    `.type`, and safety.js `classifyAction` defaults unknown verbs to
 *    CONSEQUENTIAL — which `autoRunSensible` then promotes to "auto". A
 *    hallucinated verb, or a real one the planner was never told about, would
 *    execute unreviewed. Only verbs the driver actually implements survive here.
 *
 * 2. `open`/`navigate` AUTO-RAN. Start-Process is a launch: it is not
 *    reversible by a second click, and it is the step that hands control to a
 *    different application. It now always requires a human beat.
 *
 * 3. STALE COORDINATES. The planner emits xPct/yPct from the plan-time
 *    screenshot, and `ensureActionCoords` returns early when coords are already
 *    present — so the mid-plan recapture never re-aimed anything. After any step
 *    that changes which app is in front, later coordinates describe a screen
 *    that no longer exists. We strip them so vision re-targets against what is
 *    actually on screen.
 *
 * Pure functions, no I/O — this is policy, and policy must be testable.
 */

/** Verb → driver support. Mirrors the perform() switch in driver.js. */
const DRIVER_ACTIONS = Object.freeze([
  "observe", "read", "wait",
  "movecursor", "hover", "click", "doubleclick", "rightclick",
  "type", "fill", "setvalue",
  "paste", "clipboard_paste", "clipboard_set", "clipboard_get",
  "copy_clipboard", "copy", "select_copy", "select_all",
  "press", "keypress", "scroll", "drag",
  "navigate", "open",
  "word_docx_write", "word_docx_append", "word_from_clipboard", "clipboard_verify",
  // Records what was on the clipboard BEFORE a copy, so the copy can be proven
  // to have happened (#16). Read-only.
  "clipboard_baseline",
  // Restore the remembered user window before dictation/scribe paste.
  "focus_hwnd",
]);

/** Verbs that hand control to another application. */
const LAUNCH_ACTIONS = Object.freeze(["open", "navigate"]);

/** Verbs whose target is a point on screen, so stale coords actively mislead. */
const AIMED_ACTIONS = Object.freeze([
  "click", "doubleclick", "rightclick", "hover", "movecursor",
  "type", "fill", "paste", "drag",
]);

const norm = (t) => String(t || "").toLowerCase().trim();

function isSupported(type) {
  return DRIVER_ACTIONS.includes(norm(type));
}

function isLaunch(type) {
  return LAUNCH_ACTIONS.includes(norm(type));
}

function isAimed(type) {
  return AIMED_ACTIONS.includes(norm(type));
}

/**
 * Strip coordinates from aimed actions that occur AFTER a launch, so the
 * targeting pass re-derives them from a fresh screenshot.
 *
 * Coordinates before the first launch still describe the screen the plan was
 * made against, so those are left alone — re-aiming everything would throw away
 * good information and cost a vision call per step.
 */
function stripStaleCoords(actions) {
  let switched = false;
  const stripped = [];
  const out = (actions || []).map((a) => {
    const type = norm(a && a.type);
    if (switched && isAimed(type) && (a.xPct != null || a.yPct != null)) {
      const { xPct, yPct, endXPct, endYPct, ...rest } = a;
      stripped.push(type);
      return { ...rest, _reaim: true };
    }
    if (isLaunch(type)) switched = true;
    return a;
  });
  return { actions: out, stripped };
}

/**
 * Full guard. Returns the cleaned plan plus what was changed and why, so the
 * UI can explain itself instead of silently mutating the user's plan.
 *
 * @param {Array<object>} actions
 * @param {{allowUnsupported?: boolean}} [opts]
 */
function guardPlan(actions, opts = {}) {
  const list = Array.isArray(actions) ? actions : [];
  const dropped = [];
  const supported = list.filter((a) => {
    const type = norm(a && a.type);
    if (!type) {
      dropped.push({ type: "(missing)", reason: "action has no type" });
      return false;
    }
    if (!isSupported(type) && !opts.allowUnsupported) {
      // The driver would return {ok:false, "unknown action type"} and break the
      // loop anyway — dropping it here makes the reason visible up front.
      dropped.push({ type, reason: "not implemented by the input driver" });
      return false;
    }
    return true;
  });

  const { actions: reaimed, stripped } = stripStaleCoords(supported);

  const guarded = reaimed.map((a) => {
    if (!isLaunch(a.type)) return a;
    return {
      ...a,
      // Consumed by safety.decide(); a launch never auto-runs.
      _requireConfirm: true,
      _confirmReason: `Launches ${a.url || a.target || a.value || "an application"}`,
    };
  });

  return {
    actions: guarded,
    dropped,
    reaimed: stripped,
    launches: guarded.filter((a) => a._requireConfirm).length,
    changed: dropped.length > 0 || stripped.length > 0,
  };
}

module.exports = {
  DRIVER_ACTIONS,
  LAUNCH_ACTIONS,
  AIMED_ACTIONS,
  isSupported,
  isLaunch,
  isAimed,
  stripStaleCoords,
  guardPlan,
};
