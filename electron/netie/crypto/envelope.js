"use strict";
/**
 * Dual-envelope records.
 *
 * Every record is sealed under a fresh DEK. The DEK is wrapped twice:
 *   wrap_user  — device user KEK (user can always decrypt / export / delete)
 *   wrap_netie — Netie processing KEK (server-side training only when consented)
 *
 * Netie alone can NEVER open a record that lacks a usable wrap_user path on device.
 * Hash is integrity-only (SHA-256) — never used as a key or unlock.
 */

const crypto = require("crypto");
const { encrypt, decrypt, wrapKey, unwrapKey, KEY_LEN } = require("./aead");

function canonicalBytes(rec) {
  // Stable order — hash covers everything that must not silently change.
  const parts = [
    String(rec.v),
    String(rec.id),
    String(rec.type || ""),
    String(rec.lineage_id || ""),
    rec.wrap_user.iv,
    rec.wrap_user.tag,
    rec.wrap_user.ct,
    rec.wrap_netie ? rec.wrap_netie.iv : "",
    rec.wrap_netie ? rec.wrap_netie.tag : "",
    rec.wrap_netie ? rec.wrap_netie.ct : "",
    rec.body.iv,
    rec.body.tag,
    rec.body.ct,
  ];
  return Buffer.from(parts.join("|"), "utf8");
}

function integrityHash(rec) {
  return crypto.createHash("sha256").update(canonicalBytes(rec)).digest("hex");
}

function verifyIntegrity(rec) {
  if (!rec || !rec.hash) return false;
  const expected = integrityHash({ ...rec, hash: undefined });
  try {
    return crypto.timingSafeEqual(Buffer.from(rec.hash, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Build a dual-wrapped envelope.
 * @param {object} opts
 * @param {string} opts.id
 * @param {string} opts.type  memory|telemetry|…
 * @param {object|string|Buffer} opts.payload  plaintext JSON-able or Buffer
 * @param {Buffer} opts.userKek
 * @param {Buffer|null} opts.netieKek  optional — if null, wrap_netie omitted (local-only)
 * @param {string} [opts.lineageId]
 */
function sealRecord({ id, type, payload, userKek, netieKek = null, lineageId }) {
  const dek = crypto.randomBytes(KEY_LEN);
  const plain =
    Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload), "utf8");

  const body = encrypt(dek, plain, Buffer.from(String(id), "utf8"));
  const wrap_user = wrapKey(userKek, dek);
  const wrap_netie = netieKek ? wrapKey(netieKek, dek) : null;

  const base = {
    v: 1,
    id: String(id),
    type: String(type || "memory"),
    lineage_id: lineageId || crypto.randomUUID(),
    wrap_user,
    wrap_netie,
    body,
  };
  return { ...base, hash: integrityHash(base) };
}

/**
 * Open a record with the user KEK. Verifies integrity first.
 * @returns {{ plaintext: Buffer, lineage_id: string, type: string }}
 */
function openWithUserKek(rec, userKek) {
  if (!verifyIntegrity(rec)) {
    throw new Error("Envelope integrity check failed (tamper or corruption)");
  }
  if (!rec.wrap_user) throw new Error("Record missing wrap_user — cannot open as user");
  const dek = unwrapKey(userKek, rec.wrap_user);
  const plaintext = decrypt(dek, rec.body, Buffer.from(String(rec.id), "utf8"));
  return { plaintext, lineage_id: rec.lineage_id, type: rec.type };
}

/**
 * Open with Netie processing KEK (server-side / consented upload path).
 * Still requires integrity. Does NOT replace user export rights.
 */
function openWithNetieKek(rec, netieKek) {
  if (!verifyIntegrity(rec)) {
    throw new Error("Envelope integrity check failed (tamper or corruption)");
  }
  if (!rec.wrap_netie) throw new Error("Record has no wrap_netie — not eligible for Netie processing");
  const dek = unwrapKey(netieKek, rec.wrap_netie);
  const plaintext = decrypt(dek, rec.body, Buffer.from(String(rec.id), "utf8"));
  return { plaintext, lineage_id: rec.lineage_id, type: rec.type };
}

module.exports = {
  integrityHash,
  verifyIntegrity,
  sealRecord,
  openWithUserKek,
  openWithNetieKek,
};
