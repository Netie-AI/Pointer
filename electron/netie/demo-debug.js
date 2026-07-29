"use strict";
/** Demo-only debug trail. Default OFF. */
const fs = require("fs");
const path = require("path");
const os = require("os");
function defaultRoot() {
  return path.join(os.homedir(), "AppData", "Roaming", "NetieClicks", "demo-debug");
}
class DemoDebugTrail {
  constructor(opts = {}) {
    this.root = opts.root || defaultRoot();
    this.enabled = Boolean(opts.enabled);
    this.runId = null;
    this.dir = null;
    this.step = 0;
  }
  setEnabled(on) {
    this.enabled = Boolean(on);
    if (!this.enabled) this.endRun();
  }
  beginRun(label) {
    if (!this.enabled) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safe = String(label || "act").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 40);
    this.runId = stamp + "_" + safe;
    this.dir = path.join(this.root, this.runId);
    this.step = 0;
    fs.mkdirSync(this.dir, { recursive: true });
    this._append({ event: "begin", label: label || "act", at: new Date().toISOString() });
    return this.dir;
  }
  endRun(summary) {
    if (!this.dir) return;
    this._append(Object.assign({ event: "end", at: new Date().toISOString() }, summary || {}));
    this.runId = null; this.dir = null; this.step = 0;
  }
  recordStep(meta, capturePath) {
    if (!this.enabled || !this.dir) return null;
    this.step += 1;
    const n = String(this.step).padStart(3, "0");
    let shotPath = null;
    if (capturePath && fs.existsSync(capturePath)) {
      shotPath = path.join(this.dir, n + ".png");
      try { fs.copyFileSync(capturePath, shotPath); }
      catch (err) {
        shotPath = null;
        this._append({ event: "copy_failed", step: this.step, error: String(err.message || err) });
      }
    }
    this._append(Object.assign({
      event: "step", step: this.step,
      shot: shotPath ? path.basename(shotPath) : null,
      at: new Date().toISOString()
    }, meta || {}));
    return shotPath;
  }
  openFolder() {
    if (!fs.existsSync(this.root)) fs.mkdirSync(this.root, { recursive: true });
    return this.root;
  }
  _append(row) {
    if (!this.dir) return;
    try { fs.appendFileSync(path.join(this.dir, "steps.jsonl"), JSON.stringify(row) + "\\n", "utf8"); }
    catch (_err) {}
  }
}
module.exports = { DemoDebugTrail, defaultRoot };
