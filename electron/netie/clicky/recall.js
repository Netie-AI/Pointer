"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sealRecord } = require("../crypto/envelope");

class RecallRing {
  constructor({
    windowMs = 60000,
    maxFrames = 60,
    dataDir,
    vault,
    sealPixels = false,
    clock = () => Date.now(),
    fs: injectedFs = fs,
    sealFn = sealRecord,
  } = {}) {
    this.windowMs = windowMs;
    this.maxFrames = maxFrames;
    this.dataDir = dataDir;
    this.vault = vault || null;
    this.sealPixels = sealPixels;
    this.clock = typeof clock === "function" ? clock : () => clock.now();
    this.fs = injectedFs;
    this.sealFn = sealFn;
    this.frames = [];
    this.recallDir = dataDir ? path.join(dataDir, "recall") : null;
    this._ensureDir();
  }

  _ensureDir() {
    if (this.recallDir) this.fs.mkdirSync(this.recallDir, { recursive: true });
  }

  push(frame = {}) {
    const normalized = {
      t: Number.isFinite(frame.t) ? frame.t : this.clock(),
      cx: frame.cx,
      cy: frame.cy,
      displayId: frame.displayId,
      fgTitle: frame.fgTitle,
      fgProc: frame.fgProc,
      width: frame.width,
      height: frame.height,
    };
    if (Buffer.isBuffer(frame.thumbJpeg)) normalized.thumbJpeg = Buffer.from(frame.thumbJpeg);
    this.frames.push(normalized);
    this._trim();
    return normalized;
  }

  _trim() {
    if (!this.frames.length) return;
    const cutoff = this.clock() - this.windowMs;
    while (this.frames.length && this.frames[0].t < cutoff) this._sealEviction(this.frames.shift());
    while (this.frames.length > this.maxFrames) this._sealEviction(this.frames.shift());
  }

  _sealEviction(frame) {
    if (!this.vault || !this.recallDir) return null;
    const hasPixels = this.sealPixels && Buffer.isBuffer(frame.thumbJpeg);
    const payload = {
      t: frame.t,
      cx: frame.cx,
      cy: frame.cy,
      displayId: frame.displayId,
      fgTitle: frame.fgTitle,
      fgProc: frame.fgProc,
      width: frame.width,
      height: frame.height,
    };
    if (hasPixels) payload.thumbJpegBase64 = frame.thumbJpeg.toString("base64");
    const id = `recall-${frame.t}-${crypto.randomUUID()}`;
    const sealed = this.sealFn({
      id,
      type: hasPixels ? "recall-frame" : "recall-meta",
      payload,
      userKek: this.vault.userKek,
      netieKek: this.vault.netieKek,
    });
    this._ensureDir();
    this.fs.writeFileSync(path.join(this.recallDir, `${id}.enc.json`), JSON.stringify(sealed), "utf8");
    return sealed;
  }

  snapshot() {
    return this.frames.map((frame) => ({ ...frame, ...(frame.thumbJpeg ? { thumbJpeg: Buffer.from(frame.thumbJpeg) } : {}) }));
  }

  summaryText({ limit = 12 } = {}) {
    return this.frames
      .slice(-Math.max(0, limit))
      .map((frame) => {
        const time = new Date(frame.t).toISOString();
        const cursor = `${frame.cx ?? "?"},${frame.cy ?? "?"}`;
        const app = [frame.fgProc, frame.fgTitle].filter(Boolean).map((value) => String(value).replace(/\s+/g, " ").trim()).join(" — ");
        return `${time} cursor(${cursor})${app ? ` ${app}` : ""}`;
      })
      .join("\n");
  }

  recentCursorPath(n = 20) {
    return this.frames.slice(-Math.max(0, n)).map(({ t, cx, cy }) => ({ t, cx, cy }));
  }

  stopFlush() {
    const pending = this.frames.splice(0);
    for (const frame of pending) this._sealEviction(frame);
    return pending.length;
  }
}

module.exports = { RecallRing };
