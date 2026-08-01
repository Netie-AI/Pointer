"use strict";
/**
 * P5-PRIVACY-VEIL — block outside view while vault values are typed.
 * Electron setContentProtection on HUD already helps; this adds a local
 * fullscreen veil so shoulder-surf / capture of the form burst is harder.
 */

let veil = null;

function isOpen() {
  return Boolean(veil && !veil.isDestroyed());
}

/**
 * @param {boolean} on
 * @param {{ BrowserWindow: Function, screen: object, path: object, __dirname: string }} deps
 */
function setPrivacyVeil(on, deps) {
  if (!on) {
    if (isOpen()) {
      try {
        veil.close();
      } catch {
        /* ignore */
      }
    }
    veil = null;
    return { ok: true, on: false };
  }
  if (isOpen()) return { ok: true, on: true };
  const { BrowserWindow, screen, path, rootDir } = deps;
  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;
  veil = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  try {
    veil.setContentProtection(true);
  } catch {
    /* platform may not support */
  }
  veil.setIgnoreMouseEvents(true);
  const html = path.join(rootDir, "privacy-veil.html");
  veil.loadFile(html).catch(() => {});
  veil.once("ready-to-show", () => {
    if (veil && !veil.isDestroyed()) veil.showInactive();
  });
  veil.on("closed", () => {
    veil = null;
  });
  return { ok: true, on: true };
}

module.exports = { setPrivacyVeil, isOpen };
