/**
 * Local bug-report flow. Nothing here leaves the device.
 *
 * AirGPT has a founder FAB (`#bugReportBtn` / `startBugReport`). Pointer has
 * the same named control on the HUD; the payload stays on-box until a human
 * clicks Copy. There is no mailer, no fetch, no cloud relay.
 *
 * Loaded as a plain <script> in hud.html and as CommonJS in the invariant test.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NetieBugReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const APP = "Netie Pointer";
  const NOTE_CAP = 4000;

  function sanitizeNote(note) {
    return String(note || "").slice(0, NOTE_CAP);
  }

  function buildDiagnostics(info) {
    const i = info || {};
    return [
      APP + " problem report",
      "This blob stays on this device until you paste it somewhere.",
      "",
      "when: " + (i.when || new Date().toISOString()),
      "version: " + String(i.version || "0.1.0"),
      "mode: " + String(i.mode || "unknown"),
      "platform: " + String(i.platform || "unknown"),
      "",
      "note:",
      sanitizeNote(i.note) || "(none)",
    ].join("\n");
  }

  /**
   * Copy is opt-in. Callers must pass confirmed:true from a human click.
   * Fail-closed: anything else is refused and must not reach the clipboard.
   */
  function copyDiagnostics(text, opts) {
    const confirmed = Boolean(opts && opts.confirmed === true);
    if (!confirmed) return { ok: false, blocked: "unconfirmed", send: false };
    const body = String(text || "");
    if (!body.trim()) return { ok: false, blocked: "empty", send: false };
    return { ok: true, text: body, send: false };
  }

  /** AirGPT-named entry. Renderer opens the local form; this does not send. */
  function startBugReport() {
    return { ok: true, panel: "bug-report-panel", send: false };
  }

  return {
    APP,
    NOTE_CAP,
    buildDiagnostics,
    copyDiagnostics,
    startBugReport,
  };
});
