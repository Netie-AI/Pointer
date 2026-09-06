"use strict";
/**
 * P-UNATTENDED-LEDGER — the local record of what Pointer actually did.
 *
 * `ecosystem.audit()` posts every consequential step to the Cortex ledger at
 * `/dms/audit/append` and then swallows the failure, on purpose: an audit
 * outage must not block the user's action. The cost of that choice is that
 * when Cortex is down — which on this laptop is most of the time — there is
 * no record at all. "What did it click?" has no answer, and the app cannot
 * tell you it has no answer. That is a silent fallback, and a silent fallback
 * is a lie (KB R-0011).
 *
 * This module is the answer that survives Cortex being down. It is deliberately
 * boring:
 *
 *   append-only    one NDJSON line per event, never rewritten. Sync state
 *                  lives in a sidecar so the log itself stays immutable.
 *   hash-chained   each record commits to its predecessor, so a deletion or an
 *                  edit in the middle is detectable — same shape as the Cortex
 *                  ledger, so the two can be compared later.
 *   redacted       secret VALUES never enter the log. Which field was filled is
 *                  the record; what went into it is custody's business and the
 *                  agent never had it anyway (see vault-fill.js SECRET_KEYS).
 *
 * Unattended work is the reason this exists. A human watching the HUD is their
 * own audit trail; a job that ran at 3am is not, and "check what it clicked"
 * is only a real promise if the record is written where the network cannot
 * take it away.
 *
 * No network, no Electron. Pure fs + crypto so it is unit-testable and so a
 * failure here can never be the thing that stops a step.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const LEDGER_VERSION = 1;
/** Chain root. Changing this starts a new, deliberately incompatible chain. */
const GENESIS = crypto.createHash("sha256").update("netie-pointer-ledger-v1").digest("hex");

const FILE_RE = /^ledger-(\d{4}-\d{2}-\d{2})\.ndjson$/;
const MAX_STRING = 512;
const MAX_DEPTH = 6;

/**
 * Keys whose VALUE must never be written, however it got into the payload.
 * Mirrors vault-fill.js SECRET_KEYS — kept as its own list on purpose: the
 * ledger must stay safe even if someone loosens the fill path's list, and a
 * shared mutable import is exactly how that kind of loosening travels.
 */
const REDACT_KEYS = Object.freeze([
  "password", "passcode", "pin", "otp", "one_time_code", "onetimecode", "2fa", "mfa",
  "cvv", "cvc", "card", "card_number", "credit_card", "security_code",
  "ssn", "social_security", "passport_number", "passport_no",
  "iban", "routing_number", "account_number",
  "api_key", "apikey", "secret", "secret_key", "token", "access_token",
  "private_key", "seed_phrase", "recovery_phrase", "authorization", "cookie",
]);

function isRedactedKey(key) {
  const k = String(key || "").toLowerCase().replace(/[\s-]+/g, "_");
  return REDACT_KEYS.some((s) => k === s || k.endsWith(`_${s}`) || k.startsWith(`${s}_`));
}

/**
 * Stable stringify — key order must not change the hash, or a chain verified on
 * one machine fails on another for no reason.
 */
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

/**
 * Strip secret values, bound the size, and drop anything that cannot be
 * serialised. A ledger that throws while recording a step is worse than no
 * ledger, so this never raises.
 */
function redact(input, depth = 0) {
  if (input === null || input === undefined) return null;
  const t = typeof input;
  if (t === "string") return input.length > MAX_STRING ? `${input.slice(0, MAX_STRING)}...[+${input.length - MAX_STRING}]` : input;
  if (t === "number" || t === "boolean") return input;
  if (t !== "object") return String(t);
  if (depth >= MAX_DEPTH) return "[depth]";
  if (Array.isArray(input)) return input.slice(0, 50).map((v) => redact(v, depth + 1));

  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (isRedactedKey(k)) {
      // Record that the field existed — the shape of the step is the evidence.
      out[k] = v === undefined || v === null || v === "" ? null : "[redacted]";
      continue;
    }
    out[k] = redact(v, depth + 1);
  }
  return out;
}

/**
 * An action headed for a custody field carries `_custody` and a blanked value.
 * Belt and braces: blank it here too, so a future caller that forgets to blank
 * cannot leak through the ledger.
 */
function redactAction(action) {
  const a = redact(action) || {};
  if (a && typeof a === "object" && (a._custody || (a.safety && a.safety.disposition === "custody"))) {
    if ("value" in a) a.value = "[custody]";
    if ("text" in a) a.text = "[custody]";
  }
  return a;
}

function hashRecord(rec) {
  // `synced` is not part of the record — it lives in the sidecar — but be
  // explicit anyway so a caller passing one cannot silently change the hash.
  const { hash, synced, ...rest } = rec;
  return crypto.createHash("sha256").update(canonical(rest)).digest("hex");
}

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function createLedger(opts = {}) {
  const dir = opts.dir || path.join(opts.dataDir || ".", "ledger");
  const actor = String(opts.actor || opts.deviceId || "pointer");
  const now = typeof opts.now === "function" ? opts.now : () => Date.now();
  const onError = typeof opts.onError === "function" ? opts.onError : () => {};

  let head = null; // { seq, hash }

  function ensureDir() {
    fs.mkdirSync(dir, { recursive: true });
  }

  function files() {
    try {
      return fs
        .readdirSync(dir)
        .filter((f) => FILE_RE.test(f))
        .sort()
        .map((f) => path.join(dir, f));
    } catch {
      return [];
    }
  }

  function linesOf(file) {
    try {
      return fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
    } catch {
      return [];
    }
  }

  /**
   * Head is derived from the log itself, never from a pointer file. A pointer
   * that disagrees with the log is a second source of truth, and the log is the
   * one that has to win.
   */
  function ensureHead() {
    if (head) return head;
    const all = files();
    for (let i = all.length - 1; i >= 0; i -= 1) {
      const lines = linesOf(all[i]);
      for (let j = lines.length - 1; j >= 0; j -= 1) {
        try {
          const rec = JSON.parse(lines[j]);
          if (rec && typeof rec.seq === "number" && typeof rec.hash === "string") {
            head = { seq: rec.seq, hash: rec.hash };
            return head;
          }
        } catch {
          /* a torn tail line is skipped; verify() will report it */
        }
      }
    }
    head = { seq: 0, hash: GENESIS };
    return head;
  }

  const syncPath = () => path.join(dir, "sync.json");

  function lastSynced() {
    try {
      const j = JSON.parse(fs.readFileSync(syncPath(), "utf8"));
      return Number(j.lastSyncedSeq) || 0;
    } catch {
      return 0;
    }
  }

  return {
    GENESIS,
    dir,

    /**
     * Write one event. Returns the record, or null if the write failed — a
     * caller must be able to tell "recorded" from "not recorded" (R-0011),
     * which is the whole reason this is not fire-and-forget.
     */
    append(event, payload = {}) {
      try {
        ensureDir();
        const prev = ensureHead();
        const ts = now();
        const rec = {
          v: LEDGER_VERSION,
          seq: prev.seq + 1,
          ts,
          iso: new Date(ts).toISOString(),
          actor,
          event: String(event || "unknown").slice(0, 96),
          payload: redact(payload),
          prev: prev.hash,
        };
        rec.hash = hashRecord(rec);
        fs.appendFileSync(path.join(dir, `ledger-${dayKey(ts)}.ndjson`), `${JSON.stringify(rec)}\n`, {
          encoding: "utf8",
          mode: 0o600,
        });
        head = { seq: rec.seq, hash: rec.hash };
        return rec;
      } catch (err) {
        // Do not throw: the ledger must never be the reason a step dies. But do
        // tell someone — a ledger failing quietly is the bug this file exists
        // to fix, and repeating it here would be embarrassing.
        onError(err);
        return null;
      }
    },

    /** Convenience for the executor — the shape every action record shares. */
    appendAction(kind, { action, disposition, approvedBy, mandateId, ok, error, ms, app } = {}) {
      return this.append(kind, {
        action: redactAction(action),
        disposition: disposition || (action && action.safety && action.safety.disposition) || null,
        approved_by: approvedBy || null,
        mandate_id: mandateId || null,
        app: app || null,
        ok: ok === undefined ? null : Boolean(ok),
        error: error ? String(error).slice(0, 300) : null,
        ms: ms === undefined ? null : Math.max(0, Number(ms) || 0),
      });
    },

    /** Every record, oldest first. `opts.event` filters, `opts.limit` takes the tail. */
    read(o = {}) {
      const out = [];
      for (const file of files()) {
        for (const line of linesOf(file)) {
          try {
            const rec = JSON.parse(line);
            if (o.event && rec.event !== o.event) continue;
            if (o.since && rec.seq <= o.since) continue;
            out.push(rec);
          } catch {
            /* reported by verify() */
          }
        }
      }
      return o.limit ? out.slice(-Math.max(0, o.limit)) : out;
    },

    /**
     * Walk the chain. Reports the FIRST break and stops — after a break every
     * later link is unverifiable anyway, and a list of 400 "errors" that are all
     * one deletion reads as a broken tool rather than a broken log.
     */
    verify() {
      let prev = GENESIS;
      let expectedSeq = 1;
      let count = 0;
      for (const file of files()) {
        const lines = linesOf(file);
        for (let i = 0; i < lines.length; i += 1) {
          let rec;
          try {
            rec = JSON.parse(lines[i]);
          } catch {
            return { ok: false, count, brokenAt: expectedSeq, reason: `unparseable line in ${path.basename(file)}` };
          }
          if (rec.seq !== expectedSeq) {
            return { ok: false, count, brokenAt: expectedSeq, reason: `sequence jumped to ${rec.seq} (records removed?)` };
          }
          if (rec.prev !== prev) {
            return { ok: false, count, brokenAt: rec.seq, reason: "prev hash does not match the record before it" };
          }
          if (rec.hash !== hashRecord(rec)) {
            return { ok: false, count, brokenAt: rec.seq, reason: "record was edited after it was written" };
          }
          prev = rec.hash;
          expectedSeq += 1;
          count += 1;
        }
      }
      return { ok: true, count, head: prev, brokenAt: null, reason: null };
    },

    /** Records Cortex has not acknowledged. Never dropped, so an outage is recoverable. */
    pending(limit = 200) {
      return this.read({ since: lastSynced(), limit });
    },

    markSynced(seq) {
      try {
        ensureDir();
        const n = Math.max(lastSynced(), Number(seq) || 0);
        fs.writeFileSync(syncPath(), JSON.stringify({ lastSyncedSeq: n }, null, 2), { mode: 0o600 });
        return n;
      } catch (err) {
        onError(err);
        return lastSynced();
      }
    },

    lastSynced,

    head() {
      return { ...ensureHead() };
    },
  };
}

/** One line a human can read. The HUD and the CLI both render from this. */
function describeRecord(rec) {
  if (!rec || typeof rec !== "object") return "";
  const time = String(rec.iso || "").slice(11, 19);
  const p = rec.payload || {};
  const a = p.action || {};
  const bits = [`#${rec.seq}`, time, rec.event];

  if (a.type) {
    const what = a.target || a.targetText || a.value || "";
    bits.push(what ? `${a.type} "${String(what).slice(0, 60)}"` : a.type);
  }
  if (p.app) bits.push(`in ${p.app}`);
  if (p.mandate_id) bits.push(`under mandate ${p.mandate_id}`);
  else if (p.approved_by) bits.push(`approved by ${p.approved_by}`);
  if (p.disposition) bits.push(`[${p.disposition}]`);
  if (p.ok === true) bits.push(p.ms != null ? `ok (${p.ms}ms)` : "ok");
  if (p.ok === false) bits.push(p.error ? `FAILED: ${p.error}` : "FAILED");
  return bits.join(" · ");
}

module.exports = {
  createLedger,
  describeRecord,
  canonical,
  hashRecord,
  redact,
  redactAction,
  isRedactedKey,
  REDACT_KEYS,
  GENESIS,
  LEDGER_VERSION,
};
