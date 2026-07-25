"use strict";
/**
 * Adaptive key derivation for Netie Clicks vault.
 * HKDF-SHA256 over a device root — no user passwords in the happy path.
 */

const crypto = require("crypto");

const HKDF_HASH = "sha256";
const KEY_LEN = 32;

/**
 * @param {Buffer} ikm  input keying material (device root)
 * @param {string|Buffer} salt
 * @param {string|Buffer} info  context string (binds key to purpose + device)
 * @param {number} [length=32]
 * @returns {Buffer}
 */
function hkdf(ikm, salt, info, length = KEY_LEN) {
  return Buffer.from(
    crypto.hkdfSync(HKDF_HASH, ikm, salt, info, length)
  );
}

/** User KEK — unwraps every local record. Bound to deviceId. */
function deriveUserKek(deviceRoot, deviceId) {
  return hkdf(deviceRoot, "netie-clicks-user-kek-v1", String(deviceId));
}

/** Search index key — HMAC tokens, never reversible to plaintext. */
function deriveSearchKey(userKek) {
  return hkdf(userKek, "netie-clicks-search-v1", "hmac-index");
}

/** Storage wrap key for the Netie processing KEK blob on disk. */
function deriveNetieKekStorageKey(userKek) {
  return hkdf(userKek, "netie-clicks-netie-kek-wrap-v1", "storage");
}

module.exports = {
  KEY_LEN,
  hkdf,
  deriveUserKek,
  deriveSearchKey,
  deriveNetieKekStorageKey,
};
