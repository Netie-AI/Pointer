/**
 * In-process 60s ring + optional Redis ZSET hot memory.
 * Redis URL: OPENVAULT_REDIS_URL or REDIS_URL.
 */

const crypto = require("crypto");

const HOT_MS = 60_000;

class HotMemory {
  constructor() {
    this.deviceId = this._loadOrCreateDeviceId();
    this.ticks = []; // { t, payload }
    this.redis = null;
    this._redisTried = false;
  }

  _loadOrCreateDeviceId() {
    const fs = require("fs");
    const path = require("path");
    const os = require("os");
    const dir = path.join(os.homedir(), "AppData", "Roaming", "NetieClicks");
    const file = path.join(dir, "device.json");
    try {
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(file)) {
        const j = JSON.parse(fs.readFileSync(file, "utf8"));
        if (j.deviceId) return j.deviceId;
      }
      const id = crypto.randomUUID();
      fs.writeFileSync(file, JSON.stringify({ deviceId: id }, null, 2));
      return id;
    } catch {
      return crypto.randomUUID();
    }
  }

  async ensureRedis() {
    if (this._redisTried) return this.redis;
    this._redisTried = true;
    const url = process.env.OPENVAULT_REDIS_URL || process.env.REDIS_URL;
    if (!url) return null;
    try {
      // Optional dependency — skip if not installed
      const Redis = require("ioredis");
      this.redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
      await this.redis.connect();
      return this.redis;
    } catch {
      this.redis = null;
      return null;
    }
  }

  _trim(now = Date.now()) {
    const cut = now - HOT_MS;
    this.ticks = this.ticks.filter((x) => x.t >= cut);
  }

  async pushTick(tick) {
    const now = typeof tick.t === "number" ? tick.t : Date.now();
    const payload = { ...tick, t: now };
    this.ticks.push({ t: now, payload });
    this._trim(now);

    const r = await this.ensureRedis();
    if (!r) return;
    const key = `ov:clicks:ticks:${this.deviceId}`;
    const member = JSON.stringify(payload);
    try {
      await r.zadd(key, now, member);
      await r.zremrangebyscore(key, 0, now - HOT_MS);
      await r.expire(key, 120);
    } catch {
      /* keep local ring */
    }
  }

  snapshot() {
    this._trim();
    return this.ticks.map((x) => x.payload);
  }

  summaryText(limit = 24) {
    const rows = this.snapshot().slice(-limit);
    if (!rows.length) return "(no hot ticks yet)";
    return rows
      .map((t) => {
        const fg = t.fg ? `${t.fg.title || "?"} [${t.fg.proc || "?"}]` : "?";
        return `${new Date(t.t).toISOString().slice(11, 19)} cursor=(${t.cx},${t.cy}) fg=${fg}`;
      })
      .join("\n");
  }
}

module.exports = { HotMemory, HOT_MS };
