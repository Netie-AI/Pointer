"use strict";
/**
 * Windows input driver for Netie Clicks.
 * Uses PowerShell + user32 SendInput — no native Electron addon rebuild.
 *
 * v2: one persistent PowerShell worker instead of a fresh powershell.exe +
 * Add-Type compile per action. Commands stream over a JSON-lines stdin/stdout
 * protocol, so per-action latency drops from seconds to milliseconds. The same
 * worker also answers foreground-window queries (hot-memory ticks) so armed
 * sessions stop spawning 4 processes per second.
 *
 * Coordinates are logical (DIP) screen pixels — the same space as Electron's
 * screen API. When opts.toPhysical is injected (main passes
 * screen.dipToScreenPoint) the worker receives physical pixels and declares
 * per-monitor DPI awareness, so clicks land correctly on 125%/150% scaled
 * displays. Without a converter, coordinates pass through unchanged (v1
 * behaviour, and what unit tests assert).
 *
 * Set dryRun:true in tests to skip OS calls entirely.
 * Inject spawnImpl (fake worker) to exercise the protocol off Windows.
 * Production linux/mac never inject spawnImpl: OS Act stays fail-closed.
 */

const { spawn } = require("child_process");
const { actOs, actRefuseReason, isOsAct } = require("./platform");

// C# helper + command loop. Compiled once per worker lifetime.
const WORKER_SCRIPT = `
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NetieInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public MOUSEKEYBDHARDWAREINPUT mkhi; }
  [StructLayout(LayoutKind.Explicit)]
  public struct MOUSEKEYBDHARDWAREINPUT {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
  }
  [DllImport("user32.dll", SetLastError=true)]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT pt);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr value);
  public const uint INPUT_MOUSE=0; public const uint INPUT_KEYBOARD=1;
  public const uint MOUSEEVENTF_LEFTDOWN=0x0002; public const uint MOUSEEVENTF_LEFTUP=0x0004;
  public const uint MOUSEEVENTF_RIGHTDOWN=0x0008; public const uint MOUSEEVENTF_RIGHTUP=0x0010;
  public const uint MOUSEEVENTF_WHEEL=0x0800;
  public const uint KEYEVENTF_KEYUP=0x0002; public const uint KEYEVENTF_UNICODE=0x0004;
  public static void Init() {
    // Per-monitor DPI aware v2 — SetCursorPos/SendInput take physical pixels.
    try { SetProcessDpiAwarenessContext((IntPtr)(-4)); } catch {}
  }
  public static void Click(int x, int y, bool right) {
    SetCursorPos(x,y);
    INPUT[] a = new INPUT[2];
    a[0].type=INPUT_MOUSE; a[1].type=INPUT_MOUSE;
    uint down = right?MOUSEEVENTF_RIGHTDOWN:MOUSEEVENTF_LEFTDOWN;
    uint up = right?MOUSEEVENTF_RIGHTUP:MOUSEEVENTF_LEFTUP;
    a[0].mkhi.mi.dwFlags=down; a[1].mkhi.mi.dwFlags=up;
    SendInput(2,a,Marshal.SizeOf(typeof(INPUT)));
  }
  public static void Wheel(int delta) {
    INPUT[] a = new INPUT[1];
    a[0].type=INPUT_MOUSE;
    a[0].mkhi.mi.dwFlags=MOUSEEVENTF_WHEEL;
    a[0].mkhi.mi.mouseData=unchecked((uint)delta);
    SendInput(1,a,Marshal.SizeOf(typeof(INPUT)));
  }
  public static void TypeUnicode(string s) {
    foreach (char c in s) {
      INPUT[] a = new INPUT[2];
      a[0].type=INPUT_KEYBOARD; a[1].type=INPUT_KEYBOARD;
      a[0].mkhi.ki.wScan=(ushort)c; a[0].mkhi.ki.dwFlags=KEYEVENTF_UNICODE;
      a[1].mkhi.ki.wScan=(ushort)c; a[1].mkhi.ki.dwFlags=KEYEVENTF_UNICODE|KEYEVENTF_KEYUP;
      SendInput(2,a,Marshal.SizeOf(typeof(INPUT)));
    }
  }
  public static void TapVk(byte vk) {
    keybd_event(vk,0,0,UIntPtr.Zero);
    keybd_event(vk,0,KEYEVENTF_KEYUP,UIntPtr.Zero);
  }
  public static void Combo(byte[] mods, byte vk) {
    foreach (byte m in mods) keybd_event(m,0,0,UIntPtr.Zero);
    keybd_event(vk,0,0,UIntPtr.Zero);
    keybd_event(vk,0,KEYEVENTF_KEYUP,UIntPtr.Zero);
    for (int i=mods.Length-1; i>=0; i--) keybd_event(mods[i],0,KEYEVENTF_KEYUP,UIntPtr.Zero);
  }
  public static void Drag(int x1, int y1, int x2, int y2) {
    SetCursorPos(x1,y1);
    System.Threading.Thread.Sleep(25);
    INPUT[] down = new INPUT[1];
    down[0].type=INPUT_MOUSE; down[0].mkhi.mi.dwFlags=MOUSEEVENTF_LEFTDOWN;
    SendInput(1,down,Marshal.SizeOf(typeof(INPUT)));
    System.Threading.Thread.Sleep(40);
    SetCursorPos(x2,y2);
    System.Threading.Thread.Sleep(40);
    INPUT[] up = new INPUT[1];
    up[0].type=INPUT_MOUSE; up[0].mkhi.mi.dwFlags=MOUSEEVENTF_LEFTUP;
    SendInput(1,up,Marshal.SizeOf(typeof(INPUT)));
  }
  public static string FgInfo() {
    IntPtr h = GetForegroundWindow();
    var sb = new System.Text.StringBuilder(512);
    GetWindowText(h, sb, sb.Capacity);
    uint pid = 0; GetWindowThreadProcessId(h, out pid);
    return pid.ToString() + "|" + sb.ToString();
  }
}
"@
[NetieInput]::Init()
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
[Console]::Out.WriteLine('{"ready":true}')
$done = $false
while (-not $done) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if (-not $line.Trim()) { continue }
  $r = @{ id = $null; ok = $true }
  try {
    $m = $line | ConvertFrom-Json
    $r.id = $m.id
    switch ($m.op) {
      'move'  { [NetieInput]::SetCursorPos([int]$m.x, [int]$m.y) | Out-Null }
      'pos'   {
        $pt = New-Object NetieInput+POINT
        [NetieInput]::GetCursorPos([ref]$pt) | Out-Null
        $r.x = $pt.X; $r.y = $pt.Y
      }
      'click' { [NetieInput]::Click([int]$m.x, [int]$m.y, [bool]$m.right) }
      'drag'  { [NetieInput]::Drag([int]$m.x1, [int]$m.y1, [int]$m.x2, [int]$m.y2) }
      'wheel' {
        if ($m.move) { [NetieInput]::SetCursorPos([int]$m.x, [int]$m.y) | Out-Null }
        [NetieInput]::Wheel([int]$m.delta)
      }
      'type'  { [NetieInput]::TypeUnicode([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($m.b64))) }
      'tap'   { [NetieInput]::TapVk([byte]$m.vk) }
      'combo' { [NetieInput]::Combo([byte[]]$m.mods, [byte]$m.vk) }
      'clip_set' {
        $text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($m.b64))
        Set-Clipboard -Value $text
      }
      'clip_get' {
        try { $r.text = [string](Get-Clipboard -Raw -ErrorAction Stop) } catch { $r.text = '' }
      }
      'open' {
        $target = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($m.b64))
        if (-not $target) { throw 'empty open target' }
        Start-Process $target | Out-Null
      }
      'fg'    {
        $info = [NetieInput]::FgInfo()
        $parts = $info -split '\\|', 2
        $pname = '?'
        try { $pname = (Get-Process -Id ([int]$parts[0]) -ErrorAction Stop).ProcessName } catch {}
        $r.title = $parts[1]; $r.proc = $pname
      }
      'exit'  { $done = $true }
      default { $r.ok = $false; $r.error = "unknown op: $($m.op)" }
    }
  } catch { $r.ok = $false; $r.error = "$_" }
  [Console]::Out.WriteLine((ConvertTo-Json $r -Compress))
}
`;

const VK = {
  enter: 0x0d,
  tab: 0x09,
  escape: 0x1b,
  esc: 0x1b,
  backspace: 0x08,
  delete: 0x2e,
  space: 0x20,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  insert: 0x2d,
  f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75,
  f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7a, f12: 0x7b,
};

const MOD_VK = {
  ctrl: 0x11,
  control: 0x11,
  shift: 0x10,
  alt: 0x12,
  win: 0x5b,
  meta: 0x5b,
};

/** VK code for a single key name/char, or null. */
function vkOf(key) {
  const k = String(key || "").toLowerCase();
  if (VK[k] != null) return VK[k];
  if (k.length === 1) {
    const c = k.charCodeAt(0);
    if (c >= 0x61 && c <= 0x7a) return c - 0x20; // a-z → 0x41-0x5A
    if (c >= 0x30 && c <= 0x39) return c; // 0-9
  }
  return null;
}

/**
 * Parse "s", "enter", or "ctrl+shift+s" into { mods:[vk], vk, key }.
 * Returns null when any part is unknown.
 */
function parseKeyCombo(input) {
  const parts = String(input || "")
    .toLowerCase()
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const key = parts.pop();
  const vk = vkOf(key);
  if (vk == null) return null;
  const mods = [];
  for (const p of parts) {
    const mv = MOD_VK[p];
    if (mv == null) return null;
    mods.push(mv);
  }
  return { mods, vk, key };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Map a word-coworker structured refusal onto the driver contract.
 *
 * writeDocx/appendDocx return `{ ok:false, reason }` with no `error`.
 * perform used to `return { ok: true, type, ...result }`, which only became a
 * failure because result.ok overwrote the literal true. executeApproved then
 * did `outcome.error || "unknown"`, so a real empty/containment refusal showed
 * "failed: unknown" and Plan finished (R-0011).
 */
function coworkerOutcome(type, result, extra = {}) {
  const ok = Boolean(result && result.ok);
  const error = ok
    ? undefined
    : String((result && (result.error || result.reason)) || extra.error || "unknown");
  return { type, ...result, ...extra, ok, ...(error ? { error } : {}) };
}

class InputDriver {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.dryRun]      skip OS calls (unit tests)
   * @param {function} [opts.toPhysical] DIP → physical px converter ({x,y} → {x,y})
   * @param {function} [opts.spawnImpl]  inject child_process.spawn (tests)
   * @param {number} [opts.opTimeoutMs]  per-op timeout (default 8000)
   */
  constructor(opts = {}) {
    this.dryRun = Boolean(opts.dryRun);
    this.toPhysical = opts.toPhysical || null;
    this._spawn = opts.spawnImpl || spawn;
    // Production never injects spawnImpl. A fake worker is the unit harness
    // so linux/mac CI can still assert the JSON-lines protocol.
    this._harness = typeof opts.spawnImpl === "function";
    this._opTimeoutMs = opts.opTimeoutMs || 8000;
    this._startTimeoutMs = opts.startTimeoutMs || 15000;
    this.last = null;
    this._worker = null;
    this._ready = null;
    this._pending = new Map(); // id → { resolve, reject, timer }
    this._seq = 0;
    this._buf = "";
  }

  _phys(x, y) {
    const xi = Math.round(Number(x));
    const yi = Math.round(Number(y));
    if (!this.toPhysical) return { x: xi, y: yi };
    try {
      const p = this.toPhysical({ x: xi, y: yi });
      return { x: Math.round(p.x), y: Math.round(p.y) };
    } catch {
      return { x: xi, y: yi };
    }
  }

  _failAll(message) {
    for (const [, p] of this._pending) {
      clearTimeout(p.timer);
      p.reject(new Error(message));
    }
    this._pending.clear();
  }

  _killWorker(reason) {
    const w = this._worker;
    this._worker = null;
    this._ready = null;
    this._failAll(`input worker killed: ${reason}`);
    if (w) {
      try {
        w.kill();
      } catch {
        /* already gone */
      }
    }
  }

  _allowOsAct() {
    return this.dryRun || this._harness || actOs();
  }

  _ensureWorker() {
    if (this._worker) return this._worker;
    if (!this._allowOsAct()) {
      throw new Error(actRefuseReason());
    }
    const encoded = Buffer.from(WORKER_SCRIPT, "utf16le").toString("base64");
    const child = this._spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
    );
    this._worker = child;
    this._buf = "";

    let readyResolve, readyReject;
    this._ready = new Promise((res, rej) => {
      readyResolve = res;
      readyReject = rej;
    });
    this._ready.catch(() => {}); // observed later per-send
    const readyTimer = setTimeout(
      () => readyReject(new Error("input worker failed to start")),
      this._startTimeoutMs
    );
    if (readyTimer.unref) readyTimer.unref();

    if (child.stdout.setEncoding) child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      this._buf += chunk;
      let nl;
      while ((nl = this._buf.indexOf("\n")) >= 0) {
        const line = this._buf.slice(0, nl).trim();
        this._buf = this._buf.slice(nl + 1);
        if (!line.startsWith("{")) continue; // Add-Type chatter etc.
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        if (obj.ready) {
          clearTimeout(readyTimer);
          readyResolve();
          continue;
        }
        const p = this._pending.get(obj.id);
        if (!p) continue;
        this._pending.delete(obj.id);
        clearTimeout(p.timer);
        if (obj.ok === false) p.reject(new Error(obj.error || "input op failed"));
        else p.resolve(obj);
      }
    });
    if (child.stderr) child.stderr.on("data", () => {});
    const onGone = () => {
      clearTimeout(readyTimer);
      if (this._worker === child) {
        this._worker = null;
        this._ready = null;
      }
      this._failAll("input worker exited");
    };
    child.on("exit", onGone);
    child.on("error", onGone);
    return child;
  }

  async _send(cmd, { timeoutMs } = {}) {
    if (this.dryRun) return { ok: true, dryRun: true };
    const worker = this._ensureWorker();
    await this._ready;
    const id = ++this._seq;
    const line = `${JSON.stringify({ ...cmd, id })}\n`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        this._killWorker(`op timeout (${cmd.op})`);
        reject(new Error(`input worker timeout on ${cmd.op}`));
      }, timeoutMs || this._opTimeoutMs);
      this._pending.set(id, { resolve, reject, timer });
      try {
        worker.stdin.write(line);
      } catch (err) {
        this._pending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /** Graceful worker shutdown (call on app quit). */
  dispose() {
    const w = this._worker;
    this._worker = null;
    this._ready = null;
    this._failAll("driver disposed");
    if (w) {
      try {
        w.stdin.write('{"op":"exit","id":0}\n');
      } catch {
        /* gone */
      }
      const t = setTimeout(() => {
        try {
          w.kill();
        } catch {
          /* gone */
        }
      }, 400);
      if (t.unref) t.unref();
    }
  }

  /** Foreground window { title, proc } via the same worker — no process spawn per tick. */
  async foreground() {
    if (this.dryRun || (!actOs() && !this._harness)) return { title: "?", proc: "?" };
    const r = await this._send({ op: "fg" }, { timeoutMs: 2500 });
    return { title: r.title || "?", proc: r.proc || "?" };
  }

  async moveTo(x, y) {
    const xi = Math.round(Number(x));
    const yi = Math.round(Number(y));
    this.last = { op: "move", x: xi, y: yi };
    if (this.dryRun) return this.last;
    const p = this._phys(xi, yi);
    await this._send({ op: "move", x: p.x, y: p.y });
    return this.last;
  }

  /**
   * Ease the pointer to (x,y) so the user sees Netie travel — not teleport.
   * Skips animation when already close or dry-run.
   */
  async moveToAnimated(x, y, { durationMs = 280, steps = 18 } = {}) {
    const xi = Math.round(Number(x));
    const yi = Math.round(Number(y));
    this.last = { op: "move_animated", x: xi, y: yi, durationMs, steps };
    if (this.dryRun) return this.last;
    const p1 = this._phys(xi, yi);
    // Worker returns physical pixels; do not dip-convert again.
    const from = await this._send({ op: "pos" }, { timeoutMs: 1500 }).catch(() => null);
    const p0 =
      from && from.x != null && from.y != null
        ? { x: Math.round(Number(from.x)), y: Math.round(Number(from.y)) }
        : p1;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) {
      await this._send({ op: "move", x: p1.x, y: p1.y });
      return this.last;
    }
    const n = Math.max(4, Math.min(40, Number(steps) || 18));
    const frame = Math.max(8, Math.round((Number(durationMs) || 280) / n));
    for (let i = 1; i <= n; i += 1) {
      // Ease-out cubic so it decelerates into the target.
      const t = i / n;
      const e = 1 - Math.pow(1 - t, 3);
      await this._send({
        op: "move",
        x: Math.round(p0.x + dx * e),
        y: Math.round(p0.y + dy * e),
      });
      if (i < n) await sleep(frame);
    }
    return this.last;
  }

  async clickAt(x, y, { button = "left", double = false } = {}) {
    const xi = Math.round(Number(x));
    const yi = Math.round(Number(y));
    const right = button === "right";
    this.last = { op: double ? "doubleclick" : "click", x: xi, y: yi, button };
    if (this.dryRun) return this.last;
    const p = this._phys(xi, yi);
    await this._send({ op: "click", x: p.x, y: p.y, right });
    if (double) {
      await sleep(80);
      await this._send({ op: "click", x: p.x, y: p.y, right });
    }
    return this.last;
  }

  async typeText(text) {
    const s = String(text ?? "");
    this.last = { op: "type", len: s.length };
    if (this.dryRun) return this.last;
    await this._send({ op: "type", b64: Buffer.from(s, "utf8").toString("base64") });
    return this.last;
  }

  async press(key) {
    const name = String(key || "").toLowerCase();
    const combo = parseKeyCombo(name);
    if (!combo) throw new Error(`Unsupported key: ${key}`);
    this.last = { op: "press", key: name, vk: combo.vk, mods: combo.mods };
    if (this.dryRun) return this.last;
    if (combo.mods.length) await this._send({ op: "combo", mods: combo.mods, vk: combo.vk });
    else await this._send({ op: "tap", vk: combo.vk });
    return this.last;
  }

  /**
   * Real mouse-wheel scroll. Negative deltaY scrolls down (one notch = 120).
   * Optional at:{x,y} moves the cursor over the scroll target first.
   */
  async scroll(deltaY = -120, at = null) {
    const delta = Math.round(Number(deltaY)) || -120;
    this.last = { op: "scroll", deltaY: delta, at: at || null };
    if (this.dryRun) return this.last;
    const cmd = { op: "wheel", delta, move: false };
    if (at && at.x != null && at.y != null) {
      const p = this._phys(at.x, at.y);
      cmd.move = true;
      cmd.x = p.x;
      cmd.y = p.y;
    }
    await this._send(cmd);
    return this.last;
  }

  /** Drag from (x1,y1) to (x2,y2) in DIP/screen space. */
  async drag(x1, y1, x2, y2) {
    const a = { x: Math.round(Number(x1)), y: Math.round(Number(y1)) };
    const b = { x: Math.round(Number(x2)), y: Math.round(Number(y2)) };
    this.last = { op: "drag", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    if (this.dryRun) return this.last;
    const p1 = this._phys(a.x, a.y);
    const p2 = this._phys(b.x, b.y);
    await this._send({ op: "drag", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    return this.last;
  }

  /** Set system clipboard text (UTF-8). */
  async clipboardSet(text) {
    const s = String(text ?? "");
    this.last = { op: "clip_set", len: s.length };
    if (this.dryRun) return this.last;
    await this._send({ op: "clip_set", b64: Buffer.from(s, "utf8").toString("base64") });
    return this.last;
  }

  /** Read system clipboard text. */
  async clipboardGet() {
    this.last = { op: "clip_get" };
    if (this.dryRun) return { ...this.last, text: "" };
    const r = await this._send({ op: "clip_get" });
    return { ...this.last, text: r.text || "" };
  }

  /** Open URL or local path via Start-Process (ShellExecute). */
  /**
   * Prove a copy actually happened, when there is no source text to compare
   * against (#16).
   *
   * The signal available is the baseline recorded by `clipboard_baseline`: if
   * the clipboard still holds exactly what it held before the copy, the copy did
   * not fire. That is the normal case in a terminal, where Ctrl+C sends SIGINT
   * rather than copying - and it is precisely the case the old code accepted,
   * writing unrelated stale clipboard content into a .docx with ok: true.
   *
   * Re-copies once before refusing, matching the behaviour the explicit-source
   * path already had.
   *
   * @returns {Promise<{ok:boolean, text:string, reason?:string, baselineLen?:number, clipLen?:number}>}
   */
  async _provenCopy(current) {
    const baseline = this.clipboardBaseline ? this.clipboardBaseline.text : "";
    let text = current;
    if (text !== baseline && text.length) return { ok: true, text };

    // One retry, same as the explicit-source path.
    await this.press("ctrl+a");
    if (!this.dryRun) await sleep(80);
    await this.press("ctrl+c");
    if (!this.dryRun) await sleep(120);
    const again = await this.clipboardGet();
    text = again.text || "";
    if (text !== baseline && text.length) return { ok: true, text };

    if (this.dryRun) return { ok: true, text: text || baseline };
    return {
      ok: false,
      text: "",
      baselineLen: baseline.length,
      clipLen: text.length,
      // Name the mismatch and the likely cause - a refusal the customer cannot
      // act on is barely better than the silent success it replaced (R-0011).
      reason:
        `clipboard unchanged after copy (${baseline.length} chars before, ` +
        `${text.length} after) - the copy did not happen. In a terminal Ctrl+C ` +
        `interrupts rather than copies; select and copy manually, then retry.`,
    };
  }

  async openTarget(target) {
    const s = String(target || "").trim();
    if (!s) throw new Error("empty open target");
    // Block obvious shell metacharacters — Start-Process still executes, keep boring.
    if (/[\r\n|&<>^]/.test(s)) throw new Error("open target rejected");
    this.last = { op: "open", target: s.slice(0, 240) };
    if (this.dryRun) return this.last;
    await this._send({ op: "open", b64: Buffer.from(s, "utf8").toString("base64") });
    return this.last;
  }

  _resolvePoint(action, region, prefix = "") {
    const ax = action[`${prefix}screenX`] ?? action[`${prefix}x`] ?? action.screenX ?? action.x;
    const ay = action[`${prefix}screenY`] ?? action[`${prefix}y`] ?? action.screenY ?? action.y;
    const xPct = action[`${prefix}xPct`] ?? action.xPct;
    const yPct = action[`${prefix}yPct`] ?? action.yPct;
    let sx = ax;
    let sy = ay;
    if ((sx == null || sy == null) && xPct != null && yPct != null && region.width) {
      sx = region.x + (Number(xPct) / 100) * region.width;
      sy = region.y + (Number(yPct) / 100) * region.height;
    } else if (sx != null && sy != null && action.relative !== false && region.width) {
      if (action.screenX == null && action.screenY == null && !prefix) {
        sx = region.x + Number(sx);
        sy = region.y + Number(sy);
      }
    }
    return { sx, sy };
  }

  /**
   * Execute one reviewed action.
   * Stolen patterns (OpenClaw/Orca): clipboard, hotkeys, drag, open — predictable only.
   * @param {object} action
   * @param {object} [ctx]  { region: {x,y,width,height}, imageSize?: {width,height} }
   */
  async perform(action, ctx = {}) {
    const type = String(action.type || "").toLowerCase();
    if (isOsAct(type) && !this._allowOsAct()) {
      return { ok: false, error: actRefuseReason(), act: false, platform: process.platform };
    }
    const region = ctx.region || { x: 0, y: 0, width: 0, height: 0 };
    const { sx, sy } = this._resolvePoint(action, region);

    switch (type) {
      case "observe":
      case "read":
      case "wait":
        await sleep(Number(action.ms) || 150);
        return { ok: true, noop: true, type };

      case "movecursor":
      case "hover":
        if (sx == null || sy == null) return { ok: false, error: "missing coordinates" };
        await this.moveToAnimated(sx, sy);
        return { ok: true, type, x: sx, y: sy };

      case "click":
        if (sx == null || sy == null) return { ok: false, error: "missing coordinates for click" };
        await this.moveToAnimated(sx, sy, { durationMs: 220 });
        await this.clickAt(sx, sy, { button: "left" });
        return { ok: true, type, x: sx, y: sy };

      case "doubleclick":
        if (sx == null || sy == null) return { ok: false, error: "missing coordinates" };
        await this.moveToAnimated(sx, sy, { durationMs: 220 });
        await this.clickAt(sx, sy, { double: true });
        return { ok: true, type, x: sx, y: sy };

      case "rightclick":
        if (sx == null || sy == null) return { ok: false, error: "missing coordinates" };
        await this.moveToAnimated(sx, sy, { durationMs: 220 });
        await this.clickAt(sx, sy, { button: "right" });
        return { ok: true, type, x: sx, y: sy };

      case "type":
      case "fill":
      case "setvalue": {
        // Click the field first when we know where it is — typing into the
        // wrong window is the classic blind-agent failure.
        let focused = false;
        if (sx != null && sy != null) {
          await this.moveToAnimated(sx, sy, { durationMs: 220 });
          await this.clickAt(sx, sy, { button: "left" });
          if (!this.dryRun) await sleep(120);
          focused = true;
        }
        await this.typeText(action.value ?? "");
        const out = { ok: true, type, typed: String(action.value ?? "").length, focused };
        if (focused) {
          out.x = sx;
          out.y = sy;
        }
        return out;
      }

      case "paste":
      case "clipboard_paste": {
        // Prefer clipboard + Ctrl+V (OpenClaw-style) — more reliable than Unicode typing.
        if (sx != null && sy != null) {
          await this.moveToAnimated(sx, sy, { durationMs: 220 });
          await this.clickAt(sx, sy, { button: "left" });
          if (!this.dryRun) await sleep(80);
        }
        if (action.value != null && String(action.value).length) {
          await this.clipboardSet(action.value);
          if (!this.dryRun) await sleep(40);
        }
        await this.press("ctrl+v");
        return { ok: true, type, pasted: String(action.value ?? "").length };
      }

      case "clipboard_set":
        await this.clipboardSet(action.value ?? "");
        return { ok: true, type, len: String(action.value ?? "").length };

      case "clipboard_get":
      case "copy_clipboard": {
        const got = await this.clipboardGet();
        return { ok: true, type, text: got.text || "" };
      }

      case "copy":
      case "select_copy": {
        if (sx != null && sy != null) {
          await this.clickAt(sx, sy, { button: "left" });
          if (!this.dryRun) await sleep(60);
        }
        await this.press("ctrl+c");
        return { ok: true, type };
      }

      case "select_all":
        await this.press("ctrl+a");
        return { ok: true, type };

      case "press":
      case "keypress":
        await this.press(action.value || action.key || action.target);
        return { ok: true, type };

      case "scroll": {
        const at = sx != null && sy != null ? { x: sx, y: sy } : null;
        await this.scroll(action.deltaY ?? -120, at);
        return { ok: true, type, ...(at || {}) };
      }

      case "drag": {
        const end = this._resolvePoint(
          {
            x: action.endX ?? action.toX ?? action.x2,
            y: action.endY ?? action.toY ?? action.y2,
            xPct: action.endXPct ?? action.toXPct,
            yPct: action.endYPct ?? action.toYPct,
            screenX: action.endScreenX,
            screenY: action.endScreenY,
            relative: action.relative,
          },
          region
        );
        if (sx == null || sy == null || end.sx == null || end.sy == null) {
          return { ok: false, error: "drag needs start and end coordinates" };
        }
        await this.drag(sx, sy, end.sx, end.sy);
        return { ok: true, type, x: sx, y: sy, endX: end.sx, endY: end.sy };
      }

      case "navigate":
      case "open": {
        const target = action.url || action.href || action.path || action.value || action.target;
        if (!target) return { ok: false, error: "open/navigate needs url or path" };
        try {
          await this.openTarget(target);
        } catch (err) {
          return { ok: false, error: String(err.message || err) };
        }
        return { ok: true, type, target: String(target).slice(0, 240) };
      }

      case "word_docx_write": {
        const { writeDocx } = require("./word-coworker");
        const text = action.value ?? action.text ?? "";
        const result = writeDocx({
          text,
          path: action.path || action.target || undefined,
          dryRun: this.dryRun,
          stem: action.stem,
        });
        this.last = { op: "word_docx_write", ...result };
        return coworkerOutcome(type, result);
      }

      // #17: append is a separate verb, not a mode flag on the write. A plan
      // the customer approved as "Write a Word document" must not be able to
      // modify a document they already have - #20 requires the approval text to
      // name the verb, and a mode flag hides the verb inside the payload.
      case "word_docx_append": {
        const { appendDocx } = require("./word-coworker");
        const text = action.value ?? action.text ?? "";
        const result = appendDocx({
          text,
          path: action.path || action.target || undefined,
          dryRun: this.dryRun,
          stem: action.stem,
        });
        this.last = { op: "word_docx_append", ...result };
        return coworkerOutcome(type, result);
      }

      case "clipboard_baseline": {
        // #16: the integrity gate had no source to compare against, because at
        // recipe-definition time the text does not exist yet - it only exists
        // after the ctrl+a/ctrl+c whose success is the thing in doubt. So record
        // what was on the clipboard BEFORE the copy. If it is still there
        // afterwards, the copy did not happen.
        const got = await this.clipboardGet();
        this.clipboardBaseline = { text: got.text || "", at: Date.now() };
        this.last = { op: "clipboard_baseline", len: this.clipboardBaseline.text.length };
        return { ok: true, type, baselineLen: this.clipboardBaseline.text.length };
      }

      case "word_from_clipboard": {
        // API-first coworker: clipboard → .docx (no Word focus steal).
        const { writeDocx, clipboardMatchesSource, visibleDocxText } = require("./word-coworker");
        const expected = action.value != null ? String(action.value) : null;
        const got = await this.clipboardGet();
        let text = got.text || "";

        // No explicit source, but a baseline was recorded: prove the copy fired.
        if (expected == null && this.clipboardBaseline) {
          const proof = await this._provenCopy(text);
          if (!proof.ok) return { ok: false, type, error: proof.reason, ...proof };
          text = proof.text;
        }
        if (expected != null && expected.length) {
          let check = clipboardMatchesSource(expected, text);
          if (!check.ok) {
            await this.press("ctrl+a");
            if (!this.dryRun) await sleep(80);
            await this.press("ctrl+c");
            if (!this.dryRun) await sleep(120);
            const again = await this.clipboardGet();
            text = again.text || "";
            check = clipboardMatchesSource(expected, text);
            if (!check.ok) {
              return { ok: false, type, error: check.reason || "clipboard integrity failed", ...check };
            }
          }
        }
        const payload = visibleDocxText(text) || visibleDocxText(expected || "");
        if (!payload && !this.dryRun) {
          return {
            ok: false,
            type,
            error: "clipboard has no visible text - nothing to write to Word",
            clipLen: text.length,
          };
        }
        const result = writeDocx({
          text: payload || String(expected || text || ""),
          path: action.path || action.target || undefined,
          dryRun: this.dryRun,
          stem: action.stem || "from-clipboard",
        });
        this.last = { op: "word_from_clipboard", ...result };
        return coworkerOutcome(type, result, { clipLen: text.length });
      }

      case "clipboard_verify": {
        const { clipboardMatchesSource } = require("./word-coworker");
        const got = await this.clipboardGet();
        const text = got.text || "";
        const source = action.value ?? action.source;
        if (source == null || source === "") {
          // Without a source this degraded to "the clipboard is not empty",
          // which stale content passes trivially. Use the baseline instead (#16).
          if (this.clipboardBaseline) {
            const proof = await this._provenCopy(text);
            if (!proof.ok) return { ok: false, type, error: proof.reason, ...proof };
            return { ok: true, type, clipLen: proof.text.length, text: proof.text };
          }
          if (!text.length && !this.dryRun) {
            return { ok: false, type, error: "clipboard empty after copy", clipLen: 0 };
          }
          return { ok: true, type, clipLen: text.length, text };
        }
        const check = clipboardMatchesSource(String(source), text);
        return { ok: check.ok, type, ...check, text };
      }

      default:
        return { ok: false, error: `unknown action type: ${type}` };
    }
  }
}

module.exports = { InputDriver, coworkerOutcome, VK, MOD_VK, parseKeyCombo, vkOf };
