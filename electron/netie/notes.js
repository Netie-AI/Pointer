"use strict";
/**
 * Live markdown notes for Transcribe / Meeting modes.
 * Writes under %APPDATA%/NetieClicks/notes/ — openable in Explorer / Netie Space.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

function defaultRoot() {
  return path.join(os.homedir(), "AppData", "Roaming", "NetieClicks", "notes");
}

class NotesSession {
  constructor(opts = {}) {
    this.root = opts.root || defaultRoot();
    this.file = null;
    this.mode = "transcribe";
    this.lines = 0;
  }

  ensure() {
    fs.mkdirSync(this.root, { recursive: true });
  }

  start(mode = "transcribe") {
    this.ensure();
    this.mode = mode;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = `${stamp}_${mode}.md`;
    this.file = path.join(this.root, name);
    const header = [
      `# Netie ${mode === "meeting" ? "Meeting" : "Transcript"} notes`,
      "",
      `> started: ${new Date().toISOString()}`,
      `> mode: ${mode}`,
      `> product: Netie Clicks`,
      `> airgpt_id: Clicks-${new Date().toISOString().slice(0, 10)}`,
      `> languages: Chinese / English / Malay (rojak — write each as spoken)`,
      "",
      "---",
      "",
    ].join("\n");
    fs.writeFileSync(this.file, header, "utf8");
    this.lines = 0;
    return { ok: true, path: this.file, folder: this.root };
  }

  append({ text, source = "mic", langHint = "" }) {
    if (!this.file) this.start(this.mode);
    const t = String(text || "").trim();
    if (!t) return null;
    const ts = new Date().toISOString().slice(11, 19);
    const who = source === "system" ? "System" : source === "netie" ? "Netie" : "You";
    const lang = langHint ? ` · ${langHint}` : "";
    const block = `### ${ts} · ${who}${lang}\n\n${t}\n\n`;
    fs.appendFileSync(this.file, block, "utf8");
    this.lines += 1;
    return { path: this.file, lines: this.lines };
  }

  /** Last N characters of the live notes file (meeting assist context). */
  tail(maxChars = 4000) {
    if (!this.file || !fs.existsSync(this.file)) return "";
    let text = "";
    try {
      text = fs.readFileSync(this.file, "utf8");
    } catch {
      return "";
    }
    const n = Number(maxChars) > 0 ? Number(maxChars) : 4000;
    return text.length > n ? text.slice(-n) : text;
  }

  stop() {
    if (!this.file) return null;
    fs.appendFileSync(this.file, `\n---\n\n> ended: ${new Date().toISOString()}\n`, "utf8");
    const out = { path: this.file, lines: this.lines };
    this.file = null;
    return out;
  }
}

module.exports = { NotesSession, defaultRoot };
