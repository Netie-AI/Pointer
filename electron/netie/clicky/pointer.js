"use strict";
/**
 * Swaps the real Windows pointer between Netie's three faces.
 *
 * Windows has no per-application cursor for *other* apps' windows, so driving
 * the pointer while Netie acts on your behalf means setting the user cursor
 * (HKCU\Control Panel\Cursors) and broadcasting SPI_SETCURSORS. That is a real
 * user setting, so this module treats restore as the primary obligation:
 *
 *  - the original Arrow/AppStarting values are captured BEFORE the first swap
 *  - restore() is idempotent and safe to call when nothing was changed
 *  - the saved originals are also written to disk, so a crash mid-agent-run can
 *    still be undone on next launch instead of leaving a smiley pointer forever
 *
 * Nothing here runs unless the app explicitly enables it.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const KEY = "HKCU\\Control Panel\\Cursors";
// Arrow is the idle pointer; AppStarting is the "busy but usable" one Windows
// shows for background work — the natural slot for the agent face.
const SLOTS = Object.freeze({ normal: "Arrow", click: "Hand", agent: "AppStarting" });

const MODES = Object.freeze({
  NORMAL: "normal",
  CLICK: "click",
  AGENT: "agent",
});

class Pointer {
  constructor(opts = {}) {
    this.dir = opts.cursorDir || path.join(__dirname, "..", "..", "..", "assets", "cursors");
    this.backupFile =
      opts.backupFile || path.join(os.homedir(), ".netie-clicks-cursor-backup.json");
    this._exec = opts.execFileImpl || execFile;
    this._fs = opts.fsImpl || fs;
    this.enabled = opts.enabled === true; // opt-in, never on by default
    this.mode = MODES.NORMAL;
    this.original = null;
    this.applied = false;
  }

  file(mode) {
    // The agent face is animated; the other two are static.
    return path.join(this.dir, mode === MODES.AGENT ? "netie-agent.ani" : `netie-${mode}.cur`);
  }

  _ps(script) {
    return new Promise((resolve, reject) => {
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      this._exec(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
        { windowsHide: true, timeout: 15000 },
        (err, stdout) => (err ? reject(err) : resolve(String(stdout || "").trim()))
      );
    });
  }

  /** Read and persist the user's current cursors so we can always put them back. */
  async captureOriginal() {
    if (this.original) return this.original;
    // Reuse a backup from a previous run that never restored (e.g. a crash).
    try {
      if (this._fs.existsSync(this.backupFile)) {
        this.original = JSON.parse(this._fs.readFileSync(this.backupFile, "utf8"));
        return this.original;
      }
    } catch {
      /* unreadable backup — recapture below */
    }
    const names = Object.values(SLOTS);
    const out = await this._ps(
      `$p = Get-ItemProperty -Path '${KEY}'
       $o = @{}
       foreach ($n in @(${names.map((n) => `'${n}'`).join(",")})) { $o[$n] = [string]$p.$n }
       $o | ConvertTo-Json -Compress`
    );
    this.original = JSON.parse(out || "{}");
    try {
      this._fs.writeFileSync(this.backupFile, JSON.stringify(this.original));
    } catch {
      /* best effort; in-memory restore still works */
    }
    return this.original;
  }

  /** Apply one of the Netie faces. No-op unless enabled. */
  async set(mode) {
    if (!this.enabled) return { ok: false, skipped: "disabled" };
    if (!Object.values(MODES).includes(mode)) return { ok: false, error: `unknown mode ${mode}` };
    const file = this.file(mode);
    if (!this._fs.existsSync(file)) return { ok: false, error: `missing cursor ${file}` };
    await this.captureOriginal();
    const slot = SLOTS[mode];
    await this._ps(
      `Set-ItemProperty -Path '${KEY}' -Name '${slot}' -Value '${file.replace(/'/g, "''")}'
       ${RELOAD}`
    );
    this.mode = mode;
    this.applied = true;
    return { ok: true, mode, slot, file };
  }

  /** Put every touched slot back exactly as we found it. */
  async restore() {
    if (!this.original) return { ok: true, skipped: "nothing captured" };
    const sets = Object.entries(this.original)
      .map(([name, value]) =>
        value
          ? `Set-ItemProperty -Path '${KEY}' -Name '${name}' -Value '${String(value).replace(/'/g, "''")}'`
          : `Remove-ItemProperty -Path '${KEY}' -Name '${name}' -ErrorAction SilentlyContinue`
      )
      .join("\n");
    await this._ps(`${sets}\n${RELOAD}`);
    try {
      if (this._fs.existsSync(this.backupFile)) this._fs.unlinkSync(this.backupFile);
    } catch {
      /* best effort */
    }
    this.applied = false;
    this.mode = MODES.NORMAL;
    return { ok: true };
  }
}

// SystemParametersInfo(SPI_SETCURSORS) — without this the registry change does
// not take effect until the next sign-in.
const RELOAD = `
Add-Type -MemberDefinition '[DllImport("user32.dll", SetLastError=true)] public static extern bool SystemParametersInfo(uint a,uint b,IntPtr c,uint d);' -Name NetieCur -Namespace W32 | Out-Null
[W32.NetieCur]::SystemParametersInfo(0x0057,0,[IntPtr]::Zero,0x02) | Out-Null`;

module.exports = { Pointer, MODES, SLOTS, KEY };
