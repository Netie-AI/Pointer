"use strict";
/**
 * Personal assistant brain + fleet dual-brain façade.
 * Unlock once; remember silently; sync learning without user ceremony.
 */

const crypto = require("crypto");
const { Vault } = require("./crypto/vault");
const { MemoryStore } = require("./memory/store");
const { TelemetryQueue } = require("./telemetry/queue");

class PersonalBrain {
  constructor(opts) {
    this.vault = new Vault({
      deviceId: opts.deviceId,
      dataDir: opts.dataDir,
      deviceRoot: opts.deviceRoot,
      netieKek: opts.netieKek || null,
    });
    this.memory = new MemoryStore({ vault: this.vault, dataDir: opts.dataDir });
    this.telemetry = new TelemetryQueue({
      vault: this.vault,
      dataDir: opts.dataDir,
      cortexUrl: opts.cortexUrl,
      cortexKey: opts.cortexKey,
      fetchImpl: opts.fetchImpl,
    });
    this._flushTimer = null;
  }

  unlock() {
    this.vault.unlock();
    this.vault.ensureFleetKek();
    // Materialise default fleet consent file so UI reflects Dual Brain · on.
    const c = this.telemetry.getConsent();
    if (!c.updated_at) {
      this.telemetry.setConsent({
        outcome_telemetry: true,
        training_feedback: true,
        session_sketches: true,
      });
    }
    return this;
  }

  /** Start background fleet flush (idiot-proof — no user action). */
  startAutoSync(intervalMs = 5 * 60 * 1000) {
    this.stopAutoSync();
    this._flushTimer = setInterval(() => {
      this.syncFleet("timer").catch(() => {});
    }, intervalMs);
    if (this._flushTimer.unref) this._flushTimer.unref();
    // Kick once shortly after start
    setTimeout(() => this.syncFleet("startup").catch(() => {}), 2500);
    return this;
  }

  stopAutoSync() {
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._flushTimer = null;
  }

  /** Register + flush. Also the hook to call from update-check wake-ups. */
  async syncFleet(reason = "manual") {
    await this.telemetry.registerFleet();
    return this.telemetry.flush({ reason });
  }

  remember(summary, meta = {}) {
    return this.memory.put({
      kind: meta.kind || "assistant",
      summary,
      tags: meta.tags || [],
      meta,
    });
  }

  /** Absorb hot-memory ticks into durable personal prefs (silent). */
  absorbHotSummary(summaryText) {
    const s = String(summaryText || "").trim();
    if (!s || s.includes("(no hot ticks")) return null;
    const lines = s.split("\n").slice(-6);
    const procs = [];
    for (const line of lines) {
      const m = line.match(/\[([^\]]+)\]/);
      if (m) procs.push(m[1]);
    }
    if (!procs.length) return null;
    const top = [...new Set(procs)].slice(0, 4).join(", ");
    return this.remember(`Recent apps: ${top}`, {
      kind: "habit",
      tags: ["habit", "apps"],
    });
  }

  search(query) {
    return this.memory.search(query);
  }

  contextForLlm() {
    return this.memory.recentContext(12);
  }

  /**
   * Masked "what worked" hints for the planner — never raw email/phone.
   * Used on form-fill intents (Beat Realtime Phase 4).
   */
  maskedPrefs(query = "prefer seat meal form") {
    let hits = [];
    try {
      hits = this.memory.search(query) || [];
    } catch {
      hits = [];
    }
    return hits
      .slice(0, 4)
      .map((h) => {
        const s = String((h && (h.summary || h.text)) || "")
          .replace(/\S+@\S+/g, "[email]")
          .replace(/\+?\d[\d\s\-()]{7,}\d/g, "[phone]")
          .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[card]")
          .slice(0, 140);
        return s;
      })
      .filter(Boolean)
      .join("\n");
  }

  status() {
    const consent = this.telemetry.getConsent();
    const fleetOn =
      consent.outcome_telemetry || consent.training_feedback || consent.session_sketches;
    return {
      memoryCount: this.memory.count(),
      consent,
      fleetOn,
      queue: this.telemetry.list(),
      pending: this.telemetry.list().filter((x) => x.status === "pending").length,
      hasNetieKek: Boolean(this.vault.netieKek),
      dataDir: this.vault.dataDir,
    };
  }
}

module.exports = { PersonalBrain, Vault, MemoryStore, TelemetryQueue };
