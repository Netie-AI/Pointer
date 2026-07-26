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
  shell,
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
const { ensureActionCoords } = require("./netie/targeting");
const { overlayRegionToScreen, regionToDisplayCrop } = require("./netie/geometry");
const { ConversationStore } = require("./netie/conversations");
const crypto = require("crypto");

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
let stageWindow = null;
let overlayDisplayBounds = null; // bounds of the display the overlay covers
let lastCapture = null; // { path, dataUrl, region }
let tickTimer = null;
let state = "IDLE"; // IDLE | ARMED | SELECTING | ACTIVE
let abortPlan = false;
let planRunning = false;
let pendingPlan = null; // last planActions result for approve UI
let stageLayout = process.env.NETIE_STAGE_LAYOUT === "below" ? "below" : "right";
const chats = new ConversationStore();
/** @type {Array<{role:string,text:string,ts:number}>} */
let sessionTurns = [];
const driver = new InputDriver({
  dryRun: process.env.NETIE_CLICK_DRY_RUN === "1",
  // Worker is per-monitor DPI aware → feed it physical pixels, not DIPs.
  toPhysical: (pt) => screen.dipToScreenPoint(pt),
});

function pngFingerprint(dataUrlOrPath) {
  try {
    if (dataUrlOrPath && String(dataUrlOrPath).startsWith("data:")) {
      const b64 = String(dataUrlOrPath).split(",")[1] || "";
      return crypto.createHash("sha256").update(Buffer.from(b64, "base64")).digest("hex");
    }
    if (dataUrlOrPath && fs.existsSync(dataUrlOrPath)) {
      return crypto.createHash("sha256").update(fs.readFileSync(dataUrlOrPath)).digest("hex");
    }
  } catch {
    /* ignore */
  }
  return null;
}

function ensureTemp() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function sendToPanel(channel, data) {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send(channel, data);
  }
}

function sendStage(event) {
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.webContents.send("stage:event", event);
  }
}

function createStage() {
  if (stageWindow && !stageWindow.isDestroyed()) return stageWindow;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.bounds;
  stageWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "stage-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  stageWindow.setAlwaysOnTop(true, "screen-saver");
  stageWindow.setIgnoreMouseEvents(true, { forward: true });
  // Cluely-style: excluded from screen capture / desktopCapturer.
  try {
    stageWindow.setContentProtection(true);
  } catch {
    /* older Electron */
  }
  stageWindow.loadFile(path.join(__dirname, "stage.html"));
  stageWindow.on("closed", () => {
    stageWindow = null;
  });
  return stageWindow;
}

function showStage() {
  const win = createStage();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.bounds;
  win.setBounds({ x, y, width, height });
  win.showInactive();
  sendStage({ type: "layout", mode: stageLayout });
}

function hideStage() {
  if (stageWindow && !stageWindow.isDestroyed()) stageWindow.hide();
}

function pushTurn(role, text) {
  const t = String(text || "").trim();
  if (!t) return;
  sessionTurns.push({ role, text: t, ts: Date.now() });
  if (sessionTurns.length > 80) sessionTurns = sessionTurns.slice(-80);
}

function saveCurrentConversation(title) {
  if (!sessionTurns.length) return { ok: false, error: "nothing to save" };
  const firstUser = sessionTurns.find((x) => x.role === "user");
  const res = chats.save({
    title: title || (firstUser && firstUser.text.slice(0, 60)) || "Netie Click session",
    turns: sessionTurns,
    meta: { deviceId: hot.deviceId },
  });
  return res;
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
    height: 620,
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
  try {
    panelWindow.setContentProtection(true);
  } catch {
    /* ok */
  }
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
  // Frame where the user is working, not just the primary monitor.
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  overlayDisplayBounds = { ...display.bounds };
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
  overlayWindow.focus(); // so the overlay's own Esc handler works immediately
  overlayWindow.on("closed", () => {
    overlayWindow = null;
    if (state === "SELECTING") state = "ARMED";
  });
  state = "SELECTING";
}

/**
 * Foreground window title/process. Normal path rides the driver's persistent
 * worker (no process spawn per tick); the execFile fallback only runs in
 * dry-run mode, where the driver deliberately makes no OS calls.
 */
function sampleForeground(cb) {
  if (!driver.dryRun) {
    driver
      .foreground()
      .then((fg) => cb(fg))
      .catch(() => cb({ title: "?", proc: "?" }));
    return;
  }
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
  const hasRegion =
    regionLogical && regionLogical.width > 0 && regionLogical.height > 0;
  // Capture the display the region lives on (or the one the cursor is on),
  // not blindly the primary — regions are global DIP coords now.
  const display = hasRegion
    ? screen.getDisplayMatching({
        x: Math.round(regionLogical.x),
        y: Math.round(regionLogical.y),
        width: Math.round(regionLogical.width),
        height: Math.round(regionLogical.height),
      })
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const scale = display.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.round(display.size.width * scale),
      height: Math.round(display.size.height * scale),
    },
  });
  const displayId = String(display.id);
  let source =
    sources.find((s) => s.display_id && String(s.display_id) === displayId) ||
    sources[0];
  if (!source) throw new Error("No screen source");

  let image = source.thumbnail;
  if (hasRegion) {
    const crop = regionToDisplayCrop(regionLogical, display, image.getSize());
    if (crop) {
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

  showStage();
  pushTurn("user", message);
  sendStage({ type: "bubble", role: "user", text: message });
  sendStage({ type: "mood", mood: "thinking" });
  sendStage({ type: "subtitle", text: "Looking…", ms: 2000, sound: false });

  const r = await eco.visionChat({ message, dataUrl, hotContext });
  if (r.ok && message) {
    pushTurn("assistant", r.text);
    sendStage({ type: "bubble", role: "netie", text: String(r.text || "").slice(0, 280) });
    sendStage({
      type: "subtitle",
      text: String(r.text || "").slice(0, 180),
      ms: 6000,
    });
    try {
      brain.remember(`Asked: ${message.slice(0, 120)} → ${String(r.text || "").slice(0, 160)}`, {
        kind: "vision",
        tags: ["chat"],
      });
    } catch {
      /* vault optional */
    }
  } else {
    sendStage({ type: "mood", mood: "idle" });
    sendStage({ type: "subtitle", text: r.text || "Couldn't answer", ms: 3500 });
  }
  return r;
}

function plannerContext() {
  let mem = "";
  try {
    mem = brain.contextForLlm();
  } catch {
    mem = "";
  }
  return [hot.summaryText(), mem ? `Personal memory:\n${mem}` : ""].filter(Boolean).join("\n");
}

/**
 * Kill switch, scoped to plan execution only. Registering Escape globally for
 * the app's whole lifetime would steal Esc from every other app on the system,
 * so we grab it right before actions run and release it right after. The
 * selection overlay handles its own Esc via a window-level keydown.
 */
function grabKillSwitch() {
  const ok = globalShortcut.register("Escape", () => {
    abortPlan = true;
    sendToPanel("clicks:state", { state, hotkey: HOTKEY, aborted: true });
  });
  if (!ok) console.error("Kill switch: could not grab Esc (owned elsewhere) — hotkey still aborts");
}

function releaseKillSwitch() {
  try {
    globalShortcut.unregister("Escape");
  } catch {
    /* already gone */
  }
}

/**
 * Execute only actions the human already approved.
 * Real Windows driver via PowerShell SendInput (or dry-run when NETIE_CLICK_DRY_RUN=1).
 */
async function executeApproved(actions) {
  abortPlan = false;
  planRunning = true;
  grabKillSwitch();
  const results = [];
  const region = (lastCapture && lastCapture.region) || { x: 0, y: 0, width: 0, height: 0 };
  const dataUrl = (lastCapture && lastCapture.dataUrl) || null;

  try {
    if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide();
    await new Promise((r) => setTimeout(r, 280));
  } catch {
    /* ok */
  }

  try {
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
        const custody = await eco.requestCustody({
          field: action.field,
          target: action.target,
        });
        results.push({
          action,
          ok: false,
          skipped: "custody",
          message: custody.message,
        });
        continue;
      }
      if (d === "approve" && !action._approved) {
        results.push({ action, ok: false, skipped: "not-approved" });
        continue;
      }

      const started = Date.now();
      const enriched = await ensureActionCoords(action, { dataUrl, eco });
      sendStage({
        type: "subtitle",
        text: `${enriched.type}${enriched.target ? ` · ${enriched.target}` : ""}`,
        ms: 1800,
        sound: false,
      });
      sendStage({ type: "mood", mood: "talking" });
      const needsVerify =
        ["click", "doubleclick", "rightclick", "type", "fill"].includes(
          String(enriched.type || "").toLowerCase()
        ) && Boolean(region.width);
      // Fresh capture right before the action — comparing against the stale
      // plan-time screenshot would let unrelated screen changes fake a "verified".
      let beforeFp = null;
      if (needsVerify && !driver.dryRun) {
        try {
          beforeFp = pngFingerprint((await captureDisplayCrop(region)).dataUrl);
        } catch {
          beforeFp = pngFingerprint(lastCapture && lastCapture.dataUrl);
        }
      }

      let outcome;
      try {
        outcome = await driver.perform(enriched, { region });
      } catch (err) {
        outcome = { ok: false, error: String(err.message || err) };
      }

      // Post-step verify: consequential actions should change the region (soft check).
      if (outcome.ok && beforeFp && !driver.dryRun) {
        try {
          await new Promise((r) => setTimeout(r, 200));
          const after = await captureDisplayCrop(region);
          const afterFp = pngFingerprint(after.dataUrl);
          if (afterFp && afterFp === beforeFp) {
            outcome = {
              ...outcome,
              ok: false,
              error: "no visible change after action — stopped",
              verified: false,
            };
          } else {
            outcome.verified = true;
            lastCapture = after;
          }
        } catch {
          outcome.verified = null;
        }
      } else if (driver.dryRun) {
        outcome.verified = "dry-run";
      }

      await eco.audit("clicks.action.executed", {
        type: enriched.type,
        disposition: d,
        ok: Boolean(outcome.ok),
        dryRun: driver.dryRun,
        targeted: Boolean(enriched._targeted),
        verified: outcome.verified,
      });
      try {
        brain.telemetry.enqueueOutcome({
          action_type: enriched.type,
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
        ? `${enriched.type}${outcome.x != null ? ` @ (${Math.round(outcome.x)},${Math.round(outcome.y)})` : ""}${
            enriched._targeted ? " [aimed]" : ""
          }${driver.dryRun ? " [dry-run]" : ""}`
        : `failed: ${outcome.error || outcome.skipped || "unknown"}`;
      results.push({ action: enriched, ...outcome, message });
      if (!outcome.ok && !outcome.noop) break;
      await new Promise((r) => setTimeout(r, 120));
    }
  } finally {
    planRunning = false;
    releaseKillSwitch();
    try {
      showPanel();
    } catch {
      /* ok */
    }
  }
  return results;
}

function armSession() {
  state = "ARMED";
  startTicks();
  showPanel();
  showStage();
  sendStage({ type: "mood", mood: "idle" });
  sendToPanel("clicks:state", { state, hotkey: HOTKEY });
  openOverlay();
}

function disarmSession() {
  try {
    if (sessionTurns.length) saveCurrentConversation();
    brain.absorbHotSummary(hot.summaryText());
    brain.syncFleet("session-end").catch(() => {});
  } catch {
    /* ok */
  }
  state = "IDLE";
  stopTicks();
  closeOverlay();
  hideStage();
  sendToPanel("clicks:state", { state, hotkey: HOTKEY });
}

/** 16×16 tray dot drawn in-process — an empty image is invisible in the Windows tray. */
function trayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4); // BGRA
  const cx = 7.5;
  const cy = 7.5;
  const r = 6.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const i = (y * size + x) * 4;
      const alpha = d > r - 1 ? Math.round((r - d) * 255) : 255;
      const inner = d <= 2.4; // white "click" core on the accent-blue dot
      buf[i] = 255; // B
      buf[i + 1] = inner ? 255 : 168; // G
      buf[i + 2] = inner ? 255 : 110; // R
      buf[i + 3] = alpha;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function createTray() {
  tray = new Tray(trayIcon());
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
      {
        label: "Show stage (bubbles)",
        click: () => showStage(),
      },
      { type: "separator" },
      {
        label: "Open conversations folder",
        click: () => chats.reveal(),
      },
      {
        label: stageLayout === "below" ? "Bubbles: right side" : "Bubbles: below",
        click: () => {
          stageLayout = stageLayout === "below" ? "right" : "below";
          sendStage({ type: "layout", mode: stageLayout });
          createTray(); // refresh label
        },
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
    // Kill switch while a plan runs — abort, don't disarm.
    if (planRunning) {
      abortPlan = true;
      sendToPanel("clicks:state", { state, hotkey: HOTKEY, aborted: true });
      return;
    }
    if (state === "IDLE") armSession();
    else if (state === "SELECTING") {
      /* ignore while dragging */
    } else {
      disarmSession();
    }
  });
  if (!ok) console.error("Failed to register hotkey", HOTKEY);
  // Esc kill switch is grabbed only while a plan runs (see grabKillSwitch) —
  // a lifetime global Escape would swallow Esc in every other app.
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
  // Overlay coords are local to its display — offset into global DIP space so
  // capture + driver agree on multi-monitor setups.
  const bounds = overlayDisplayBounds || screen.getPrimaryDisplay().bounds;
  const screenRegion = overlayRegionToScreen(region, bounds);
  closeOverlay();
  state = "ACTIVE";
  try {
    const cap = await captureDisplayCrop(screenRegion);
    showPanel();
    sendToPanel("click:onHotkeyFired", {
      dataUrl: cap.dataUrl,
      path: cap.path,
      region: screenRegion,
    });
    sendToPanel("clicks:state", { state, region: screenRegion, hotkey: HOTKEY });
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
    showStage();
    pushTurn("user", message);
    sendStage({ type: "bubble", role: "user", text: message });
    sendStage({ type: "mood", mood: "thinking" });
    sendStage({ type: "subtitle", text: "Planning safely…", ms: 2500, sound: false });
    const plan = await eco.planActions({
      instruction: message,
      screenText: (payload && payload.screenText) || "",
      dataUrl,
      hotContext: plannerContext(),
    });
    pendingPlan = plan;
    if (plan.ok) {
      const summary = `${(plan.actions || []).length} step(s) ready — review in panel`;
      pushTurn("assistant", summary);
      sendStage({ type: "bubble", role: "netie", text: summary });
      sendStage({ type: "subtitle", text: summary, ms: 4500 });
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
    } else {
      sendStage({ type: "subtitle", text: plan.reason || "Blocked", ms: 4000 });
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
      hotContext: plannerContext(),
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

ipcMain.handle("stage:ready", async () => {
  sendStage({ type: "layout", mode: stageLayout });
  return { ok: true, layout: stageLayout };
});

ipcMain.handle("stage:dismiss", async () => {
  hideStage();
  return { ok: true };
});

ipcMain.handle("clicks:setStageLayout", async (_e, mode) => {
  stageLayout = mode === "below" ? "below" : "right";
  showStage();
  sendStage({ type: "layout", mode: stageLayout });
  return { ok: true, layout: stageLayout };
});

ipcMain.handle("clicks:saveConversation", async (_e, payload) => {
  try {
    const res = saveCurrentConversation(payload && payload.title);
    if (res.ok) sessionTurns = [];
    return res;
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("clicks:listConversations", async () => {
  try {
    return { ok: true, items: chats.list(), folder: chats.root };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("clicks:readConversation", async (_e, id) => {
  try {
    const rec = chats.read(id);
    if (!rec) return { ok: false, error: "not found" };
    return { ok: true, ...rec };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("clicks:revealConversations", async (_e, file) => {
  try {
    return chats.reveal(file || null);
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("clicks:openInSpace", async () => {
  // Soft hand-off: open the folder; Netie Space can index it when pointed here.
  try {
    chats.ensure();
    await shell.openPath(chats.root);
    return { ok: true, folder: chats.root, hint: "Add this folder as a Netie Space to browse chats." };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

app.whenReady().then(() => {
  ensureTemp();
  setupCsp();
  chats.ensure();
  createTray();
  createPanel();
  createStage();
  registerHotkey();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopTicks();
  driver.dispose();
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
