"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sealRecord } = require("../crypto/envelope");

/** Sealed recall filenames: recall-<epochMs>-<uuid>.enc.json */
const SEALED_NAME = /^recall-(\d+)-[0-9a-fA-F-]+\.enc\.json$/;

/** DATA_GOVERNANCE Tier X ceiling. A huge retentionMs must not un-bound the dir. */
const MAX_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

function clampRetentionMs(retentionMs, windowMs) {
  const fallback = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000;
  if (!Number.isFinite(retentionMs) || retentionMs <= 0) return fallback;
  return Math.min(retentionMs, MAX_RETENTION_MS);
}

class RecallRing {
  constructor({
    windowMs = 60000,
    maxFrames = 60,
    retentionMs,
    dataDir,
    vault,
    sealPixels = false,
    clock = () => Date.now(),
    fs: injectedFs = fs,
    sealFn = sealRecord,
  } = {}) {
    this.windowMs = windowMs;
    this.maxFrames = maxFrames;
    this.retentionMs = clampRetentionMs(retentionMs, windowMs);
    this.dataDir = dataDir;
    this.vault = vault || null;
    this.sealPixels = sealPixels;
    this.clock = typeof clock === "function" ? clock : () => clock.now();
    this.fs = injectedFs;
    this.sealFn = sealFn;
    this.frames = [];
    this.recallDir = dataDir ? path.join(dataDir, "recall") : null;
    this._ensureDir();
    this.purgeExpired();
  }

  _ensureDir() {
    if (this.recallDir) this.fs.mkdirSync(this.recallDir, { recursive: true });
  }

  _cutoff() {
    return this.clock() - this.retentionMs;
  }

  _isExpired(t) {
    return !Number.isFinite(t) || t < this._cutoff();
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
    this.purgeExpired();
  }

  _sealEviction(frame) {
    if (!this.vault || !this.recallDir) return null;
    // Time-expired frames are dropped. Eviction used to *be* persistence, which
    // is how <dataDir>/recall/ grew without a bound (DR-0003 fact 4).
    if (this._isExpired(frame.t)) return null;
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

  /**
   * Unlink sealed recall-* files whose capture timestamp is older than
   * retentionMs. Foreign names are left alone. Returns how many files went.
   */
  purgeExpired() {
    if (!this.recallDir || typeof this.fs.readdirSync !== "function") return 0;
    let names;
    try {
      names = this.fs.readdirSync(this.recallDir);
    } catch {
      return 0;
    }
    const cutoff = this._cutoff();
    let removed = 0;
    for (const name of names) {
      const match = SEALED_NAME.exec(name);
      if (!match) continue;
      const t = Number(match[1]);
      if (!Number.isFinite(t) || t >= cutoff) continue;
      const full = path.join(this.recallDir, name);
      try {
        if (typeof this.fs.lstatSync === "function") {
          const st = this.fs.lstatSync(full);
          if (typeof st.isSymbolicLink === "function" && st.isSymbolicLink()) continue;
          if (typeof st.isFile === "function" && !st.isFile()) continue;
        }
        this.fs.unlinkSync(full);
        removed += 1;
      } catch {
        /* leftover we could not drop is not a reason to throw */
      }
    }
    return removed;
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
    this.purgeExpired();
    return pending.length;
  }
}

module.exports = { RecallRing, MAX_RETENTION_MS };
