/**
 * Netie Clicks — Windows screen buddy in the Netie Ecosystem.
 * Ctrl+Space → frame drag → Cortex gate → OpenVault vision / planned actions.
 * Personal memory + learning telemetry: dual-envelope crypto (see electron/netie/).
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
const { NetieEcosystem } = require("./netie/ecosystem");
const { PersonalBrain } = require("./netie/brain");
const { classifyIntent } = require("./netie/intent");
const { InputDriver } = require("./netie/driver");

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const API_HOST = "127.0.0.1";
const OPENVAULT_PORT = 5000;
const CORTEX_PORT = 8010;
const API_CHAT_URL = `http://${API_HOST}:${OPENVAULT_PORT}/v1/chat/completions`;
const HOTKEY = process.env.NETIE_CLICK_HOTKEY || "Control+Space";

const TEMP_DIR = path.join(os.tmpdir(), "netie-clicks");
const hot = new HotMemory();
const eco = new NetieEcosystem({ deviceId: `netie-clicks:${hot.deviceId}` });
const brain = new PersonalBrain({
  deviceId: `netie-clicks:${hot.deviceId}`,
  cortexUrl: process.env.NETIE_CORTEX_URL || `http://${API_HOST}:${CORTEX_PORT}`,
  cortexKey: process.env.NETIE_CORTEX_KEY || "",
});
try {
  brain.unlock();
  brain.startAutoSync();
} catch (err) {
  console.error("Vault unlock failed:", err.message || err);
}

let tray = null;
let panelWindow = null;
let overlayWindow = null;
let lastCapture = null; // { path, dataUrl, region }
let tickTimer = null;
let state = "IDLE"; // IDLE | ARMED | SELECTING | ACTIVE
let abortPlan = false;
let pendingPlan = null; // last planActions result for approve UI
const driver = new InputDriver({
  dryRun: process.env.NETIE_CLICK_DRY_RUN === "1",
});

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
      `connect-src 'self' http://${API_HOST}:${OPENVAULT_PORT} http://${API_HOST}:${CORTEX_PORT}`,
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

async function askBuddy({ message, dataUrl }) {
  const memCtx = (() => {
    try {
      return brain.contextForLlm();
    } catch {
      return "";
    }
  })();
  const hotContext = [hot.summaryText(), memCtx ? `\nPersonal memory:\n${memCtx}` : ""]
    .filter(Boolean)
    .join("\n");

  const r = await eco.visionChat({ message, dataUrl, hotContext });
  if (r.ok && message) {
    try {
      // Local encrypted memory only — redacted one-liner, never the screenshot.
      brain.remember(`Asked: ${message.slice(0, 120)} → ${String(r.text || "").slice(0, 160)}`, {
        kind: "vision",
        tags: ["chat"],
      });
    } catch {
      /* vault optional */
    }
  }
  return r;
}

/**
 * Execute only actions the human already approved.
 * Real Windows driver via PowerShell SendInput (or dry-run when NETIE_CLICK_DRY_RUN=1).
 */
async function executeApproved(actions) {
  abortPlan = false;
  const results = [];
  const region = (lastCapture && lastCapture.region) || { x: 0, y: 0, width: 0, height: 0 };

  // Get the panel out of the way so clicks hit the real UI (idiot-proof).
  try {
    if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide();
    await new Promise((r) => setTimeout(r, 280));
  } catch {
    /* ok */
  }

  for (const action of actions) {
    if (abortPlan) {
      results.push({ action, ok: false, skipped: "aborted" });
      break;
    }
    const d = action.safety && action.safety.disposition;
    if (d === "refuse") {
      results.push({ action, ok: false, skipped: "refused" });
      continue;
    }
    if (d === "custody") {
      await eco.audit("clicks.custody.requested", { target: action.target || action.field });
      results.push({ action, ok: false, skipped: "custody — do this yourself (OpenVault)" });
      continue;
    }
    if (d === "approve" && !action._approved) {
      results.push({ action, ok: false, skipped: "not-approved" });
      continue;
    }

    const started = Date.now();
    let outcome;
    try {
      outcome = await driver.perform(action, { region });
    } catch (err) {
      outcome = { ok: false, error: String(err.message || err) };
    }

    await eco.audit("clicks.action.executed", {
      type: action.type,
      disposition: d,
      ok: Boolean(outcome.ok),
      dryRun: driver.dryRun,
    });
    try {
      brain.telemetry.enqueueOutcome({
        action_type: action.type,
        safety_tier: action.safety && action.safety.tierName,
        approved: d === "approve",
        succeeded: Boolean(outcome.ok),
        latency_ms: Date.now() - started,
        app_class: "unknown",
        irreversible: Boolean(action.safety && action.safety.irreversible),
      });
    } catch {
      /* fleet paused */
    }

    const message = outcome.ok
      ? `${action.type}${outcome.x != null ? ` @ (${Math.round(outcome.x)},${Math.round(outcome.y)})` : ""}${
          driver.dryRun ? " [dry-run]" : ""
        }`
      : `failed: ${outcome.error || outcome.skipped || "unknown"}`;
    results.push({ action, ...outcome, message });
    if (!outcome.ok && !outcome.noop) {
      // Stop the chain on hard failure — safer than continuing blind.
      break;
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  try {
    showPanel();
  } catch {
    /* ok */
  }
  return results;
}

function armSession() {
  state = "ARMED";
  startTicks();
  showPanel();
  sendToPanel("clicks:state", { state, hotkey: HOTKEY });
  openOverlay();
}

function disarmSession() {
  try {
    brain.absorbHotSummary(hot.summaryText());
    brain.syncFleet("session-end").catch(() => {});
  } catch {
    /* ok */
  }
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

ipcMain.handle("clicks:getAppInfo", async () => {
  let brainStatus = null;
  try {
    brainStatus = brain.status();
  } catch {
    /* vault may be locked */
  }
  return {
    deviceId: hot.deviceId,
    state,
    hotkey: HOTKEY,
    api: API_CHAT_URL,
    cortex: process.env.NETIE_CORTEX_URL || `http://${API_HOST}:${CORTEX_PORT}`,
    ticks: hot.snapshot().length,
    cortexOnline: eco.cortexOnline,
    brain: brainStatus,
  };
});

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
    const r = await askBuddy({ message, dataUrl });
    if (!r.ok) {
      return {
        ok: false,
        error: r.text || "Ask failed",
        blocked: Boolean(r.blocked),
        degraded: Boolean(r.degraded),
      };
    }
    return {
      ok: true,
      reply: r.text,
      degraded: Boolean(r.degraded),
    };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

/** One-tap Go: we pick ask vs act. Users don't choose modes. */
ipcMain.handle("clicks:go", async (_e, payload) => {
  const message = (payload && payload.message) || "";
  const dataUrl =
    (payload && payload.dataUrl) || (lastCapture && lastCapture.dataUrl) || null;
  const intent = classifyIntent(message);
  if (intent === "ask") {
    try {
      const r = await askBuddy({ message, dataUrl });
      if (!r.ok) {
        return {
          ok: false,
          mode: "ask",
          error: r.text || "Ask failed",
          blocked: Boolean(r.blocked),
          degraded: Boolean(r.degraded),
        };
      }
      return { ok: true, mode: "ask", reply: r.text, degraded: Boolean(r.degraded) };
    } catch (err) {
      return { ok: false, mode: "ask", error: String(err.message || err) };
    }
  }

  try {
    const plan = await eco.planActions({
      instruction: message,
      screenText: (payload && payload.screenText) || "",
      dataUrl,
    });
    pendingPlan = plan;
    if (plan.ok) {
      try {
        brain.telemetry.enqueueSessionSketch({
          app_class: "unknown",
          labels: (plan.actions || []).map((a) => `${a.type}:${a.target || ""}`).slice(0, 20),
          intent: message.slice(0, 120),
          outcome: plan.needsApproval ? "needs-approval" : "auto-ok",
        });
      } catch {
        /* fleet may be paused */
      }
    }
    return { ...plan, mode: "act", intent };
  } catch (err) {
    return { ok: false, mode: "act", reason: String(err.message || err), actions: [] };
  }
});

ipcMain.handle("clicks:planActions", async (_e, payload) => {
  const instruction = (payload && payload.instruction) || "";
  const dataUrl =
    (payload && payload.dataUrl) || (lastCapture && lastCapture.dataUrl) || null;
  try {
    const plan = await eco.planActions({
      instruction,
      screenText: (payload && payload.screenText) || "",
      dataUrl,
    });
    pendingPlan = plan;
    return plan;
  } catch (err) {
    return { ok: false, blocked: false, reason: String(err.message || err), actions: [] };
  }
});

ipcMain.handle("clicks:approvePlan", async (_e, payload) => {
  const approvedIds = new Set((payload && payload.approvedIndexes) || []);
  const approveAllSafe = Boolean(payload && payload.approveAllSafe);
  const actions = (pendingPlan && pendingPlan.actions) || [];
  const toRun = actions.map((a, i) => {
    const copy = { ...a };
    if (a.safety && a.safety.disposition === "auto") {
      copy._approved = true;
    } else if (a.safety && a.safety.disposition === "approve") {
      if (approveAllSafe && !a.safety.irreversible) copy._approved = true;
      else if (approvedIds.has(i)) copy._approved = true;
    }
    return copy;
  });
  for (const a of toRun) {
    if (a._approved && a.safety && a.safety.disposition === "approve") {
      await eco.audit("clicks.action.approved", { type: a.type, target: a.target });
    }
  }
  const results = await executeApproved(toRun);
  try {
    brain.remember(
      `Did: ${(results || [])
        .filter((r) => r.ok)
        .map((r) => r.action && r.action.type)
        .filter(Boolean)
        .join(", ") || "plan"}`,
      { kind: "action", tags: ["plan"] }
    );
  } catch {
    /* ok */
  }
  return { ok: true, results };
});

ipcMain.handle("clicks:abortPlan", async () => {
  abortPlan = true;
  return { ok: true };
});

ipcMain.handle("clicks:brainStatus", async () => {
  try {
    return { ok: true, ...brain.status() };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("clicks:setConsent", async (_e, partial) => {
  try {
    const consent = brain.telemetry.setConsent(partial || {});
    return { ok: true, consent, fleetOn: brain.status().fleetOn };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("clicks:flushTelemetry", async (_e, payload) => {
  try {
    const reason = (payload && payload.reason) || "manual";
    return { ok: true, ...(await brain.syncFleet(reason)) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

/** Call from update-check wake-up — same phone-home moment, separate telemetry path. */
ipcMain.handle("clicks:onUpdateCheck", async () => {
  try {
    return { ok: true, ...(await brain.syncFleet("update-check")) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("clicks:exportMemory", async () => {
  try {
    return { ok: true, export: brain.memory.exportAll() };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("clicks:feedback", async (_e, payload) => {
  try {
    const r = brain.telemetry.enqueueFeedback(payload || {});
    return r;
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
  try {
    brain.stopAutoSync();
    brain.syncFleet("quit").catch(() => {});
  } catch {
    /* ok */
  }
});

app.on("second-instance", () => {
  showPanel();
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});
