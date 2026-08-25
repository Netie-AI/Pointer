"use strict";
/**
 * Encrypted personal-assistant memory.
 * Records stay on device under dual-envelope crypto. Search uses HMAC tokens
 * (no plaintext in the index). Export/delete always works with the user KEK.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { sealRecord, openWithUserKek } = require("../crypto/envelope");
const { deriveSearchKey } = require("../crypto/kdf");

function normalizeTerm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenise(text) {
  const n = normalizeTerm(text);
  if (!n) return [];
  const words = n.split(" ").filter((w) => w.length >= 2);
  return [...new Set(words)];
}

class MemoryStore {
  /**
   * @param {object} opts
   * @param {import('../crypto/vault').Vault} opts.vault
   * @param {string} [opts.dataDir]
   */
  constructor(opts) {
    this.vault = opts.vault;
    this.dataDir = opts.dataDir || this.vault.dataDir;
    this.memDir = path.join(this.dataDir, "memory");
    this.recordsDir = path.join(this.memDir, "records");
    this.indexPath = path.join(this.memDir, "index.json");
  }

  ensure() {
    this.vault.unlock();
    fs.mkdirSync(this.recordsDir, { recursive: true });
    if (!fs.existsSync(this.indexPath)) {
      fs.writeFileSync(this.indexPath, JSON.stringify({ version: 1, items: [] }, null, 2));
    }
  }

  _readIndex() {
    this.ensure();
    try {
      return JSON.parse(fs.readFileSync(this.indexPath, "utf8"));
    } catch {
      return { version: 1, items: [] };
    }
  }

  _writeIndex(idx) {
    fs.writeFileSync(this.indexPath, JSON.stringify(idx, null, 2), { mode: 0o600 });
  }

  _hmacToken(term) {
    const key = deriveSearchKey(this.vault.userKek);
    return crypto.createHmac("sha256", key).update(normalizeTerm(term)).digest("hex");
  }

  /**
   * Store a personal-assistant note / summary (never raw screenshots).
   * @param {{ kind?: string, summary: string, tags?: string[], meta?: object }} entry
   */
  put(entry) {
    this.ensure();
    const id = crypto.randomUUID();
    const summary = String(entry.summary || "").slice(0, 4000);
    const payload = {
      kind: entry.kind || "note",
      summary,
      tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 32) : [],
      meta: entry.meta && typeof entry.meta === "object" ? entry.meta : {},
      ts: Date.now(),
    };

    const sealed = sealRecord({
      id,
      type: "memory",
      payload,
      userKek: this.vault.userKek,
      netieKek: this.vault.netieKek, // may be null → local-only
    });

    const file = path.join(this.recordsDir, `${id}.enc.json`);
    fs.writeFileSync(file, JSON.stringify(sealed), { mode: 0o600 });

    const tokens = tokenise(summary + " " + (payload.tags || []).join(" ")).map((t) =>
      this._hmacToken(t)
    );
    const idx = this._readIndex();
    idx.items.push({
      id,
      type: "memory",
      kind: payload.kind,
      ts: payload.ts,
      lineage_id: sealed.lineage_id,
      token_keys: tokens,
      has_netie_wrap: Boolean(sealed.wrap_netie),
    });
    this._writeIndex(idx);
    return { id, lineage_id: sealed.lineage_id };
  }

  get(id) {
    this.ensure();
    const file = path.join(this.recordsDir, `${id}.enc.json`);
    if (!fs.existsSync(file)) return null;
    const sealed = JSON.parse(fs.readFileSync(file, "utf8"));
    const { plaintext, lineage_id, type } = openWithUserKek(sealed, this.vault.userKek);
    return { id, lineage_id, type, ...JSON.parse(plaintext.toString("utf8")) };
  }

  /**
   * Search by plaintext query → HMAC token intersection (OR of tokens).
   */
  search(query, limit = 20) {
    this.ensure();
    const qTokens = tokenise(query).map((t) => this._hmacToken(t));
    if (!qTokens.length) return [];
    const idx = this._readIndex();
    const scored = [];
    for (const item of idx.items) {
      const hits = qTokens.filter((t) => (item.token_keys || []).includes(t)).length;
      if (hits > 0) scored.push({ item, hits });
    }
    scored.sort((a, b) => b.hits - a.hits || b.item.ts - a.item.ts);
    const out = [];
    for (const { item } of scored.slice(0, limit)) {
      try {
        const rec = this.get(item.id);
        if (rec) out.push(rec);
      } catch {
        /* tampered — skip */
      }
    }
    return out;
  }

  /** Decrypt everything the user owns → plain JSON (GDPR access). */
  exportAll() {
    this.ensure();
    const idx = this._readIndex();
    const records = [];
    for (const item of idx.items) {
      try {
        const rec = this.get(item.id);
        if (rec) records.push(rec);
      } catch {
        records.push({ id: item.id, error: "decrypt-failed" });
      }
    }
    return { exported_at: new Date().toISOString(), deviceId: this.vault.deviceId, records };
  }

  /** Delete one record (erasure). */
  delete(id) {
    this.ensure();
    const file = path.join(this.recordsDir, `${id}.enc.json`);
    try {
      fs.unlinkSync(file);
    } catch {
      /* ok */
    }
    const idx = this._readIndex();
    idx.items = idx.items.filter((x) => x.id !== id);
    this._writeIndex(idx);
    return true;
  }

  /** Wipe all personal memory. */
  deleteAll() {
    this.ensure();
    const idx = this._readIndex();
    for (const item of idx.items) {
      try {
        fs.unlinkSync(path.join(this.recordsDir, `${item.id}.enc.json`));
      } catch {
        /* ok */
      }
    }
    this._writeIndex({ version: 1, items: [] });
    return true;
  }

  count() {
    return this._readIndex().items.length;
  }

  /** Short context string for the personal assistant (last N summaries). */
  recentContext(limit = 8) {
    const idx = this._readIndex();
    const recent = [...idx.items].sort((a, b) => b.ts - a.ts).slice(0, limit);
    const lines = [];
    for (const item of recent) {
      try {
        const rec = this.get(item.id);
        if (rec && rec.summary) lines.push(`- ${rec.summary.slice(0, 200)}`);
      } catch {
        /* skip */
      }
    }
    return lines.length ? lines.join("\n") : "";
  }
}

module.exports = { MemoryStore, normalizeTerm, tokenise };
