"use strict";
/**
 * Windows input driver for Netie Clicks.
 * Uses PowerShell + user32 SendInput — no native Electron addon rebuild.
 *
 * Coordinates are logical screen pixels (same space as Electron screen API).
 * Set dryRun:true in tests to skip OS calls.
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const PS_HELPER = `
$ErrorActionPreference='Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NetieInput {
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
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public const uint INPUT_MOUSE=0; public const uint INPUT_KEYBOARD=1;
  public const uint MOUSEEVENTF_LEFTDOWN=0x0002; public const uint MOUSEEVENTF_LEFTUP=0x0004;
  public const uint MOUSEEVENTF_RIGHTDOWN=0x0008; public const uint MOUSEEVENTF_RIGHTUP=0x0010;
  public const uint KEYEVENTF_KEYUP=0x0002; public const uint KEYEVENTF_UNICODE=0x0004;
  public static void Click(int x, int y, bool right) {
    SetCursorPos(x,y);
    INPUT[] a = new INPUT[2];
    a[0].type=INPUT_MOUSE; a[1].type=INPUT_MOUSE;
    uint down = right?MOUSEEVENTF_RIGHTDOWN:MOUSEEVENTF_LEFTDOWN;
    uint up = right?MOUSEEVENTF_RIGHTUP:MOUSEEVENTF_LEFTUP;
    a[0].mkhi.mi.dwFlags=down; a[1].mkhi.mi.dwFlags=up;
    SendInput(2,a,Marshal.SizeOf(typeof(INPUT)));
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
}
"@
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
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class InputDriver {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.dryRun]  skip OS calls (unit tests)
   * @param {function} [opts.exec]   inject execFileAsync
   */
  constructor(opts = {}) {
    this.dryRun = Boolean(opts.dryRun);
    this._exec = opts.exec || execFileAsync;
    this.last = null;
  }

  async _ps(scriptBody) {
    if (this.dryRun) {
      this.last = { ps: scriptBody.slice(0, 200) };
      return { stdout: "ok", stderr: "" };
    }
    const full = `${PS_HELPER}\n${scriptBody}`;
    return this._exec("powershell.exe", ["-NoProfile", "-Command", full], {
      timeout: 8000,
      windowsHide: true,
      encoding: "utf8",
    });
  }

  async moveTo(x, y) {
    const xi = Math.round(Number(x));
    const yi = Math.round(Number(y));
    this.last = { op: "move", x: xi, y: yi };
    if (this.dryRun) return this.last;
    await this._ps(
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${xi},${yi})`
    );
    return this.last;
  }

  async clickAt(x, y, { button = "left", double = false } = {}) {
    const xi = Math.round(Number(x));
    const yi = Math.round(Number(y));
    const right = button === "right";
    this.last = { op: double ? "doubleclick" : "click", x: xi, y: yi, button };
    if (this.dryRun) return this.last;
    const once = `[NetieInput]::Click(${xi},${yi},$${right})`;
    await this._ps(double ? `${once}; Start-Sleep -Milliseconds 80; ${once}` : once);
    return this.last;
  }

  async typeText(text) {
    const s = String(text ?? "");
    this.last = { op: "type", len: s.length };
    if (this.dryRun) return this.last;
    // Escape for PowerShell single-quoted string
    const lit = s.replace(/'/g, "''");
    await this._ps(`[NetieInput]::TypeUnicode('${lit}')`);
    return this.last;
  }

  async press(key) {
    const name = String(key || "").toLowerCase();
    const vk = VK[name];
    this.last = { op: "press", key: name, vk: vk || null };
    if (!vk) throw new Error(`Unsupported key: ${key}`);
    if (this.dryRun) return this.last;
    await this._ps(`[NetieInput]::TapVk(${vk})`);
    return this.last;
  }

  async scroll(deltaY = -120) {
    this.last = { op: "scroll", deltaY };
    if (this.dryRun) return this.last;
    // mouse_event wheel via Forms is awkward; use SendKeys PgUp/PgDn as soft scroll
    if (deltaY < 0) await this.press("down");
    else await this.press("up");
    return this.last;
  }

  /**
   * Execute one reviewed action.
   * @param {object} action
   * @param {object} [ctx]  { region: {x,y,width,height}, imageSize?: {width,height} }
   */
  async perform(action, ctx = {}) {
    const type = String(action.type || "").toLowerCase();
    const region = ctx.region || { x: 0, y: 0, width: 0, height: 0 };

    // Absolute screen coords preferred; else xPct/yPct of capture region; else x/y relative.
    let sx = action.screenX ?? action.x;
    let sy = action.screenY ?? action.y;
    if ((sx == null || sy == null) && action.xPct != null && action.yPct != null && region.width) {
      sx = region.x + (Number(action.xPct) / 100) * region.width;
      sy = region.y + (Number(action.yPct) / 100) * region.height;
    } else if (sx != null && sy != null && action.relative !== false && region.width) {
      // treat as region-relative pixels when region present and screenX not set
      if (action.screenX == null && action.screenY == null) {
        sx = region.x + Number(sx);
        sy = region.y + Number(sy);
      }
    }

    switch (type) {
      case "observe":
      case "read":
      case "wait":
        await sleep(Number(action.ms) || 150);
        return { ok: true, noop: true, type };

      case "movecursor":
      case "hover":
        if (sx == null || sy == null) return { ok: false, error: "missing coordinates" };
        await this.moveTo(sx, sy);
        return { ok: true, type, x: sx, y: sy };

      case "click":
        if (sx == null || sy == null) return { ok: false, error: "missing coordinates for click" };
        await this.clickAt(sx, sy, { button: "left" });
        return { ok: true, type, x: sx, y: sy };

      case "doubleclick":
        if (sx == null || sy == null) return { ok: false, error: "missing coordinates" };
        await this.clickAt(sx, sy, { double: true });
        return { ok: true, type, x: sx, y: sy };

      case "rightclick":
        if (sx == null || sy == null) return { ok: false, error: "missing coordinates" };
        await this.clickAt(sx, sy, { button: "right" });
        return { ok: true, type, x: sx, y: sy };

      case "type":
      case "fill":
      case "paste":
      case "setvalue":
        await this.typeText(action.value ?? "");
        return { ok: true, type, typed: String(action.value ?? "").length };

      case "press":
      case "keypress":
        await this.press(action.value || action.key || action.target);
        return { ok: true, type };

      case "scroll":
        await this.scroll(action.deltaY ?? -120);
        return { ok: true, type };

      case "navigate":
      case "open":
      case "drag":
        return { ok: false, error: `${type} not supported by local driver yet` };

      default:
        return { ok: false, error: `unknown action type: ${type}` };
    }
  }
}

module.exports = { InputDriver, VK };
