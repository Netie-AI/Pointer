"use strict";
/**
 * STT latency probe helpers (EPIC-P04). Measure before swapping engines.
 * OpenWillow / TurboOCR are not bundled — see PARKING_LOT P-03/P-04.
 */
const { Transcriber } = require("../electron/netie/transcriber");

/**
 * @returns {Promise<{ engine: string, local: boolean, probeMs: number, hint?: string }>}
 */
async function probeSttBaseline(opts = {}) {
  const t0 = Date.now();
  const tr = opts.transcriber || new Transcriber(opts);
  if (typeof tr.probe === "function") {
    try {
      await tr.probe(true);
    } catch (_) {
      /* probe may fail offline — still report describe() */
    }
  }
  const desc = typeof tr.describe === "function" ? tr.describe() : { engine: "unknown", local: null };
  return {
    engine: desc.engine || desc.name || "unknown",
    local: Boolean(desc.local),
    probeMs: Date.now() - t0,
    hint: desc.hint || "",
    sidecar: Boolean(process.env.NETIE_STT_URL),
    openwillowNote:
      "Point NETIE_STT_URL at an OpenAI-shaped local STT sidecar; do not vendor OpenWillow (GPLv3) without DR.",
    turboOcrNote:
      "TurboOCR is screen-OCR only — spike only if STT is healthy and screen-text lag remains.",
  };
}

module.exports = { probeSttBaseline };

if (require.main === module) {
  probeSttBaseline()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
