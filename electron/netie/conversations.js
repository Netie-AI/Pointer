"use strict";
/**
 * Clicky conversations — one markdown file per chat.
 * Stored under %APPDATA%/NetieClicks/conversations/ for Explorer + Netie Space.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");

function defaultRoot() {
  return path.join(os.homedir(), "AppData", "Roaming", "NetieClicks", "conversations");
}

function slug(s) {
  return String(s || "chat")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "chat";
}

class ConversationStore {
  constructor(opts = {}) {
    this.root = opts.root || defaultRoot();
  }

  ensure() {
    fs.mkdirSync(this.root, { recursive: true });
    const readme = path.join(this.root, "README.md");
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(
        readme,
        [
          "# Netie Pointer conversations",
          "",
          "Each `.md` file is one Pointer session.",
          "",
          "Soft handoff: open a file with Netie Space `--preview` from Pointer.",
          "Do not write into the Netie Space repo or its preview fixtures.",
          "",
          `Folder: ${this.root}`,
          "",
        ].join("\n"),
        "utf8"
      );
    }
  }

  /**
   * @param {object} opts
   * @param {string} [opts.title]
   * @param {Array<{role:string,text:string,ts?:number}>} opts.turns
   * @param {object} [opts.meta]
   */
  save({ title, turns, meta = {} }) {
    this.ensure();
    const id = crypto.randomUUID().slice(0, 8);
    const when = new Date();
    const stamp = when.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const base = `${stamp}_${slug(title)}_${id}`;
    const file = path.join(this.root, `${base}.md`);

    const lines = [
      `# ${title || "Netie Pointer session"}`,
      "",
      `> saved: ${when.toISOString()}`,
      `> product: Netie Pointer`,
      `> airgpt_id: ${meta.airgptId || `Pointer-${when.toISOString().slice(0, 10)}`}`,
      `> session_kind: ${meta.kind || "agent"}`,
      `> device: ${meta.deviceId || ""}`,
      `> id: ${base}`,
      "",
      "---",
      "",
    ];
    for (const t of turns || []) {
      const role = t.role === "user" ? "You" : "Netie";
      const ts = t.ts ? new Date(t.ts).toISOString().slice(11, 19) : "";
      lines.push(`## ${role}${ts ? ` · ${ts}` : ""}`, "", String(t.text || "").trim(), "", "---", "");
    }
    fs.writeFileSync(file, lines.join("\n"), "utf8");

    // Sidecar index for the in-app list (no full bodies).
    const indexPath = path.join(this.root, "index.json");
    let index = { version: 1, items: [] };
    try {
      index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    } catch {
      /* fresh */
    }
    index.items = Array.isArray(index.items) ? index.items : [];
    index.items.unshift({
      id: base,
      file: `${base}.md`,
      title: title || "Netie Pointer session",
      saved_at: when.toISOString(),
      turns: (turns || []).length,
      airgpt_id: meta.airgptId || `Pointer-${when.toISOString().slice(0, 10)}`,
      kind: meta.kind || "agent",
    });
    index.items = index.items.slice(0, 200);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

    return { ok: true, id: base, path: file, folder: this.root };
  }

  list(limit = 40, opts = {}) {
    this.ensure();
    try {
      const index = JSON.parse(fs.readFileSync(path.join(this.root, "index.json"), "utf8"));
      let items = index.items || [];
      if (opts.today) {
        const day = new Date().toISOString().slice(0, 10);
        items = items.filter((it) => String(it.saved_at || "").startsWith(day));
      }
      return items.slice(0, limit);
    } catch {
      return [];
    }
  }

  read(idOrFile) {
    this.ensure();
    const name = String(idOrFile).endsWith(".md") ? idOrFile : `${idOrFile}.md`;
    const file = path.join(this.root, path.basename(name));
    if (!fs.existsSync(file)) return null;
    return { path: file, markdown: fs.readFileSync(file, "utf8") };
  }

  /** Open folder in Windows Explorer (or reveal a file). */
  reveal(fileOrFolder) {
    this.ensure();
    const target = fileOrFolder || this.root;
    if (process.platform === "win32") {
      if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        execFile("explorer.exe", ["/select,", target], { windowsHide: true });
      } else {
        execFile("explorer.exe", [this.root], { windowsHide: true });
      }
      return { ok: true, folder: this.root };
    }
    return { ok: false, error: "reveal is Windows-only in this build" };
  }
}

module.exports = { ConversationStore, defaultRoot, slug };
