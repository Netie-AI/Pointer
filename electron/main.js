/**
 * Netie Clicks — Windows screen buddy (standalone).
 * Ctrl+Space → frame drag → chat with OpenVault :5000 vision.
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  desktopCapturer,
  screen,
  session,
  ipcMain,
} = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { HotMemory } = require("./hotMemory");

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const API_HOST = "127.0.0.1";
const API_PORT = 5000;
const API_CHAT_URL = `http://${API_HOST}:${API_PORT}/v1/chat/completions`;
const HOTKEY = process.env.NETIE_CLICK_HOTKEY || "Control+Space";

const TEMP_DIR = path.join(os.tmpdir(), "netie-clicks");
const hot = new HotMemory();

let tray = null;
let panelWindow = null;
let overlayWindow = null;
let lastCapture = null; // { path, dataUrl, region }
let tickTimer = null;
let state = "IDLE"; // IDLE | ARMED | SELECTING | ACTIVE

function ensureTemp() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function sendToPanel(channel, data) {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send(channel, data);
  }
}

function setupCsp() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      `connect-src 'self' http://${API_HOST}:${API_PORT}`,
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
    ].join("; ");
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

function createPanel() {
  if (panelWindow && !panelWindow.isDestroyed()) return panelWindow;
  panelWindow = new BrowserWindow({
    width: 420,
    height: 560,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#121214",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  panelWindow.loadFile(path.join(__dirname, "panel.html"));
  panelWindow.on("closed", () => {
    panelWindow = null;
  });
  return panelWindow;
}

function showPanel() {
  const win = createPanel();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width } = display.workArea;
  win.setPosition(x + width - 440, y + 40);
  win.showInactive();
  win.focus();
}

function closeOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
  overlayWindow = null;
}

function openOverlay() {
  closeOverlay();
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;
  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "overlay-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.loadFile(path.join(__dirname, "overlay.html"));
  overlayWindow.on("closed", () => {
    overlayWindow = null;
    if (state === "SELECTING") state = "ARMED";
  });
  state = "SELECTING";
}

/** Foreground window title/process via PowerShell (no native addon in week 1). */
function sampleForeground(cb) {
  const script =
    "$w = Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);' -Name U -PassThru; " +
    "$h = $w::GetForegroundWindow(); $sb = New-Object System.Text.StringBuilder 512; [void]$w::GetWindowText($h, $sb, $sb.Capacity); " +
    "$p = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -eq $h } | Select-Object -First 1; " +
    "Write-Output (($sb.ToString()) + '|' + ($(if($p){$p.ProcessName}else{'?'})))";
  execFile(
    "powershell.exe",
    ["-NoProfile", "-Command", script],
    { timeout: 1500, windowsHide: true },
    (err, stdout) => {
      if (err || !stdout) {
        cb({ title: "?", proc: "?" });
        return;
      }
      const line = String(stdout).trim().split(/\r?\n/).pop() || "|";
      const [title, proc] = line.split("|");
      cb({ title: title || "?", proc: proc || "?" });
    },
  );
}

function startTicks() {
  stopTicks();
  tickTimer = setInterval(() => {
    if (state === "IDLE") return;
    const pt = screen.getCursorScreenPoint();
    const disp = screen.getDisplayNearestPoint(pt);
    sampleForeground((fg) => {
      void hot.pushTick({
        t: Date.now(),
        cx: pt.x,
        cy: pt.y,
        disp: String(disp.id),
        scale: disp.scaleFactor,
        fg,
      });
    });
  }, 250);
}

function stopTicks() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

async function captureDisplayCrop(regionLogical) {
  ensureTemp();
  const display = screen.getPrimaryDisplay();
  const scale = display.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.round(display.size.width * scale),
      height: Math.round(display.size.height * scale),
    },
  });
  const primaryId = String(display.id);
  let source =
    sources.find((s) => s.display_id && String(s.display_id) === primaryId) ||
    sources[0];
  if (!source) throw new Error("No screen source");

  let image = source.thumbnail;
  if (regionLogical && regionLogical.width > 0 && regionLogical.height > 0) {
    const crop = {
      x: Math.max(0, Math.round(regionLogical.x * scale)),
      y: Math.max(0, Math.round(regionLogical.y * scale)),
      width: Math.round(regionLogical.width * scale),
      height: Math.round(regionLogical.height * scale),
    };
    // Clamp
    const sz = image.getSize();
    crop.width = Math.min(crop.width, sz.width - crop.x);
    crop.height = Math.min(crop.height, sz.height - crop.y);
    if (crop.width > 0 && crop.height > 0) {
      image = image.crop(crop);
    }
  }

  // Cap long edge ~1280 like Clicky
  const size = image.getSize();
  const long = Math.max(size.width, size.height);
  if (long > 1280) {
    const f = 1280 / long;
    image = image.resize({
      width: Math.round(size.width * f),
      height: Math.round(size.height * f),
    });
  }

  const png = image.toPNG();
  const file = path.join(TEMP_DIR, `cap_${Date.now()}.png`);
  fs.writeFileSync(file, png);
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  lastCapture = { path: file, dataUrl, region: regionLogical || null };
  return lastCapture;
}

async function askOpenVault({ message, dataUrl }) {
  const hotCtx = hot.summaryText();
  const system = [
    "You are Netie Click, a Windows screen companion.",
    "Use the screenshot and the short-term activity log to help the user.",
    "Be concrete about UI elements you see. If unsure, say so.",
    "",
    "Last ~60s activity (hot memory):",
    hotCtx,
  ].join("\n");

  const content = [{ type: "text", text: message || "What am I looking at?" }];
  if (dataUrl) {
    content.push({
      type: "image_url",
      image_url: { url: dataUrl },
    });
  }

  const body = {
    model: process.env.NETIE_CLICK_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    max_tokens: 800,
  };

  const res = await fetch(API_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-openfree-identity": `netie-clicks:${hot.deviceId}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OpenVault non-JSON ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(json.detail || json.error?.message || `HTTP ${res.status}`);
  }
  const reply =
    json.choices?.[0]?.message?.content ||
    json.message?.content ||
    JSON.stringify(json).slice(0, 500);
  return String(reply);
}

function armSession() {
  state = "ARMED";
  startTicks();
  showPanel();
  sendToPanel("clicks:state", { state, hotkey: HOTKEY });
  openOverlay();
}

function disarmSession() {
  state = "IDLE";
  stopTicks();
  closeOverlay();
  sendToPanel("clicks:state", { state, hotkey: HOTKEY });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Netie Clicks");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Capture (${HOTKEY})`,
        click: () => armSession(),
      },
      {
        label: "Show panel",
        click: () => showPanel(),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          disarmSession();
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => showPanel());
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  const ok = globalShortcut.register(HOTKEY, () => {
    if (state === "IDLE") armSession();
    else if (state === "SELECTING") {
      /* ignore while dragging */
    } else {
      // Toggle off if already armed without region
      disarmSession();
    }
  });
  if (!ok) {
    console.error("Failed to register hotkey", HOTKEY);
  }
}

ipcMain.handle("clicks:getAppInfo", async () => ({
  deviceId: hot.deviceId,
  state,
  hotkey: HOTKEY,
  api: API_CHAT_URL,
  ticks: hot.snapshot().length,
}));

ipcMain.handle("click:getAppInfo", async () => ({
  deviceId: hot.deviceId,
  state,
  hotkey: HOTKEY,
  api: API_CHAT_URL,
}));

ipcMain.handle("click:captureNow", async () => {
  const cap = await captureDisplayCrop(null);
  sendToPanel("click:onHotkeyFired", {
    dataUrl: cap.dataUrl,
    path: cap.path,
  });
  return { ok: true, path: cap.path };
});

ipcMain.handle("clicks:commitRegion", async (_e, region) => {
  closeOverlay();
  state = "ACTIVE";
  try {
    const cap = await captureDisplayCrop(region);
    showPanel();
    sendToPanel("click:onHotkeyFired", {
      dataUrl: cap.dataUrl,
      path: cap.path,
      region,
    });
    sendToPanel("clicks:state", { state, region, hotkey: HOTKEY });
    return { ok: true };
  } catch (err) {
    sendToPanel("clicks:error", { message: String(err.message || err) });
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("clicks:cancelRegion", async () => {
  closeOverlay();
  state = "ARMED";
  sendToPanel("clicks:state", { state, hotkey: HOTKEY });
  return { ok: true };
});

ipcMain.handle("click:askBuddy", async (_e, payload) => {
  const message = (payload && payload.message) || "";
  const dataUrl =
    (payload && payload.dataUrl) || (lastCapture && lastCapture.dataUrl) || null;
  try {
    const reply = await askOpenVault({ message, dataUrl });
    return { ok: true, reply };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

app.whenReady().then(() => {
  ensureTemp();
  setupCsp();
  createTray();
  createPanel();
  registerHotkey();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopTicks();
});

app.on("second-instance", () => {
  showPanel();
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});
