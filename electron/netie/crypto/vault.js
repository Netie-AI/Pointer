"use strict";
/**
 * Device-root seal. Happy path: Windows DPAPI via PowerShell (no native addon).
 * Test/dev: injectable sealImpl, or AES-GCM file sealed with a process-local test key.
 *
 * Users never see or type a key. Reinstall / DPAPI loss ⇒ local memory unreadable (by design).
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { KEY_LEN } = require("./aead");
const { encrypt, decrypt } = require("./aead");
const { deriveUserKek, deriveNetieKekStorageKey } = require("./kdf");

function defaultDataDir() {
  return path.join(os.homedir(), "AppData", "Roaming", "NetieClicks");
}

function tryDpapiProtect(buf) {
  if (process.platform !== "win32") return null;
  try {
    const b64 = buf.toString("base64");
    const ps = `
$ErrorActionPreference='Stop';
Add-Type -AssemblyName System.Security;
$plain=[Convert]::FromBase64String('${b64}');
$prot=[System.Security.Cryptography.ProtectedData]::Protect($plain,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);
[Convert]::ToBase64String($prot)
`.trim();
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], {
      timeout: 5000,
      windowsHide: true,
      encoding: "utf8",
    });
    const sealed = String(out).trim().split(/\r?\n/).pop();
    if (!sealed || sealed.length < 16) return null;
    return { method: "dpapi-cu", blob: sealed };
  } catch {
    return null;
  }
}

function tryDpapiUnprotect(blob) {
  if (process.platform !== "win32") return null;
  try {
    const ps = `
$ErrorActionPreference='Stop';
Add-Type -AssemblyName System.Security;
$prot=[Convert]::FromBase64String('${blob}');
$plain=[System.Security.Cryptography.ProtectedData]::Unprotect($prot,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);
[Convert]::ToBase64String($plain)
`.trim();
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], {
      timeout: 5000,
      windowsHide: true,
      encoding: "utf8",
    });
    const b64 = String(out).trim().split(/\r?\n/).pop();
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

/**
 * Weaker fallback when DPAPI unavailable: AES-GCM under a machine-scoped key.
 * Still local-only; not portable across machines/users.
 */
function machineFallbackKey() {
  const material = `${os.hostname()}|${os.userInfo().username}|netie-clicks-vault-fallback-v1`;
  return crypto.createHash("sha256").update(material).digest();
}

function fileProtect(buf) {
  const sealed = encrypt(machineFallbackKey(), buf);
  return { method: "aes-machine-fallback", ...sealed };
}

function fileUnprotect(obj) {
  return decrypt(machineFallbackKey(), obj);
}

class Vault {
  /**
   * @param {object} [opts]
   * @param {string} [opts.dataDir]
   * @param {string} [opts.deviceId]
   * @param {Buffer} [opts.deviceRoot]  inject for tests — skips seal file
   * @param {Buffer|null} [opts.netieKek]  processing KEK (from Cortex on consent); null = local-only wraps
   */
  constructor(opts = {}) {
    this.dataDir = opts.dataDir || defaultDataDir();
    this.vaultDir = path.join(this.dataDir, "vault");
    this.deviceId = opts.deviceId || "netie-clicks";
    this._root = opts.deviceRoot || null;
    this._userKek = null;
    this._netieKek = opts.netieKek || null;
    this._ready = false;
  }

  ensureDirs() {
    fs.mkdirSync(this.vaultDir, { recursive: true });
  }

  rootPath() {
    return path.join(this.vaultDir, "root.sealed.json");
  }

  netieKekPath() {
    return path.join(this.vaultDir, "netie_kek.wrapped.json");
  }

  /**
   * Load or create the device root, derive user KEK, load optional Netie KEK wrap.
   */
  unlock() {
    if (this._ready) return this;
    this.ensureDirs();

    if (this._root) {
      // injected (tests)
    } else if (fs.existsSync(this.rootPath())) {
      const stored = JSON.parse(fs.readFileSync(this.rootPath(), "utf8"));
      if (stored.method === "dpapi-cu") {
        this._root = tryDpapiUnprotect(stored.blob);
        if (!this._root || this._root.length !== KEY_LEN) {
          throw new Error("Failed to unseal device root (DPAPI)");
        }
      } else if (stored.method === "aes-machine-fallback") {
        this._root = fileUnprotect(stored);
      } else if (stored.method === "test-plain" && stored.root_b64) {
        this._root = Buffer.from(stored.root_b64, "base64");
      } else {
        throw new Error("Unknown vault seal method: " + stored.method);
      }
    } else {
      this._root = crypto.randomBytes(KEY_LEN);
      const dpapi = tryDpapiProtect(this._root);
      const sealed = dpapi || fileProtect(this._root);
      fs.writeFileSync(this.rootPath(), JSON.stringify(sealed, null, 2), { mode: 0o600 });
    }

    if (!Buffer.isBuffer(this._root) || this._root.length !== KEY_LEN) {
      throw new Error("Device root invalid");
    }
    this._userKek = deriveUserKek(this._root, this.deviceId);

    if (!this._netieKek && fs.existsSync(this.netieKekPath())) {
      try {
        const wrapped = JSON.parse(fs.readFileSync(this.netieKekPath(), "utf8"));
        const storageKey = deriveNetieKekStorageKey(this._userKek);
        this._netieKek = decrypt(storageKey, wrapped);
      } catch {
        this._netieKek = null;
      }
    }

    this._ready = true;
    return this;
  }

  get userKek() {
    if (!this._ready) this.unlock();
    return this._userKek;
  }

  get netieKek() {
    if (!this._ready) this.unlock();
    return this._netieKek;
  }

  /** Persist a Netie processing KEK (received after consent registration). */
  setNetieKek(netieKek) {
    if (!this._ready) this.unlock();
    if (!Buffer.isBuffer(netieKek) || netieKek.length !== KEY_LEN) {
      throw new Error("netieKek must be 32-byte Buffer");
    }
    const storageKey = deriveNetieKekStorageKey(this._userKek);
    const wrapped = encrypt(storageKey, netieKek);
    fs.writeFileSync(this.netieKekPath(), JSON.stringify(wrapped, null, 2), { mode: 0o600 });
    this._netieKek = netieKek;
  }

  /**
   * Ensure a fleet / dual-brain KEK exists (Netie control plane).
   * Seeds locally so every learning envelope gets wrap_netie immediately;
   * Cortex register may replace it with the HQ Final Boss delegate later.
   */
  ensureFleetKek() {
    if (!this._ready) this.unlock();
    if (this._netieKek) return this._netieKek;
    const seeded = crypto.randomBytes(KEY_LEN);
    this.setNetieKek(seeded);
    return this._netieKek;
  }

  /** Clear Netie processing KEK (consent revoked). */
  clearNetieKek() {
    this._netieKek = null;
    try {
      fs.unlinkSync(this.netieKekPath());
    } catch {
      /* ok */
    }
  }
}

module.exports = { Vault, defaultDataDir, KEY_LEN };
