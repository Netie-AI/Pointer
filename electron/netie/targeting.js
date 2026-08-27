"use strict";
/**
 * Targeting — resolve missing click coords from a target label.
 *
 * Two sources, in this order (P3-UIA-TARGETING):
 *
 *   1. UI Automation. The OS knows where its own controls are. Exact, ~1ms, no
 *      network, and the screenshot never leaves the process.
 *   2. Vision. For everything UIA cannot see — canvas apps, games, remote
 *      desktops, custom-drawn UI — which is a permanent category, not a gap.
 *
 * The fallback is recorded on the action (`_targetedVia`) so a plan that quietly
 * became model-guided is visible rather than assumed exact.
 */

const { findControl } = require("./uia");

/** True when the action already names a screen point (pct, DIP, or physical). */
function hasScreenPoint(action) {
  if (!action || typeof action !== "object") return false;
  if (action.xPct != null && action.yPct != null) return true;
  if (action.screenX != null && action.screenY != null) return true;
  if (action.x != null && action.y != null) return true;
  return false;
}

/**
 * @param {object} opts
 * @param {string} opts.target
 * @param {string|null} opts.dataUrl
 * @param {import('./ecosystem').NetieEcosystem} opts.eco
 * @returns {Promise<{xPct:number,yPct:number}|null>}
 */
async function resolveTargetPoint({ target, dataUrl, eco }) {
  const label = String(target || "").trim();
  if (!label || !dataUrl || !eco) return null;

  const system = [
    "You locate one UI control in a screenshot.",
    "Reply ONLY with JSON: {\"xPct\":0-100,\"yPct\":0-100} for the control center.",
    "If not visible, reply {\"xPct\":null,\"yPct\":null}.",
  ].join("\n");

  try {
    const chatUrl =
      typeof eco.chatCompletionsUrl === "function"
        ? eco.chatCompletionsUrl()
        : `${String((eco.cfg && eco.cfg.openvaultUrl) || "http://127.0.0.1:5000").replace(/\/$/, "")}/v1/chat/completions`;
    const model =
      typeof eco.chatModel === "function"
        ? eco.chatModel()
        : (eco.cfg && eco.cfg.model) || "gemini-2.0-flash";
    const res = await eco._post(
      chatUrl,
      {
        model,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: `Find: ${label}` },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 80,
        temperature: 0,
      },
      {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-openfree-identity": `${eco.cfg.deviceId}`,
      }
    );
    const raw = await res.text();
    let text = raw;
    try {
      const j = JSON.parse(raw);
      text = j?.choices?.[0]?.message?.content ?? raw;
    } catch {
      /* raw */
    }
    const start = String(text).indexOf("{");
    const end = String(text).lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const obj = JSON.parse(String(text).slice(start, end + 1));
    const xPct = Number(obj.xPct);
    const yPct = Number(obj.yPct);
    if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) return null;
    if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return null;
    return { xPct, yPct };
  } catch {
    return null;
  }
}

/**
 * Ensure an action has coords for the driver. Mutates a shallow copy.
 *
 * @param {object} opts
 *   dataUrl  screenshot for the vision fallback
 *   eco      ecosystem (vision transport)
 *   uia      { run, screen } — omit to skip UIA (tests, non-Windows)
 */
async function ensureActionCoords(action, { dataUrl, eco, uia = null }) {
  const type = String(action.type || "").toLowerCase();
  const needs =
    type === "click" ||
    type === "doubleclick" ||
    type === "rightclick" ||
    type === "hover" ||
    type === "movecursor" ||
    // Typing benefits too: with coords the driver clicks the field first, so
    // text can't land in whatever window happens to hold focus.
    type === "type" ||
    type === "fill" ||
    type === "paste" ||
    type === "setvalue";
  if (!needs) return action;
  if (hasScreenPoint(action)) return action;

  const label = action.target || action.field || action.label;

  // Ask Windows first. Free, exact, and nothing leaves the device.
  if (uia && typeof uia.run === "function" && uia.screen) {
    const found = await findControl(label, uia);
    if (found) {
      return { ...action, xPct: found.xPct, yPct: found.yPct, _targeted: true, _targetedVia: "uia" };
    }
  }

  const hit = await resolveTargetPoint({ target: label, dataUrl, eco });
  if (!hit) return action;
  return { ...action, xPct: hit.xPct, yPct: hit.yPct, _targeted: true, _targetedVia: "vision" };
}

module.exports = { resolveTargetPoint, ensureActionCoords, hasScreenPoint };
