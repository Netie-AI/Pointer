"use strict";
/**
 * Fleet learning queue — Netie dual-brain ingest.
 *
 * Product default: learning ON (install = fleet membership). Users can pause.
 * ONLY posts to Cortex /v1/telemetry (may run alongside update checks, never
 * stuffed inside update binaries — see docs/DATA_GOVERNANCE.md).
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { sealRecord, openWithUserKek } = require("../crypto/envelope");

const TELEMETRY_PATH = "/v1/telemetry";
const REGISTER_PATH = "/v1/telemetry/register";

/** Product default — Dual Brain learning on. Opt-out is one tap in the panel. */
const DEFAULT_CONSENT = Object.freeze({
  outcome_telemetry: true,
  training_feedback: true,
  session_sketches: true,
  updated_at: null,
});

function redactOutcome(raw) {
  return {
    tier: "A",
    action_type: String(raw.action_type || raw.type || "unknown").slice(0, 64),
    safety_tier: String(raw.safety_tier || raw.tierName || "").slice(0, 32),
    approved: Boolean(raw.approved),
    succeeded: Boolean(raw.succeeded),
    latency_ms: Math.min(Math.max(0, Number(raw.latency_ms) || 0), 600000),
    app_class: String(raw.app_class || "unknown").slice(0, 64),
    irreversible: Boolean(raw.irreversible),
  };
}

function redactFeedback(raw) {
  return {
    tier: "B",
    sentiment: raw.sentiment === "up" ? "up" : "down",
    note: String(raw.note || "").slice(0, 500),
    about: String(raw.about || "plan").slice(0, 64),
  };
}

/** Tier C — already Cortex-masked control labels / structure. Never pixels. */
function redactSessionSketch(raw) {
  const labels = Array.isArray(raw.labels)
    ? raw.labels.map((x) => String(x).slice(0, 80)).slice(0, 40)
    : [];
  return {
    tier: "C",
    app_class: String(raw.app_class || "unknown").slice(0, 64),
    labels,
    intent: String(raw.intent || "").slice(0, 120),
    outcome: String(raw.outcome || "").slice(0, 64),
  };
}

class ConsentStore {
  constructor(dataDir) {
    this.path = path.join(dataDir, "consent.json");
  }

  read() {
    try {
      const j = JSON.parse(fs.readFileSync(this.path, "utf8"));
      return {
        outcome_telemetry: j.outcome_telemetry !== false,
        training_feedback: j.training_feedback !== false,
        session_sketches: j.session_sketches !== false,
        updated_at: j.updated_at || null,
      };
    } catch {
      return { ...DEFAULT_CONSENT };
    }
  }

  write(partial) {
    const cur = this.read();
    const next = {
      ...cur,
      ...partial,
      updated_at: new Date().toISOString(),
    };
    next.outcome_telemetry = Boolean(next.outcome_telemetry);
    next.training_feedback = Boolean(next.training_feedback);
    next.session_sketches = Boolean(next.session_sketches);
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    fs.writeFileSync(this.path, JSON.stringify(next, null, 2), { mode: 0o600 });
    return next;
  }

  /** True when any fleet upload path is enabled. */
  fleetOn() {
    const c = this.read();
    return c.outcome_telemetry || c.training_feedback || c.session_sketches;
  }
}

class TelemetryQueue {
  constructor(opts) {
    this.vault = opts.vault;
    this.dataDir = opts.dataDir || this.vault.dataDir;
    this.cortexUrl = (opts.cortexUrl || "http://127.0.0.1:8010").replace(/\/$/, "");
    this.cortexKey = opts.cortexKey || "";
    this._fetch = opts.fetchImpl || ((...a) => globalThis.fetch(...a));
    this.consent = new ConsentStore(this.dataDir);
    this.queueDir = path.join(this.dataDir, "telemetry");
    this.queuePath = path.join(this.queueDir, "queue.json");
  }

  ensure() {
    this.vault.unlock();
    // Fleet KEK required for dual-brain wraps — seed locally until Cortex register.
    this.vault.ensureFleetKek();
    fs.mkdirSync(this.queueDir, { recursive: true });
    if (!fs.existsSync(this.queuePath)) {
      fs.writeFileSync(this.queuePath, JSON.stringify({ version: 1, items: [] }, null, 2));
    }
  }

  _read() {
    this.ensure();
    try {
      return JSON.parse(fs.readFileSync(this.queuePath, "utf8"));
    } catch {
      return { version: 1, items: [] };
    }
  }

  _write(q) {
    fs.writeFileSync(this.queuePath, JSON.stringify(q, null, 2), { mode: 0o600 });
  }

  getConsent() {
    return this.consent.read();
  }

  setConsent(partial) {
    const next = this.consent.write(partial);
    if (!this.consent.fleetOn()) {
      // Pause fleet — keep personal brain; drop upload wraps seed only if fully off.
      // Keep netieKek so re-enable is instant; just stop enqueue.
    }
    return next;
  }

  enqueueOutcome(raw) {
    if (!this.consent.read().outcome_telemetry) return { ok: false, blocked: "consent-off" };
    return this._enqueue("outcome", redactOutcome(raw));
  }

  enqueueFeedback(raw) {
    if (!this.consent.read().training_feedback) return { ok: false, blocked: "consent-off" };
    return this._enqueue("feedback", redactFeedback(raw));
  }

  enqueueSessionSketch(raw) {
    if (!this.consent.read().session_sketches) return { ok: false, blocked: "consent-off" };
    return this._enqueue("sketch", redactSessionSketch(raw));
  }

  _enqueue(kind, payload) {
    this.ensure();
    const id = crypto.randomUUID();
    const sealed = sealRecord({
      id,
      type: "telemetry",
      payload: { kind, ...payload, queued_at: Date.now() },
      userKek: this.vault.userKek,
      netieKek: this.vault.netieKek,
    });
    const encPath = path.join(this.queueDir, `${id}.enc.json`);
    fs.writeFileSync(encPath, JSON.stringify(sealed), { mode: 0o600 });

    const q = this._read();
    q.items.push({
      id,
      kind,
      status: "pending",
      lineage_id: sealed.lineage_id,
      queued_at: Date.now(),
      has_netie_wrap: Boolean(sealed.wrap_netie),
      preview: this._preview(kind, payload),
    });
    this._write(q);
    return { ok: true, id, lineage_id: sealed.lineage_id };
  }

  _preview(kind, payload) {
    if (kind === "outcome") {
      return `${payload.action_type} · ${payload.succeeded ? "ok" : "fail"} · ${payload.app_class}`;
    }
    if (kind === "sketch") {
      return `sketch · ${payload.app_class} · ${(payload.labels || []).slice(0, 3).join(",")}`;
    }
    return `feedback:${payload.sentiment} · ${(payload.note || "").slice(0, 40)}`;
  }

  list() {
    return this._read().items;
  }

  cancel(id) {
    this.ensure();
    const q = this._read();
    const item = q.items.find((x) => x.id === id);
    if (!item) return false;
    item.status = "cancelled";
    try {
      fs.unlinkSync(path.join(this.queueDir, `${id}.enc.json`));
    } catch {
      /* ok */
    }
    this._write(q);
    return true;
  }

  purge() {
    this.ensure();
    const q = this._read();
    for (const item of q.items) {
      try {
        fs.unlinkSync(path.join(this.queueDir, `${item.id}.enc.json`));
      } catch {
        /* ok */
      }
    }
    this._write({ version: 1, items: [] });
    return true;
  }

  _headers() {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.cortexKey) headers.Authorization = `Bearer ${this.cortexKey}`;
    return headers;
  }

  /**
   * Ask Cortex for an official fleet KEK (Final Boss delegate).
   * Best-effort — local seed works until this succeeds.
   */
  async registerFleet() {
    this.ensure();
    const url = `${this.cortexUrl}${REGISTER_PATH}`;
    try {
      const res = await this._fetch(url, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify({
          device_id: this.vault.deviceId,
          product: "netie-clicks",
          // Send our local fleet pub material later; for now request server KEK bytes.
        }),
      });
      if (!res.ok) return { ok: false, status: res.status };
      const data = await res.json();
      if (data && data.netie_kek_b64) {
        this.vault.setNetieKek(Buffer.from(data.netie_kek_b64, "base64"));
        return { ok: true, sourced: "cortex" };
      }
      return { ok: false, reason: "no-kek" };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }

  /**
   * Flush pending → Cortex /v1/telemetry only.
   * Safe to call from update-check wake-ups.
   */
  async flush({ reason = "manual" } = {}) {
    this.ensure();
    const url = `${this.cortexUrl}${TELEMETRY_PATH}`;
    if (!url.includes(TELEMETRY_PATH) || /\/(update|download)\b/i.test(url)) {
      throw new Error("Telemetry egress allowlist violation");
    }

    if (!this.consent.fleetOn()) {
      return { ok: false, blocked: "consent-off", sent: 0, reason };
    }

    const c = this.consent.read();
    const q = this._read();
    let sent = 0;
    const errors = [];

    for (const item of q.items) {
      if (item.status !== "pending") continue;
      if (item.kind === "outcome" && !c.outcome_telemetry) continue;
      if (item.kind === "feedback" && !c.training_feedback) continue;
      if (item.kind === "sketch" && !c.session_sketches) continue;
      if (!item.has_netie_wrap) {
        item.status = "needs-netie-kek";
        continue;
      }

      try {
        const sealed = JSON.parse(
          fs.readFileSync(path.join(this.queueDir, `${item.id}.enc.json`), "utf8")
        );
        let user_verified = false;
        try {
          openWithUserKek(sealed, this.vault.userKek);
          user_verified = true;
        } catch {
          user_verified = false;
        }

        const res = await this._fetch(url, {
          method: "POST",
          headers: this._headers(),
          body: JSON.stringify({
            device_id: this.vault.deviceId,
            lineage_id: item.lineage_id,
            kind: item.kind,
            envelope: sealed,
            user_verified,
            flush_reason: reason,
          }),
        });
        if (!res.ok) throw new Error(`telemetry HTTP ${res.status}`);
        item.status = "sent";
        item.sent_at = Date.now();
        sent += 1;
        try {
          fs.unlinkSync(path.join(this.queueDir, `${item.id}.enc.json`));
        } catch {
          /* ok */
        }
      } catch (err) {
        item.last_error = String(err && err.message ? err.message : err);
        errors.push({ id: item.id, error: item.last_error });
      }
    }
    this._write(q);
    return { ok: errors.length === 0, sent, errors, reason };
  }
}

module.exports = {
  ConsentStore,
  TelemetryQueue,
  redactOutcome,
  redactFeedback,
  redactSessionSketch,
  TELEMETRY_PATH,
  REGISTER_PATH,
  DEFAULT_CONSENT,
};
