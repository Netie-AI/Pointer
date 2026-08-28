"use strict";
/**
 * Local HUD problem report (#29). Clipboard + a file on this device.
 * No cloud relay. No telemetry flush. Note is the founder's words only.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const MAX_NOTE = 500;

function defaultReportRoot() {
  return path.join(os.homedir(), "AppData", "Roaming", "NetieClicks", "reports");
}

function oneLine(value, fallback) {
  const t = String(value || "")
    .split(/[\r\n]/)[0]
    .trim()
    .slice(0, 24);
  return t || fallback;
}

function buildReport(opts = {}) {
  const note = String(opts.note || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOTE);
  const mode = oneLine(opts.mode, "agent");
  const session = oneLine(opts.session, "Ready");
  const lines = [
    "Pointer problem report",
    "mode: " + mode,
    "session: " + session,
    note ? "note: " + note : "note: (none)",
  ];
  return { text: lines.join("\n"), noteLen: note.length, mode, session };
}

function writeReport(text, opts = {}) {
  const body = String(text || "");
  if (!body.trim()) return { ok: false, reason: "empty report" };
  const root = opts.root || defaultReportRoot();
  const id = String(opts.id || crypto.randomBytes(4).toString("hex")).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  if (!id) return { ok: false, reason: "bad id" };
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, "report-" + id + ".md");
  fs.writeFileSync(file, body, "utf8");
  return { ok: true, path: file, id };
}

module.exports = { MAX_NOTE, defaultReportRoot, buildReport, writeReport };
