"use strict";
/**
 * AES-256-GCM AEAD + DEK wrap helpers.
 * Tag is authenticated; wrong key / tamper → hard fail (no partial plaintext).
 */

const crypto = require("crypto");

const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_LEN) {
    throw new Error("AEAD key must be 32-byte Buffer");
  }
}

/**
 * Encrypt plaintext under key. Returns { iv, tag, ct } as base64 strings.
 * @param {Buffer} key
 * @param {Buffer|string} plaintext
 * @param {Buffer} [aad]
 */
function encrypt(key, plaintext, aad) {
  assertKey(key);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(aad);
  const pt = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  };
}

/**
 * Decrypt { iv, tag, ct }. Throws on auth failure.
 * @returns {Buffer}
 */
function decrypt(key, sealed, aad) {
  assertKey(key);
  const iv = Buffer.from(sealed.iv, "base64");
  const tag = Buffer.from(sealed.tag, "base64");
  const ct = Buffer.from(sealed.ct, "base64");
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("AEAD sealed blob has invalid iv/tag length");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Wrap a 32-byte DEK under a KEK. */
function wrapKey(kek, dek) {
  assertKey(kek);
  assertKey(dek);
  return encrypt(kek, dek);
}

/** Unwrap DEK. Throws on wrong KEK / tamper. */
function unwrapKey(kek, wrapped) {
  const dek = decrypt(kek, wrapped);
  if (dek.length !== KEY_LEN) throw new Error("Unwrapped DEK has wrong length");
  return dek;
}

module.exports = {
  IV_LEN,
  TAG_LEN,
  KEY_LEN,
  encrypt,
  decrypt,
  wrapKey,
  unwrapKey,
};
