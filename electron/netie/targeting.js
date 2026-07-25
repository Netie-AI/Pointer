"use strict";
/**
 * Vision targeting — resolve missing click coords from a screenshot + target label.
 * Plans often have human "target" strings; this fills xPct/yPct before the driver runs.
 */

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
    const res = await eco._post(
      `${eco.cfg.openvaultUrl}/v1/chat/completions`,
      {
        model: eco.cfg.model,
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
 */
async function ensureActionCoords(action, { dataUrl, eco }) {
  const type = String(action.type || "").toLowerCase();
  const needs =
    type === "click" ||
    type === "doubleclick" ||
    type === "rightclick" ||
    type === "hover" ||
    type === "movecursor";
  if (!needs) return action;
  if (action.xPct != null && action.yPct != null) return action;
  if (action.screenX != null && action.screenY != null) return action;
  if (action.x != null && action.y != null) return action;

  const hit = await resolveTargetPoint({
    target: action.target || action.field || action.label,
    dataUrl,
    eco,
  });
  if (!hit) return action;
  return { ...action, xPct: hit.xPct, yPct: hit.yPct, _targeted: true };
}

module.exports = { resolveTargetPoint, ensureActionCoords };
