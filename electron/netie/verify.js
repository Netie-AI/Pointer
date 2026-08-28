"use strict";
/**
 * WP-P2-VERIFY-DEFAULT — decide which steps are worth verifying.
 *
 * Post-step verification is a screenshot fingerprint before and after an action.
 * It costs two full captures per step and it is noisy: a blinking caret or a
 * clock tick changes the bytes, so "the screen changed" is weak evidence that
 * the right thing happened. That is why `settings.verifySteps` ships off.
 *
 * But off-for-everything is the wrong default too. The steps where a silent
 * no-op actually hurts are the ones you cannot take back — clicking Send, Pay,
 * Delete — and the ones that hand the machine to another application, where a
 * failed launch means every later coordinate aims at the wrong window. Those
 * are few, so verifying them is cheap, and they are exactly the steps where a
 * wrong answer is expensive.
 *
 * So: verify irreversible and launch steps by default; everything else only
 * when the user explicitly asks for it. Pure policy, no I/O.
 */

const { isIrreversible } = require("./safety");
const { isLaunch } = require("./plan-guard");

/** Verbs whose effect is visible on screen — verifying a `wait` proves nothing. */
const OBSERVABLE = Object.freeze([
  "click", "doubleclick", "rightclick", "uia_toggle", "uia_expand", "type", "fill", "drag",
  // `keypress` is a real driver verb (driver.js) and safety classifies it as
  // consequential — omitting it meant an irreversible Enter was never verified,
  // not even with settings.verifySteps on, and reported "n/a" rather than
  // "skipped". Kept in step with plan-guard's DRIVER_ACTIONS.
  "paste", "clipboard_paste", "setvalue", "press", "keypress", "navigate", "open",
  "focus_hwnd",
]);

function isObservable(type) {
  return OBSERVABLE.includes(String(type || "").toLowerCase());
}

/**
 * @param {object} action  a reviewed action (safety annotations respected if present)
 * @param {object} [opts]
 *   verifyAll  — settings.verifySteps: verify every observable step
 *   hasRegion  — false when there is no capture region to fingerprint
 * @returns {{verify:boolean, reason:string}}
 */
function shouldVerifyStep(action, opts = {}) {
  if (!action || typeof action !== "object") return { verify: false, reason: "no-action" };
  const type = String(action.type || "").toLowerCase();

  if (opts.hasRegion === false) return { verify: false, reason: "no-region" };
  if (!isObservable(type)) return { verify: false, reason: "not-observable" };

  if (opts.verifyAll === true) return { verify: true, reason: "settings.verifySteps" };

  // safety.decide() already computed this for reviewed plans; recompute for raw
  // ones so the default does not depend on who called us.
  const irreversible =
    (action.safety && action.safety.irreversible === true) || isIrreversible(action);
  if (irreversible) return { verify: true, reason: "irreversible" };
  if (isLaunch(type)) return { verify: true, reason: "launch" };

  return { verify: false, reason: "routine" };
}

/** How a step's verification should be reported when it was not run. */
function verdictWhenSkipped(reason) {
  return reason === "no-region" || reason === "not-observable" ? "n/a" : "skipped";
}

module.exports = { OBSERVABLE, isObservable, shouldVerifyStep, verdictWhenSkipped };
