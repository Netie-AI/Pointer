/**
 * Netie Clicks — Windows screen buddy in the Netie Ecosystem.
 * Ctrl+` → frame drag → Cortex gate → OpenVault vision / planned actions.
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
  dialog,
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
const { SttBridge } = require("./netie/stt");
const { Segmenter } = require("./netie/audio");
const { Transcriber } = require("./netie/transcriber");
const { detectModeSwitch, getMode, allowsActions } = require("./netie/modes");
const { NotesSession } = require("./netie/notes");
const { SettingsStore } = require("./netie/settings");
const { createNodGate, isAffirmation } = require("./netie/affirm");
const { checkMarkdownPython } = require("./netie/coderun");
const { matchRecipe, expandRecipe, RECIPES } = require("./netie/recipes");
const { expandSkillsToActions, skillPreamble, describeExpansion } = require("./netie/skills-exec");
const { resolveVaultTemplates, hasRawTemplate, missingVaultKeys } = require("./netie/vault-fill");
const { fieldsToPrompts, validateAnswers, describeResult } = require("./netie/enquire");
const { shouldAcceptFrame, detectCaptureCommand } = require("./netie/capture-gate");
/** Plan parked while the human answers the enquire panel. */
let pendingEnquire = null;
const { setPrivacyVeil } = require("./netie/privacy-veil");
const { shouldVerifyStep, verdictWhenSkipped } = require("./netie/verify");
const { parsePoints, toOverlayEvent } = require("./netie/point-overlay");
const { humanizeError, shortError } = require("./netie/errors");
const { createJobQueue, describeQueue } = require("./netie/bg-agents");

/**
 * P3-UIA-TARGETING — run one UIA probe in a short-lived PowerShell.
 *
 * Not the driver's persistent worker: that worker has a fixed op set and a
 * SendInput job, and a tree walk that hangs on an unresponsive window would
 * take the whole input path down with it. A separate, hard-timed process can
 * only lose itself. After three consecutive failures UIA stands down for the
 * session and vision takes over — a probe that keeps timing out is slower than
 * the fallback it was meant to beat.
 */
const UIA_ENABLED = process.env.NETIE_UIA !== "0";
const UIA_TIMEOUT_MS = 1500;
let uiaFailures = 0;

function runUiaProbe(script) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true, timeout: UIA_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          uiaFailures += 1;
          if (uiaFailures === 3) {
            sendHudQuiet({ type: "insight", text: "UIA targeting unavailable — using vision." });
          }
          reject(err);
          return;
        }
        uiaFailures = 0;
        resolve(stdout);
      }
    );
  });
}

/** UIA context for ensureActionCoords, or null when it cannot help. */
function uiaContext(region) {
  if (!UIA_ENABLED || uiaFailures >= 3) return null;
  if (driver.dryRun) return null; // never spawn a probe in a dry run
  if (!region || !region.width) return null;
  return { run: runUiaProbe, screen: region };
}
const {
  MAX_REPLANS,
  shouldReplan,
  observeResults,
  nextPrior,
  replanInstruction,
  describeReplan,
} = require("./netie/replan");
const { DemoDebugTrail } = require("./netie/demo-debug");
const safePath = require("./netie/safe-path");
const { approvalPrompt, describePlan, describeAction } = require("./netie/plan-describe");
const { describeTarget, recognizeApp } = require("./netie/app-target");
const { buildAttachmentBlock, forcesApproval } = require("./netie/attachments");
const wordCoworker = require("./netie/word-coworker");
const { needsAppFork, appForkPrompt, plannerGrounding } = require("./netie/coworker");
const {
  STATES: PresenceStates,
  EVENTS: PresenceEvents,
  transition: presenceTransition,
  describe: presenceDescribe,
} = require("./netie/presence");
const { FeatureFlags } = require("./netie/features");
const { reviewPlan } = require("./netie/safety");
const {
  STATES: ClickyStates,
  EVENTS: ClickyEvents,
  HOLD_MS: CLICKY_HOLD_MS,
  transition: clickyTransition,
  describe: clickyDescribe,
  RecallRing,
} = require("./netie/clicky");
const { Pointer, modeForAction } = require("./netie/clicky/pointer");
const crypto = require("crypto");
const { spawn } = require("child_process");

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Windows GPU/network child crashes have been killing the shell mid-session.
// Prefer software compositing unless explicitly overridden.
if (process.platform === "win32" && process.env.NETIE_FORCE_GPU !== "1") {
  try {
    app.disableHardwareAcceleration();
  } catch {
    /* ok */
  }
}

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const API_HOST = "127.0.0.1";
const OPENVAULT_PORT = 5000;
const CORTEX_PORT = 8010;
const API_CHAT_URL = `http://${API_HOST}:${OPENVAULT_PORT}/v1/chat/completions`;
const HOTKEY = process.env.NETIE_CLICK_HOTKEY || "Control+`";

const TEMP_DIR = path.join(os.tmpdir(), "netie-clicks");
const hot = new HotMemory();
const eco = new NetieEcosystem({ deviceId: `netie-clicks:${hot.deviceId}` });
const brain = new PersonalBrain({
  deviceId: `netie-clicks:${hot.deviceId}`,
  cortexUrl: process.env.NETIE_CORTEX_URL || `http://${API_HOST}:${CORTEX_PORT}`,
  // Match ecosystem demo steward key so telemetry/status do not 401 while eco gates work.
  cortexKey:
    process.env.NETIE_CORTEX_KEY ||
    (process.env.NETIE_CORTEX_DEMO_KEY === "0" ? "" : "dms-demo-steward-key"),
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
let hudWindow = null;
let overlayDisplayBounds = null; // bounds of the display the overlay covers
let lastCapture = null; // { path, dataUrl, region }
let tickTimer = null;
let state = "IDLE"; // IDLE | ARMED | SELECTING | ACTIVE
let abortPlan = false;
let planRunning = false;
let pendingPlan = null; // last planActions result for approve UI
let stageLayout = process.env.NETIE_STAGE_LAYOUT === "below" ? "below" : "right";
const chats = new ConversationStore();
const stt = new SttBridge();
const transcriber = new Transcriber({
  sidecarUrl: process.env.NETIE_STT_URL || "http://127.0.0.1:8766",
  // A function, not a captured boolean: `settings` below is declared after this
  // call but the arrow only runs inside probe(), well after module init — and
  // it re-reads the live value so toggling the checkbox takes effect without
  // recreating the Transcriber.
  allowDeepgramCloud: () => settings.get("cloudStt") === true,
});
const notes = new NotesSession();
const settings = new SettingsStore();
const demoDebug = new DemoDebugTrail({ enabled: settings.get("demoDebug") === true });
const features = new FeatureFlags({
  env: process.env,
  settings: {
    systemAudio: settings.get("systemAudio"),
    sttSidecar: settings.get("sttSidecar"),
    canvas: settings.get("largeContext"),
    hotTicks: settings.get("hotTicks"),
    fleetTelemetry: settings.get("fleetTelemetry"),
    agentPresenceFx: settings.get("agentPresenceFx"),
    recall: settings.get("recall"),
    clicky: settings.get("clicky"),
  },
});
const nodGate = createNodGate({ timeoutMs: 25000 });
/** One segmenter per audio source so mic and system speech never interleave. */
const segmenters = new Map();
let sttBusy = 0;
/** @type {Array<{role:string,text:string,ts:number}>} */
let sessionTurns = [];
let listenMic = false;
let listenSystem = false;
let hudPaused = false;
let appMode = "agent"; // agent | transcribe | meeting
let sttChild = null;
let canvasWindow = null;
let cursorTrackTimer = null;
let presenceState = PresenceStates.IDLE;
let clickyState = ClickyStates.IDLE;
let clickyHoldStartedAt = 0;
let recallTimer = null;
let recallBusy = false;
const MAX_AGENT_STEPS = Math.max(1, Number(process.env.NETIE_MAX_STEPS) || 24);
const AIRGPT_DAY = `Pointer-${new Date().toISOString().slice(0, 10)}`;
const driver = new InputDriver({
  dryRun: process.env.NETIE_CLICK_DRY_RUN === "1",
  // Worker is per-monitor DPI aware → feed it physical pixels, not DIPs.
  toPhysical: (pt) => screen.dipToScreenPoint(pt),
});

/** Real Windows pointer swap while Netie acts (opt-in via settings / Agent cursor). */
const agentPointer = new Pointer({
  enabled: settings.get("cursorBubble") !== false,
});
// If a previous crash left a Netie face on, put the user cursor back.
agentPointer.restore().catch(() => {});

/** Rolling 60s screen memory - thumbs in RAM; sealed dual-wrap on eviction; disk expires with the ring. */
const recall = new RecallRing({
  windowMs: 60_000,
  maxFrames: 60,
  retentionMs: 60_000,
  dataDir: brain.vault ? brain.vault.dataDir : path.join(os.homedir(), "AppData", "Roaming", "NetieClicks"),
  vault: brain.vault || null,
  // Pixel seal is HQ/trainer lane — default metadata-only to keep laptops light.
  sealPixels:
    process.env.NETIE_RECALL_PIXELS === "1" || process.env.NETIE_HQ_CAPTURE === "1",
});

function setPresence(event) {
  presenceState = presenceTransition(presenceState, event);
  if (!features.isEnabled("agentPresenceFx")) return presenceDescribe(presenceState);
  const desc = presenceDescribe(presenceState);
  sendStage({
    type: "presence",
    state: presenceState,
    mood: desc.mood,
    label: desc.label,
    crazy: desc.crazy,
    matrix: desc.matrix,
  });
  return desc;
}

function setClicky(event, meta = {}) {
  clickyState = clickyTransition(clickyState, event, meta);
  const desc = clickyDescribe(clickyState);
  // Real OS pointer swap — no floating ring overlay (that stacked on the arrow).
  if (desc.cursorOn) {
    agentPointer.enabled = settings.get("cursorBubble") !== false;
    agentPointer.set("normal").catch((err) => console.error("clicky pointer:", err.message || err));
  } else if (clickyState === ClickyStates.IDLE && !planRunning) {
    agentPointer.restore().catch(() => {});
  }
  reconcileRecallDaemon();
  sendHud({
    type: "clicky",
    state: clickyState,
    label: desc.label,
    hint: desc.recordingHint,
  });
  // Subtitles live on the HUD LIVE line — not a floating stage bubble.
  sendHud({
    type: "subtitle",
    text: desc.label,
    ms: clickyState === ClickyStates.CLICKY ? 2800 : 1600,
  });
  return desc;
}
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

function sendHud(event) {
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.webContents.send("hud:event", event);
  }
}

/** Re-raise after `status done` so Document ready / Open is not torn down. */
function sendWordDocxReady(artifact) {
  if (!artifact || !artifact.path) return;
  sendHud({
    type: "word-docx",
    path: artifact.path,
    bytes: artifact.bytes || 0,
    chars: artifact.chars || 0,
    preview: artifact.preview || "",
  });
}

function createHud() {
  if (hudWindow && !hudWindow.isDestroyed()) return hudWindow;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.bounds;
  hudWindow = new BrowserWindow({
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
    focusable: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "hud-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  hudWindow.setAlwaysOnTop(true, "screen-saver");
  // Desktop stays usable — chrome opts in via hud:setIgnoreMouse(false).
  hudWindow.setIgnoreMouseEvents(true, { forward: true });
  // Cluely-style: excluded from desktopCapturer / most screen share & screenshots.
  // Not a kernel bypass — OS-level DWM content protection. CapturePage still works for us.
  // Reads the setting rather than hardcoding true: a window created AFTER the
  // user turned capture on would otherwise come back protected, so the toggle
  // appeared to work and then silently undid itself.
  try {
    hudWindow.setContentProtection(!captureVisible());
  } catch {
    /* ok */
  }
  try {
    hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    /* ok */
  }
  hudWindow.loadFile(path.join(__dirname, "hud.html"));
  hudWindow.on("closed", () => {
    hudWindow = null;
  });
  // Keep the process alive even if the HUD is closed — recreate shell on demand.
  hudWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      try {
        hudWindow.hide();
      } catch {
        /* ok */
      }
    }
  });
  return hudWindow;
}

function setHudClickThrough(ignore) {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  try {
    if (ignore) hudWindow.setIgnoreMouseEvents(true, { forward: true });
    else hudWindow.setIgnoreMouseEvents(false);
  } catch {
    /* ok */
  }
}

function applyAppMode(modeId, { reason = "" } = {}) {
  const prev = appMode;
  appMode = getMode(modeId).id;
  const spec = getMode(appMode);
  if (spec.autoNotes && (!notes.file || prev !== appMode)) {
    const started = notes.start(appMode);
    try {
      shell.openPath(started.folder);
    } catch {
      /* ok */
    }
  }
  if (!spec.autoNotes && notes.file) {
    notes.stop();
  }
  // General / Transcribe / Meeting must actually capture audio — mode switch
  // arms STT. `listens` is declared on the mode so adding a listening mode does
  // not mean remembering to extend an or-chain here.
  const armMic = spec.listens === true;
  const armSystem = appMode === "meeting";
  if (armMic) {
    listenMic = true;
    hudPaused = false;
    ensureSttSidecar();
  }
  if (armSystem) {
    listenSystem = true;
    ensureSttSidecar();
  }
  sendHud({
    type: "mode",
    mode: appMode,
    label: spec.label,
    chrome: spec.chrome,
    reason,
    notesPath: notes.file,
  });
  if (armMic || armSystem) {
    sendHud({
      type: "auto-listen",
      mic: listenMic,
      system: listenSystem,
      paused: false,
    });
  }
  sendStage({
    type: "subtitle",
    text: `${spec.label} mode${reason ? ` — ${reason}` : ""}`,
    ms: 3500,
  });
  return {
    ok: true,
    mode: appMode,
    notesPath: notes.file,
    listen: listenMic,
    systemAudio: listenSystem,
  };
}

function ensureSttSidecar() {
  if (process.env.NETIE_STT_AUTOSTART === "0") return;
  if (!features.isEnabled("sttSidecar")) return;
  if (sttChild && !sttChild.killed) return;
  const script = path.join(__dirname, "..", "scripts", "stt_sidecar.py");
  if (!fs.existsSync(script)) return;
  try {
    sttChild = spawn("py", ["-3.12", script], {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        NETIE_STT_MODEL: process.env.NETIE_STT_MODEL || "small",
        NETIE_STT_DEVICE: process.env.NETIE_STT_DEVICE || "cpu",
        NETIE_STT_PORT: process.env.NETIE_STT_PORT || "8766",
      },
      stdio: "ignore",
      windowsHide: true,
    });
    sttChild.on("exit", () => {
      sttChild = null;
    });
    console.log("STT sidecar spawning (faster-whisper multilingual)...");
  } catch (err) {
    console.error("STT sidecar failed to start:", err.message || err);
  }
}

/** True only while the user explicitly revealed the HUD (hotkey / tray). */
let hudUserOpened = false;
/** Restore HUD after Frame overlay only if the user had it open. */
let hudVisibleBeforeOverlay = false;

function isHudVisible() {
  return Boolean(hudWindow && !hudWindow.isDestroyed() && hudWindow.isVisible());
}

/**
 * Intentional reveal only — never call from auto paths (ready / plan / clicky / capture).
 * @param {{ expandChat?: boolean }} [opts]
 */
function showHud(opts = {}) {
  // Default: liquid top bar + chat open. Pass expandChat: false for bar-only.
  const expandChat = opts.expandChat !== false;
  const win = createHud();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  win.setBounds({ ...display.bounds });
  try {
    if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide();
  } catch {
    /* ok */
  }
  hudUserOpened = true;
  win.show();
  win.focus();
  sendHud({ type: "reset-timer" });
  sendHud({ type: "ui", chatOpen: expandChat, compact: !expandChat });
  if (expandChat) sendHud({ type: "open-ask" });
}

function hideHud() {
  hudUserOpened = false;
  if (hudWindow && !hudWindow.isDestroyed()) hudWindow.hide();
  // Hide means hide. The stage is a SEPARATE window, so hiding the HUD left its
  // "Nod / say yes / press Y" toast and any error text sitting on screen with no
  // chrome attached to them — which reads as the app leaking text onto the
  // desktop. Anything that draws must be hidden here.
  hideStage();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
}

/** Push HUD events only when the overlay is already open — never force-pop. */
function sendHudQuiet(event) {
  if (isHudVisible()) sendHud(event);
}

function hidePanel() {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide();
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
    stageWindow.setContentProtection(!captureVisible());
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

function saveCurrentConversation(title, kind = "agent") {
  if (!sessionTurns.length) return { ok: false, error: "nothing to save" };
  if (!settings.get("saveAllMarkdown")) return { ok: false, skipped: true };
  const firstUser = sessionTurns.find((x) => x.role === "user");
  const res = chats.save({
    title: title || (firstUser && firstUser.text.slice(0, 60)) || "Netie Click session",
    turns: sessionTurns,
    meta: {
      deviceId: hot.deviceId,
      airgptId: AIRGPT_DAY,
      kind,
    },
  });
  return res;
}

/**
 * Stream the cursor position so the LIVE subtitle can sit beside it.
 *
 * Not the old cursor-adjacent bubble — that was chrome that followed you around
 * and is not coming back. This moves the transcript bar only, so what you said
 * is where you are looking instead of pinned to the top of the screen.
 *
 * Polled rather than hooked: the HUD is click-through, so it receives no
 * pointermove events over anything but its own chrome. 60ms is under a frame at
 * 16fps — smooth enough to read, cheap enough to leave on.
 */
function startCursorTracking() {
  if (cursorTrackTimer) return;
  if (settings.get("followCursor") === false) return;
  cursorTrackTimer = setInterval(() => {
    if (!isHudVisible()) return;
    try {
      const point = screen.getCursorScreenPoint();
      const bounds = hudWindow.getBounds();
      sendHudQuiet({ type: "cursor", x: point.x - bounds.x, y: point.y - bounds.y });
    } catch {
      /* display detached mid-poll */
    }
  }, 60);
}

/**
 * Show or hide Netie's windows from screen capture.
 *
 * `setContentProtection(true)` is the default and is why the HUD does not appear
 * in its own screenshots, in Teams shares, or to an automation tool. Passing
 * `visible` flips all three windows at once so none of them can be left behind
 * in the wrong state.
 */
/**
 * Is Netie allowed to appear in screen capture?
 *
 * `NETIE_CAPTURE_VISIBLE=1` wins over the stored setting so a demo, a bug
 * report, or a tool driving the app can turn this on without clicking through
 * a HUD that is — by definition — invisible to the thing trying to click it.
 */
function captureVisible() {
  if (process.env.NETIE_CAPTURE_VISIBLE === "1") return true;
  return settings.get("captureVisible") === true;
}

function applyContentProtection(visible) {
  const protect = !visible;
  for (const win of [hudWindow, stageWindow, panelWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) {
      try {
        win.setContentProtection(protect);
      } catch {
        /* platform without the API */
      }
    }
  }
  return { protected: protect };
}

function stopCursorTracking() {
  if (cursorTrackTimer) {
    clearInterval(cursorTrackTimer);
    cursorTrackTimer = null;
  }
}

function createCanvas() {
  if (canvasWindow && !canvasWindow.isDestroyed()) {
    canvasWindow.show();
    canvasWindow.focus();
    return canvasWindow;
  }
  canvasWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: true,
    title: "Netie Review Canvas",
    backgroundColor: "#0f1218",
    webPreferences: {
      preload: path.join(__dirname, "canvas-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  canvasWindow.loadFile(path.join(__dirname, "canvas.html"));
  canvasWindow.on("closed", () => {
    canvasWindow = null;
  });
  return canvasWindow;
}

/**
 * Approval is a decision this process makes, never a property of the plan.
 *
 * `_approved` is the executor's only gate (see executeApproved). It is set in
 * exactly three places, all of them after a human acted. Copying an action with
 * `{...a}` preserved whatever arrived on it, so a planner that emitted
 * `_approved:true` — trivially injectable through on-screen text, which reaches
 * the vision planner as an ungated screenshot — approved its own irreversible
 * steps. ecosystem.sanitizeModelAction now whitelists planner fields at the
 * trust boundary; this is the second line, so that any future path into the
 * executor still has to grant approval explicitly rather than inherit it.
 */
function stripApproval(action) {
  const { _approved, ...rest } = action || {};
  return rest;
}

/**
 * After a plan is ready: auto-run sensible steps, or wait for a nod, else panel.
 */
async function maybeRunPlan(plan, { teach = true } = {}) {
  if (!plan || !plan.ok) return { ran: false, plan };
  // HUD-03 — the mode gate lives HERE, not only at hud:act. There are seven
  // call sites (hotkey go, approvePlan, recipes, skills, replan…) and a check
  // at one entry point is a check one new caller away from being bypassed.
  // This is the chokepoint every plan passes through, same argument as
  // guardPlan living inside reviewPlan.
  if (!allowsActions(appMode)) {
    const label = getMode(appMode).label;
    sendHudQuiet({
      type: "insight",
      text: `${label} mode doesn't act on the screen — switch to Agent mode to run steps.`,
    });
    return { ran: false, mode: "mode-blocked", blockedBy: appMode, plan };
  }
  const actions = plan.actions || [];
  const steps = actions.map(
    (a, i) => `${a.type}${a.target ? ` → ${a.target}` : ""}`.slice(0, 80) || `step ${i + 1}`
  );
  // Teach steps go to HUD Live insights — not floating cursor bubbles.
  if (teach && steps.length) {
    sendHud({
      type: "insight",
      text: steps.map((s, i) => `${i + 1}. ${s}`).join(" · ").slice(0, 420),
    });
  }

  const autoOnes = actions.filter((a) => a.safety && a.safety.disposition === "auto");
  const needHuman = actions.filter((a) => a.safety && a.safety.disposition === "approve");

  // Sensible-only plan → run immediately (no Enter).
  if (!plan.needsApproval && autoOnes.length) {
    const toRun = actions.map((a) => {
      const copy = stripApproval(a);
      if (a.safety && a.safety.disposition === "auto") copy._approved = true;
      return copy;
    });
    sendStage({ type: "subtitle", text: "Running sensible steps…", ms: 2500 });
    const results = await executeApproved(toRun);
    stopCursorTracking();
    return { ran: true, mode: "auto", results, plan };
  }

  // Mixed / irreversible: optional nod gate (disable in ⋯ settings).
  if (needHuman.length && settings.get("nodConfirm")) {
    setPresence(PresenceEvents.WAIT);
    sendStage({ type: "nod-wait", on: true, text: "Nod · say “yes” · or press Y to run safe steps" });
    sendHud({ type: "nod-wait", on: true });
    const affirmed = await nodGate.begin();
    sendStage({ type: "nod-wait", on: false });
    sendHud({ type: "nod-wait", on: false });
    if (affirmed && affirmed.ok) {
      setPresence(PresenceEvents.NOD);
      const toRun = actions.map((a) => {
        // Strip first, then grant. Building on `{...a}` meant an `_approved`
        // that arrived on the action was already true, so the deliberate
        // refusal below ("irreversible steps do not ride a nod") granted
        // nothing but also revoked nothing.
        const copy = stripApproval(a);
        if (a.safety && a.safety.disposition === "auto") copy._approved = true;
        else if (a.safety && a.safety.disposition === "approve" && !a.safety.irreversible) {
          copy._approved = true;
        }
        return copy;
      });
      sendStage({ type: "subtitle", text: `Affirmed (${affirmed.via}) — running…`, ms: 2500 });
      const results = await executeApproved(toRun);
      stopCursorTracking();
      return { ran: true, mode: "nod", results, plan };
    }
  }

  // Needs human judgment — update HUD if open; otherwise stage toast + Ctrl+Y (no force-pop).
  //
  // This is the approval moment itself, so it is the one place a step count is
  // least defensible (#20). Describe only the steps that actually need the nod:
  // listing the auto ones here would bury the decision in noise.
  const nodDisclosure = approvalPrompt(needHuman);
  sendHudQuiet({
    type: "answer",
    meta: "Waiting for your nod",
    text: `${nodDisclosure.detail}\n\nSay yes, press Affirm, or Ctrl+Y.`,
  });
  sendHudQuiet({ type: "nod-wait", on: true });
  sendStage({
    type: "subtitle",
    text: `${nodDisclosure.summary} — Affirm / Ctrl+Y`,
    ms: 4500,
  });
  return { ran: false, mode: "hud-nod", plan };
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
      // AudioWorklet module + captured mic/loopback streams.
      "worker-src 'self' blob:",
      "media-src 'self' blob: mediastream:",
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
    panelWindow.setContentProtection(!captureVisible());
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
  // Hide chrome while framing; restore only if the user had HUD open.
  hudVisibleBeforeOverlay = isHudVisible() || hudUserOpened;
  if (isHudVisible()) {
    if (hudWindow && !hudWindow.isDestroyed()) hudWindow.hide();
  }
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
    if (hudVisibleBeforeOverlay) showHud({ expandChat: false });
    hudVisibleBeforeOverlay = false;
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
  if (!features.isEnabled("hotTicks")) return;
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
  // A full-screen capture must record the DISPLAY as its region. Storing null
  // here left region = {0,0,0,0} in executeApproved, and driver.js gates percent
  // -> pixel conversion on `region.width`, so every xPct/yPct action failed with
  // "missing coordinates" and broke the plan on its first click.
  const region = regionLogical || {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
  };
  lastCapture = { path: file, dataUrl, region, fullScreen: !regionLogical };
  return lastCapture;
}

/** Ensure we have a screenshot before planning (tray-opened HUD may have none). */
async function ensureCaptureForPlan() {
  if (lastCapture && lastCapture.dataUrl) return lastCapture.dataUrl;
  try {
    const cap = await captureDisplayCrop(null);
    return (cap && cap.dataUrl) || null;
  } catch (err) {
    console.error("ensureCaptureForPlan:", err.message || err);
    return null;
  }
}

/**
 * Resolve vault placeholders on a recipe/skills plan. If profile fields are
 * missing, ask the human (enquire) — never type `{{vault…}}` into a form.
 */
function prepareVaultPlan(actions, message = "") {
  const profile = settings.vaultProfile();
  const missing = missingVaultKeys(actions);
  const filled = resolveVaultTemplates(actions, profile);
  if (missing.length) {
    // P5-ENQUIRE — labels and examples, not bare keys: the panel has to be
    // answerable. `fieldsToPrompts` also drops anything secret or unknown, so a
    // poisoned plan cannot turn this into a password box.
    const prompts = fieldsToPrompts(missing);
    const fields = prompts.map((p) => p.key);
    if (!prompts.length) {
      // Every missing key was secret or unrecognised — there is nothing a human
      // can usefully type here, and pretending otherwise would stall silently.
      sendHud({
        type: "answer",
        meta: "Blocked",
        text: "This form needs a secret. Netie does not type secrets — use OpenVault custody.",
      });
      return { ok: false, needsEnquire: false, fields: [], actions: filled };
    }
    // Hold the plan so answering the panel can resume it instead of making the
    // user retype the whole request.
    pendingEnquire = { actions, message: String(message || ""), at: Date.now() };
    sendHud({
      type: "enquire",
      meta: "Need profile",
      text: `Tell me your ${prompts.map((p) => p.label.toLowerCase()).join(", ")} — I will not type placeholders.`,
      fields,
      prompts,
    });
    return { ok: false, needsEnquire: true, fields, prompts, actions: filled };
  }
  return { ok: true, actions: filled, fields: [] };
}

function recipeCoordContext() {
  try {
    const pt = screen.getCursorScreenPoint();
    return { coords: { x: pt.x, y: pt.y } };
  } catch {
    return {};
  }
}

/**
 * A-0007 / FIX-C09 — recipes and skills used to skip /dms/secure.
 * Fail-closed: Cortex down or blocked ⇒ no act path, even for "cheap SOPs".
 */
async function secureBeforeAct(message, where) {
  const gate = await eco.secure(String(message || ""), { failClosed: true });
  if (gate.blocked) {
    try {
      await eco.audit("clicks.blocked", {
        where: where || "act-fast-path",
        reasons: gate.reasons || [],
        degraded: Boolean(gate.degraded),
      });
    } catch {
      /* audit soft-fail */
    }
    const why = (gate.reasons && gate.reasons[0]) || "blocked";
    const text = gate.degraded
      ? `Cortex security gate unavailable — refusing to act (${why}).`
      : `Blocked by Cortex security gate (${why}).`;
    sendHud({ type: "answer", meta: "Security gate", text });
    sendHud({ type: "insight", text });
    return { ok: false, blocked: true, degraded: Boolean(gate.degraded), reasons: gate.reasons || [], text };
  }
  return { ok: true, safeText: gate.safeText || message, degraded: Boolean(gate.degraded) };
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

function plannerContext(instruction = "") {
  let mem = "";
  try {
    mem = brain.contextForLlm();
  } catch {
    mem = "";
  }
  let prefs = "";
  try {
    if (/fill|form|ticket|flight|passenger|profile|book/i.test(String(instruction || ""))) {
      prefs = brain.maskedPrefs(instruction) || "";
    }
  } catch {
    prefs = "";
  }
  const recallTxt = (() => {
    try {
      return recall.summaryText({ limit: 14 });
    } catch {
      return "";
    }
  })();
  let ground = "";
  try {
    ground = plannerGrounding(instruction);
  } catch {
    ground = "";
  }
  return [
    hot.summaryText(),
    mem ? `Personal memory:\n${mem}` : "",
    prefs ? `Masked prefs (no raw PII):\n${prefs}` : "",
    recallTxt ? `Clicky recall (last ~60s):\n${recallTxt}` : "",
    ground || "",
    clickyState === ClickyStates.CLICKY ? "Mode: Clicky armed — prefer concrete screen actions." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Floating Clicky ring removed — identity is the real Windows pointer (pointer.js). */

/**
 * Cheap 1Hz (or 2Hz lite) thumb for Recall — not the full planner capture.
 */
async function captureRecallThumb() {
  const pt = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(pt);
  const scale = display.scaleFactor || 1;
  const longEdge = features.isEnabled("recallLite") ? 320 : 480;
  const aspect = display.size.height / Math.max(1, display.size.width);
  const tw = Math.round(longEdge * scale);
  const th = Math.round(longEdge * aspect * scale);
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: tw, height: th },
  });
  const displayId = String(display.id);
  const source =
    sources.find((s) => s.display_id && String(s.display_id) === displayId) || sources[0];
  if (!source) return null;
  let image = source.thumbnail;
  const size = image.getSize();
  const long = Math.max(size.width, size.height);
  if (long > longEdge) {
    const f = longEdge / long;
    image = image.resize({
      width: Math.round(size.width * f),
      height: Math.round(size.height * f),
    });
  }
  const jpeg = image.toJPEG(features.isEnabled("recallLite") ? 32 : 42);
  return {
    jpeg,
    width: image.getSize().width,
    height: image.getSize().height,
    displayId,
    cx: pt.x,
    cy: pt.y,
  };
}

async function recallTick() {
  if (recallBusy || !features.isEnabled("recall") || hudPaused) return;
  recallBusy = true;
  try {
    const cap = await captureRecallThumb();
    if (!cap) return;
    let fg = { title: "?", proc: "?" };
    try {
      fg = await driver.foreground();
    } catch {
      /* dry-run / worker */
    }
    recall.push({
      t: Date.now(),
      cx: cap.cx,
      cy: cap.cy,
      displayId: cap.displayId,
      fgTitle: fg.title,
      fgProc: fg.proc,
      thumbJpeg: cap.jpeg,
      width: cap.width,
      height: cap.height,
    });
  } catch (err) {
    console.error("recall tick:", err.message || err);
  } finally {
    recallBusy = false;
  }
}

function startRecallDaemon() {
  stopRecallDaemon();
  if (!features.isEnabled("recall")) return;
  if (!shouldRunRecall()) return;
  // MEASURED: desktopCapturer.getSources() costs ~350ms on this machine and the
  // cost is pipeline setup, NOT thumbnail size (320px ~= full-res). At the old
  // 1000ms cadence the app blocked ~35% of every second — that was the lag.
  // Shrinking the thumbnail does nothing; only calling it less often helps.
  const ms = features.isEnabled("recallLite") ? 15000 : 5000;
  // Kick immediately once a session/clicky starts.
  recallTick().catch(() => {});
  recallTimer = setInterval(() => {
    recallTick().catch(() => {});
  }, ms);
  if (recallTimer.unref) recallTimer.unref();
  console.log(`Clicky recall daemon @ ${ms}ms (sealPixels=${recall.sealPixels})`);
}

function stopRecallDaemon() {
  if (recallTimer) clearInterval(recallTimer);
  recallTimer = null;
}

function shouldRunRecall() {
  return state !== "IDLE" || clickyState === ClickyStates.CLICKY;
}

function reconcileRecallDaemon() {
  if (shouldRunRecall()) startRecallDaemon();
  else stopRecallDaemon();
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
  // HUD-03, for real this time. The gate was at hud:act, then at maybeRunPlan —
  // but clicks:approvePlan calls this function directly, so both were one
  // caller away from bypass. This is where the driver is actually reached, so
  // this is where "General mode cannot act" has to be true.
  if (!allowsActions(appMode)) {
    const label = getMode(appMode).label;
    sendHudQuiet({
      type: "insight",
      text: `${label} mode doesn't act on the screen — switch to Agent mode to run steps.`,
    });
    return (actions || []).map((action) => ({
      action,
      ok: false,
      skipped: "mode-blocked",
      message: `${label} mode does not act`,
    }));
  }
  abortPlan = false;
  planRunning = true;
  let lastWordDocx = null;
  const needsVeil = (actions || []).some(
    (a) =>
      a &&
      (a.type === "type" || a.type === "fill" || a.type === "clipboard_paste") &&
      String(a.value || a.text || "").length > 0
  );
  if (needsVeil) {
    try {
      setPrivacyVeil(true, { BrowserWindow, screen, path, rootDir: __dirname });
    } catch (err) {
      console.error("privacy veil:", err.message || err);
    }
  }
  grabKillSwitch();
  setPresence(PresenceEvents.START);
  sendHud({ type: "plan-running", on: true });
  // The status pill (Perplexity refs 08/09) shipped with an element, CSS and a
  // renderer branch, and nothing ever sent it — so a run showed no progress at
  // all. Drive it from the run itself: what is happening now, and how far in.
  const runTotal = (actions || []).length;
  sendHud({
    type: "status",
    title: "Working...",
    sub: describePlan(actions || []).summary,
  });
  agentPointer.enabled = settings.get("cursorBubble") !== false;
  try {
    await agentPointer.set("agent");
  } catch (err) {
    console.error("agent pointer:", err.message || err);
  }
  const results = [];
  let capped = (actions || []).slice(0, MAX_AGENT_STEPS);
  // Last line before the OS. Every path is supposed to have resolved its
  // `{{vault.*}}` placeholders already; if one reaches here the answer is not
  // "type it and hope" — a literal template in a form field gets submitted by
  // the user. Drop it, and say so rather than failing quietly (R-0011).
  if (hasRawTemplate(capped)) {
    const blocked = capped.filter((a) => hasRawTemplate([a]));
    capped = capped.filter((a) => !hasRawTemplate([a]));
    sendHud({
      type: "insight",
      text: `Dropped ${blocked.length} step(s): unresolved vault placeholder — nothing was typed.`,
    });
    await eco.audit("clicks.vault.unresolved", {
      dropped: blocked.length,
      targets: blocked.map((a) => String(a.target || "").slice(0, 40)),
    });
  }
  demoDebug.setEnabled(settings.get("demoDebug") === true);
  const debugDir = demoDebug.beginRun("act");
  if (debugDir) {
    sendHud({ type: "insight", text: `Demo debug: ${debugDir}` });
  }
  /**
   * Re-read the screen for EACH step that needs aiming. These were consts
   * captured once before the loop, so a multi-app plan ("copy from the
   * terminal, then click Blank document in Word") resolved every later target
   * against the screenshot taken before Word existed — the vision model was
   * asked to find a control that was not on screen yet.
   */
  const currentView = () => ({
    region: (lastCapture && lastCapture.region) || { x: 0, y: 0, width: 0, height: 0 },
    dataUrl: (lastCapture && lastCapture.dataUrl) || null,
  });
  /** Actions whose target only exists after a previous step changed the screen. */
  const needsFreshView = (t) =>
    [
      "click",
      "doubleclick",
      "rightclick",
      "hover",
      "movecursor",
      "type",
      "fill",
      "paste",
      "drag",
      "press",
    ].includes(String(t || "").toLowerCase());

  /** Drop planner aim so vision re-resolves against a fresh capture. */
  const stripAimCoords = (action) => {
    const next = { ...(action || {}) };
    delete next.xPct;
    delete next.yPct;
    delete next.x;
    delete next.y;
    delete next.screenX;
    delete next.screenY;
    return next;
  };

  /** type/fill often leave the region hash unchanged (caret blink only) — warn, don't abort. */
  const softVerifyOnly = (t) =>
    ["type", "fill", "press", "paste", "clipboard_paste"].includes(String(t || "").toLowerCase());

  try {
    if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide();
    await new Promise((r) => setTimeout(r, 280));
  } catch {
    /* ok */
  }

  try {
    let runStep = 0;
    for (const action of capped) {
      if (abortPlan) {
        results.push({ action, ok: false, skipped: "aborted" });
        break;
      }
      runStep += 1;
      // Same describer as the approval prompt (#20), so what the customer
      // approved and what they watch happen are worded identically.
      sendHudQuiet({
        type: "status",
        title: `Step ${runStep} of ${runTotal}`,
        sub: describeAction(action).text,
      });
      const d = action.safety && action.safety.disposition;
      if (d === "refuse") {
        results.push({ action, ok: false, skipped: "refused" });
        continue;
      }
      if (d === "custody") {
        const custody = await eco.requestCustody({
          field: action.field || action._custody,
          target: action.target,
        });
        // WP-P2-CUSTODY-INJECT — when OpenVault injected the value itself, the
        // step is DONE and the plan carries on. It used to record a failure
        // either way, so a password field that had just been filled correctly
        // stalled everything after it. Netie still never sees the secret.
        if (custody.injected === true) {
          results.push({ action, ok: true, via: "custody", message: custody.message });
          sendHud({ type: "insight", text: `${action.target || "Secret"} filled by OpenVault custody.` });
          continue;
        }
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
      // Refresh the screenshot before aiming, so targets created by earlier
      // steps (a launched app, an opened dialog) are actually visible.
      let refreshedView = false;
      // Only pay the ~350ms capture when this step must actually be AIMED by
      // vision — no coordinates, or plan-guard stripped them after an app
      // switch. Steps that already carry valid coordinates were costing a full
      // screen capture for nothing, on every single step.
      const mustReaim =
        needsFreshView(action.type) &&
        (action._reaim === true || (action.xPct == null && action.yPct == null));
      if (!driver.dryRun && mustReaim) {
        try {
          await captureDisplayCrop(null);
          refreshedView = true;
        } catch (err) {
          console.error("pre-step capture:", err.message || err);
        }
      }
      const { region, dataUrl } = currentView();
      const aimSource = refreshedView ? stripAimCoords(action) : action;
      const enriched = await ensureActionCoords(aimSource, {
        dataUrl,
        eco,
        uia: uiaContext(region),
      });
      // Auto-swap Windows pointer face per action (click vs type/agent).
      try {
        const face = modeForAction(enriched.type);
        if (agentPointer.mode !== face) await agentPointer.set(face);
      } catch (err) {
        console.error("agent pointer swap:", err.message || err);
      }
      sendHud({
        type: "pointer",
        mode: agentPointer.mode,
        action: enriched.type,
        aimedVia: enriched._targetedVia || null,
      });
      if (enriched._targetedVia === "vision") {
        sendHudQuiet({
          type: "insight",
          text: `Aiming “${enriched.target || enriched.type}” by vision — the OS could not name that control.`,
        });
      }
      sendStage({
        type: "subtitle",
        text: `${enriched.type}${enriched.target ? ` · ${enriched.target}` : ""}`,
        ms: 1800,
        sound: false,
      });
      sendStage({ type: "mood", mood: "crazy" });
      sendStage({ type: "cursor-move", stepIndex: results.length });
      // WP-P2-VERIFY-DEFAULT — SHA-256 PNG verify is noisy and costs two
      // captures per step, so it stays off for routine work. It is now ON by
      // default for the steps a silent no-op actually hurts: irreversible
      // controls and launches. `settings.verifySteps` still forces everything.
      const verifyOn = settings.get("verifySteps") === true;
      const verdict = shouldVerifyStep(enriched, {
        verifyAll: verifyOn,
        hasRegion: Boolean(region.width),
      });
      const needsVerify = verdict.verify;
      let beforeFp = null;
      if (needsVerify && !driver.dryRun) {
        try {
          beforeFp = pngFingerprint((await captureDisplayCrop(region)).dataUrl);
        } catch {
          beforeFp = pngFingerprint(lastCapture && lastCapture.dataUrl);
        }
      }

      demoDebug.recordStep(
        {
          phase: "before",
          type: enriched.type,
          target: enriched.target || null,
          reaim: Boolean(enriched._reaim || aimSource !== action),
        },
        lastCapture && lastCapture.path
      );

      let outcome;
      try {
        outcome = await driver.perform(enriched, { region });
      } catch (err) {
        outcome = { ok: false, error: String(err.message || err) };
      }

      if (
        outcome &&
        outcome.ok &&
        (enriched.type === "word_from_clipboard" ||
          enriched.type === "word_docx_write" ||
          enriched.type === "word_docx_append") &&
        outcome.path &&
        !outcome.dryRun &&
        !driver.dryRun
      ) {
        lastWordDocx = {
          path: outcome.path,
          bytes: outcome.bytes || 0,
          chars: outcome.chars || 0,
          preview: outcome.preview || "",
        };
        sendWordDocxReady(lastWordDocx);
      }

      if (outcome.ok && beforeFp && !driver.dryRun) {
        try {
          await new Promise((r) => setTimeout(r, 200));
          const after = await captureDisplayCrop(region);
          const afterFp = pngFingerprint(after.dataUrl);
          if (afterFp && afterFp === beforeFp) {
            if (softVerifyOnly(enriched.type)) {
              console.warn(
                `post-step verify: no visible change after ${enriched.type} - continuing`
              );
              outcome = {
                ...outcome,
                verified: false,
                verifyWarning: "no visible change (soft)",
              };
              lastCapture = after;
            } else {
              outcome = {
                ...outcome,
                ok: false,
                error: "no visible change after action — stopped",
                verified: false,
              };
            }
          } else {
            outcome.verified = true;
            lastCapture = after;
          }
        } catch {
          outcome.verified = null;
        }
      } else if (driver.dryRun) {
        outcome.verified = "dry-run";
      } else {
        outcome.verified = needsVerify ? outcome.verified : verdictWhenSkipped(verdict.reason);
        outcome.verifyReason = verdict.reason;
      }

      demoDebug.recordStep(
        {
          phase: "after",
          type: enriched.type,
          ok: Boolean(outcome.ok),
          verified: outcome.verified,
          error: outcome.error || null,
        },
        lastCapture && lastCapture.path
      );

      await eco.audit("clicks.action.executed", {
        type: enriched.type,
        disposition: d,
        ok: Boolean(outcome.ok),
        dryRun: driver.dryRun,
        targeted: Boolean(enriched._targeted),
        // "The OS told us where the control is" and "a model guessed from a
        // screenshot" are not the same claim, and the ledger is where that
        // difference has to survive (R-0011).
        targetedVia: enriched._targetedVia || null,
        verified: outcome.verified,
        verifyReason: outcome.verifyReason || null,
      });
      if (features.isEnabled("fleetTelemetry")) {
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
      }

      const message = outcome.ok
        ? `${enriched.type}${outcome.x != null ? ` @ (${Math.round(outcome.x)},${Math.round(outcome.y)})` : ""}${
            enriched._targeted ? " [aimed]" : ""
          }${driver.dryRun ? " [dry-run]" : ""}`
        : `failed: ${outcome.error || outcome.reason || outcome.skipped || "unknown"}`;
      results.push({ action: enriched, ...outcome, message });
      if (!outcome.ok && !outcome.noop) {
        setPresence(PresenceEvents.FAIL);
        sendHud({ type: "insight", text: message });
        break;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    if (!abortPlan && results.every((r) => r.ok || r.noop || r.skipped === "refused")) {
      setPresence(PresenceEvents.COMPLETE);
    }
  } finally {
    planRunning = false;
    releaseKillSwitch();
    try {
      setPrivacyVeil(false, { BrowserWindow, screen, path, rootDir: __dirname });
    } catch {
      /* ok */
    }
    demoDebug.endRun({
      aborted: Boolean(abortPlan),
      steps: results.length,
    });
    sendHud({ type: "plan-running", on: false });
    // A pill left on "Working..." after the work finished is worse than never
    // showing one (R-0011). `done` hides the pill; if a document was produced
    // we re-raise `word-docx` AFTER that hide so Open stays up. The old order
    // sent word-docx mid-run and then done, so Document ready vanished.
    sendHud({ type: "status", done: true });
    if (lastWordDocx) sendWordDocxReady(lastWordDocx);
    try {
      await agentPointer.restore();
    } catch {
      /* ok */
    }
    setTimeout(() => setPresence(PresenceEvents.RESET), 1600);
    // Stay invisible after plans — do not force-pop the HUD.
    sendHudQuiet({ type: "insight", text: "Plan finished." });
  }
  return results;
}

function armSession() {
  state = "ARMED";
  reconcileRecallDaemon();
  startTicks();
  // Ctrl+` / tray — intentional reveal (liquid bar + chat).
  captureDisplayCrop(null)
    .then((cap) => {
      lastCapture = cap;
      hidePanel();
      showHud({ expandChat: true });
      sendHud({
        type: "insight",
        text: "Ready. Record to speak, or type in chat. Hide morphs to the corner.",
      });
      state = "ACTIVE";
    })
    .catch((err) => {
      showHud({ expandChat: true });
      sendHud({ type: "insight", text: `Capture failed: ${err.message || err}` });
      state = "ACTIVE";
    });
}

function disarmSession() {
  try {
    if (sessionTurns.length) saveCurrentConversation();
    brain.absorbHotSummary(hot.summaryText());
    brain.syncFleet("session-end").catch(() => {});
    stt.stop().catch(() => {});
  } catch {
    /* ok */
  }
  state = "IDLE";
  reconcileRecallDaemon();
  stopTicks();
  closeOverlay();
  hideStage();
  hideHud();
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
  tray.setToolTip("Netie Pointer");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Toggle session (${HOTKEY})`,
        click: () => armSession(),
      },
      {
        label: "Show chat",
        click: () => showHud(),
      },
      {
        label: "Frame region (drag box)",
        click: () => openOverlay(),
      },
      {
        label: "Review canvas",
        click: () => createCanvas(),
      },
      { type: "separator" },
      {
        label: "Open conversations folder",
        click: () => chats.reveal(),
      },
      {
        label: settings.get("autoRunSensible") ? "✓ Auto-run sensible" : "Auto-run sensible",
        click: () => {
          settings.set({ autoRunSensible: !settings.get("autoRunSensible") });
          createTray();
        },
      },
      {
        label: settings.get("nodConfirm") ? "✓ Nod confirm" : "Nod confirm",
        click: () => {
          settings.set({ nodConfirm: !settings.get("nodConfirm") });
          createTray();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.isQuitting = true;
          disarmSession();
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => showHud());
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
  // Affirmation hotkey while nod gate is open (does not steal Y globally forever —
  // only registered… actually Electron can't scope easily; use Control+Y).
  try {
    globalShortcut.register("Control+Y", () => {
      if (nodGate.pending) {
        nodGate.hotkey("ctrl-y");
        sendStage({ type: "subtitle", text: "Affirmed — going", ms: 1800 });
      }
    });
  } catch {
    /* ok */
  }
  // Hold-equivalent: Ctrl+Shift+Space toggles Clicky (cursor mode).
  try {
    globalShortcut.register("Control+Shift+Space", () => {
      if (!features.isEnabled("clicky")) return;
      if (clickyState === ClickyStates.CLICKY) setClicky(ClickyEvents.EXIT);
      else {
        setClicky(ClickyEvents.HOLD_START);
        setClicky(ClickyEvents.HOLD_COMMIT, { heldMs: CLICKY_HOLD_MS });
        // Clicky arms silently — no HUD pop. Backend + pointer stay live.
        sendHudQuiet({ type: "open-ask", clicky: true });
        sendHudQuiet({
          type: "insight",
          text: "Clicky on — cursor is Netie. Speak or type what to do.",
        });
        sendStage({ type: "subtitle", text: "Clicky on", ms: 1800 });
      }
    });
  } catch {
    /* ok */
  }
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
    lastCapture = cap;
    if (hudVisibleBeforeOverlay || hudUserOpened) showHud({ expandChat: false });
    sendHudQuiet({
      type: "insight",
      text: `Region ${Math.round(screenRegion.width)}×${Math.round(screenRegion.height)} captured.`,
    });
    return { ok: true };
  } catch (err) {
    if (hudVisibleBeforeOverlay || hudUserOpened) showHud({ expandChat: false });
    sendHudQuiet({ type: "insight", text: `Frame failed: ${err.message || err}` });
    sendStage({ type: "subtitle", text: `Frame failed: ${err.message || err}`, ms: 3500 });
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
  let dataUrl =
    (payload && payload.dataUrl) || (lastCapture && lastCapture.dataUrl) || null;
  if (!dataUrl) dataUrl = await ensureCaptureForPlan();
  const intent = classifyIntent(message);

  // Cheap SOPs still need the security gate (A-0007). Demo-without-LLM is not
  // permission to skip Cortex when the path still clicks the screen.
  if (intent === "act") {
    // Name the target application before planning anything (#24). If the
    // customer explicitly asked for an app Pointer cannot drive, say so by name
    // now — planning on regardless produces a plan that does something else,
    // which is the silent fallback R-0011 exists to forbid.
    const target = describeTarget(message);
    if (target.recognized && target.app.explicit && !target.drivable) {
      setPresence(PresenceEvents.FAIL);
      pushTurn("user", message);
      pushTurn("assistant", target.refusal);
      sendStage({ type: "bubble", role: "netie", text: target.refusal });
      sendHud({ type: "answer", meta: `Cannot drive ${target.app.name}`, text: target.refusal });
      return {
        ok: false,
        mode: "act",
        intent,
        blocked: true,
        reason: target.refusal,
        app: target.app.id,
        actions: [],
      };
    }
    const recipe = expandRecipe(matchRecipe(message), recipeCoordContext());
    if (recipe && recipe.actions && recipe.actions.length) {
      try {
        showStage();
        setPresence(PresenceEvents.THINK);
        pushTurn("user", message);
        sendStage({ type: "bubble", role: "user", text: message });
        const gate = await secureBeforeAct(message, "recipe");
        if (!gate.ok) {
          setPresence(PresenceEvents.FAIL);
          return { ok: false, mode: "act", intent, blocked: true, reason: gate.text, actions: [], recipe: recipe.id };
        }
        const vault = prepareVaultPlan(recipe.actions, message);
        if (!vault.ok) {
          return { ok: false, mode: "act", intent, needsEnquire: true, fields: vault.fields, recipe: recipe.id, actions: [] };
        }
        const reviewed = reviewPlan(vault.actions, settings.safetyPolicy());
        const plan = {
          ok: true,
          blocked: false,
          recipe: recipe.id,
          reason: `recipe:${recipe.id}`,
          actions: reviewed.actions,
          needsApproval: reviewed.needsApproval,
          autoOnly: reviewed.autoOnly,
        };
        pendingPlan = plan;
        const summary = `${recipe.label} · ${approvalPrompt(reviewed.actions || []).summary}`;
        pushTurn("assistant", summary);
        sendStage({ type: "bubble", role: "netie", text: summary });
        sendStage({ type: "subtitle", text: summary, ms: 3500 });
        const run = await maybeRunPlan(plan);
        if (settings.get("saveAllMarkdown")) saveCurrentConversation(message.slice(0, 60), "act");
        const failed = (run.results || []).find((r) => r && r.ok === false && !r.noop && r.skipped !== "refused");
        return {
          ...plan,
          ok: !failed,
          mode: "act",
          intent,
          ran: run.ran,
          runMode: run.mode || "recipe",
          run,
          reason: failed ? (failed.message || failed.error || failed.reason) : plan.reason,
        };
      } catch (err) {
        setPresence(PresenceEvents.FAIL);
        return { ok: false, mode: "act", intent, reason: String(err.message || err), actions: [] };
      }
    }
  }

  if (intent === "ask" || intent === "code") {
    try {
      const r = await askBuddy({
        message:
          intent === "code"
            ? `${message}\n\n(Respond with complete, runnable Python in fenced \`\`\`python blocks when code is needed. Prefer working solutions over sketches.)`
            : message,
        dataUrl,
      });
      if (!r.ok) {
        return {
          ok: false,
          mode: intent,
          error: r.text || "Ask failed",
          blocked: Boolean(r.blocked),
          degraded: Boolean(r.degraded),
        };
      }
      pushTurn("user", message);
      pushTurn("assistant", r.text);
      let pyCheck = null;
      if (intent === "code" && settings.get("runPythonChecks")) {
        pyCheck = await checkMarkdownPython(r.text);
        if (pyCheck.ran) {
          const summary = pyCheck.ok
            ? `Python check OK (${pyCheck.ran} block(s))`
            : `Python check failed — see stderr in session log`;
          pushTurn("assistant", summary);
          sendHud({ type: "answer", meta: summary, text: r.text });
        }
      }
      if (settings.get("saveAllMarkdown")) {
        saveCurrentConversation(message.slice(0, 60), intent === "code" ? "coding" : "ask");
      }
      return {
        ok: true,
        mode: intent,
        reply: r.text,
        degraded: Boolean(r.degraded),
        pyCheck,
      };
    } catch (err) {
      return { ok: false, mode: intent, error: String(err.message || err) };
    }
  }

  try {
    showStage();
    setPresence(PresenceEvents.THINK);
    pushTurn("user", message);
    sendStage({ type: "bubble", role: "user", text: message });
    sendStage({ type: "mood", mood: "thinking" });
    sendStage({ type: "subtitle", text: "Planning safely…", ms: 2500, sound: false });
    if (!dataUrl) dataUrl = await ensureCaptureForPlan();
    const plan = await eco.planActions({
      instruction: message,
      screenText: (payload && payload.screenText) || "",
      dataUrl,
      hotContext: plannerContext(),
      policy: settings.safetyPolicy(),
    });
    pendingPlan = plan;
    if (plan.ok) {
      try {
        const osr = await eco.classifyOsr(message);
        if (osr && osr.band) {
          plan.osr = osr;
          const tip = (osr.assumptions && osr.assumptions[0]) || `band=${osr.band}`;
          sendHud({
            type: "insight",
            text: `OSR ${osr.band}: ${tip}`,
          });
        }
      } catch (err) {
        console.error("osr classify:", err.message || err);
      }
      // A count is not disclosure (#20). Name the verb and the destination for
      // every step, so approving is a decision rather than a shrug.
      const disclosure = approvalPrompt(plan.actions || []);
      // If the customer named a target app, the confirmation leads with it
      // ("Do you want to type in Notepad?") rather than making them infer the
      // destination from the step list (#24).
      const appAsk = target.drivable && target.question ? `${target.question} ` : "";
      const summary = plan.needsApproval
        ? `${appAsk}${disclosure.prompt}`
        : `Auto-running: ${disclosure.summary}`;
      pushTurn("assistant", summary);
      sendStage({ type: "bubble", role: "netie", text: summary });
      sendStage({ type: "subtitle", text: summary, ms: 4500 });
      // The per-step lines go to the panel; the subtitle only has room for one.
      sendHud({
        type: "answer",
        meta: plan.needsApproval ? "Waiting for nod / approve" : "Auto-running",
        text: disclosure.detail,
      });
      if (features.isEnabled("fleetTelemetry")) {
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
      const run = await maybeRunPlan(plan);
      if (settings.get("saveAllMarkdown")) saveCurrentConversation(message.slice(0, 60), "act");
      const failed = (run.results || []).find((r) => r && r.ok === false && !r.noop && r.skipped !== "refused");
      return {
        ...plan,
        ok: !failed,
        mode: "act",
        intent,
        ran: run.ran,
        runMode: run.mode,
        run,
        reason: failed ? (failed.message || failed.error || failed.reason) : plan.reason,
      };
    }
    setPresence(PresenceEvents.FAIL);
    sendStage({ type: "subtitle", text: plan.reason || "Blocked", ms: 4000 });
    return { ...plan, mode: "act", intent };
  } catch (err) {
    setPresence(PresenceEvents.FAIL);
    return { ok: false, mode: "act", reason: String(err.message || err), actions: [] };
  }
});

ipcMain.handle("clicks:planActions", async (_e, payload) => {
  const instruction = (payload && payload.instruction) || "";
  let dataUrl =
    (payload && payload.dataUrl) || (lastCapture && lastCapture.dataUrl) || null;
  if (!dataUrl) dataUrl = await ensureCaptureForPlan();
  try {
    const plan = await eco.planActions({
      instruction,
      screenText: (payload && payload.screenText) || "",
      dataUrl,
      hotContext: plannerContext(),
      policy: settings.safetyPolicy(),
    });
    pendingPlan = plan;
    if (plan.ok) {
      try {
        const osr = await eco.classifyOsr(instruction);
        if (osr && osr.band) plan.osr = osr;
      } catch (err) {
        console.error("osr classify:", err.message || err);
      }
    }
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
    const copy = stripApproval(a);
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

function resolveNetieSpaceExe() {
  const candidates = [
    process.env.NETIE_SPACE_EXE,
    path.join("D:", "Netie Space", "dist", "NetieSpace", "NetieSpace.exe"),
    path.join(os.homedir(), "AppData", "Local", "NetieSpace", "NetieSpace.exe"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * Soft Space handoff only — never writes into Netie Space repo / preview fixtures.
 * Prefer `NetieSpace.exe --preview <md>` for one file; else Explorer on AppData chats.
 */
async function openInNetieSpace(filePath) {
  chats.ensure();
  const target =
    filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()
      ? filePath
      : chats.root;
  const spaceExe = resolveNetieSpaceExe();
  if (spaceExe && fs.existsSync(target) && fs.statSync(target).isFile()) {
    try {
      spawn(spaceExe, ["--preview", target], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
      return {
        ok: true,
        mode: "preview",
        file: target,
        hint: "Opened in Netie Space preview (Pointer AppData only).",
      };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }
  await shell.openPath(chats.root);
  return {
    ok: true,
    mode: "folder",
    folder: chats.root,
    hint: "Point Netie Space at this AppData folder — never mutate Space preview fixtures.",
  };
}

ipcMain.handle("clicks:openInSpace", async (_e, payload) => {
  try {
    return await openInNetieSpace(payload && payload.file);
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("hud:ready", async () => ({
  ok: true,
  listen: listenMic && !hudPaused,
  systemAudio: listenSystem,
  sidecar: stt.sidecarOnline,
}));

ipcMain.handle("hud:ask", async (_e, payload) => {
  const message = (payload && payload.message) || "";
  const dataUrl = (lastCapture && lastCapture.dataUrl) || null;
  showStage();
  // Attached files become part of the question, fenced as data (#23). Before
  // this the renderer showed a chip and sent nothing at all.
  const asked = `${message}${buildAttachmentBlock(payload && payload.attachments)}`;
  const r = await askBuddy({ message: asked, dataUrl });
  // P3-POINT-OVERLAY — "click here" is worth more pointed at than described.
  // The tokens are stripped from the prose either way, so a model that emits
  // them into a chat that cannot draw does not leak `[POINT:…]` at the user.
  const pointed = r.ok ? parsePoints(r.text) : { text: r.text, points: [] };
  // A provider chain that exhausts itself says the same thing six ways and never
  // names the file to edit. Keep the raw text for the console; show the fix.
  const failure = r.ok ? null : humanizeError(r.text || r.error);
  if (failure) console.error("hud:ask failed:", failure.raw);
  sendHud({
    type: "answer",
    meta: r.ok ? "AI response" : shortError(r.text || r.error),
    text: r.ok ? pointed.text : failure.text,
  });
  // toOverlayEvent carries the TTL, so the overlay never owns a policy about
  // how long a hint lives — and the acceptance test asserts a path that ships.
  if (pointed.points.length) sendHud(toOverlayEvent(r.text));
  return r.ok
    ? { ok: true, reply: pointed.text, points: pointed.points, degraded: r.degraded }
    : { ok: false, error: failure.text, hint: failure.hint, kind: failure.kind, degraded: r.degraded, blocked: r.blocked };
});

/**
 * P4-BG-AGENTS — long jobs run behind the LIVE bar, with status in the HUD.
 * Concurrency 1: these can drive the screen, and two agents sharing one mouse
 * is a fight, not parallelism.
 */
const bgJobs = createJobQueue({
  concurrency: 1,
  onChange: (job, sum) => {
    sendHudQuiet({ type: "bg", job, summary: sum, text: describeQueue(sum) });
  },
});

ipcMain.handle("hud:bgList", async () => ({
  ok: true,
  jobs: bgJobs.list(),
  summary: bgJobs.summary(),
  text: describeQueue(bgJobs.summary()),
}));

ipcMain.handle("hud:bgCancel", async (_e, payload) => bgJobs.cancel(payload && payload.id));

/**
 * WP-P2-MEMORY-IMPORT — the first real background job. A ChatGPT export can be
 * hundreds of megabytes; parsing it on the Ask path would freeze the HUD.
 */
ipcMain.handle("hud:importMemory", async (_e, payload) => {
  const source = String((payload && payload.source) || "").toLowerCase();
  const importers = {
    chatgpt: require("./netie/import/chatgpt"),
    claude: require("./netie/import/claude"),
    cursor: require("./netie/import/cursor"),
  };
  if (!importers[source]) return { ok: false, error: `unknown source ${source || "(none)"}` };

  let file = (payload && payload.file) || null;
  if (!file) {
    const picked = await dialog.showOpenDialog({
      title: `Import ${source} export`,
      properties: ["openFile"],
      filters: [{ name: "Export", extensions: ["json", "md", "txt"] }],
    });
    if (picked.canceled || !picked.filePaths.length) return { ok: false, error: "cancelled" };
    file = picked.filePaths[0];
  }

  const queued = bgJobs.add({
    id: `import-${source}-${path.basename(file)}`,
    title: `Import ${source}`,
    run: async (ctx) => {
      const raw = fs.readFileSync(file, "utf8");
      if (ctx.cancelled) return null;
      const result = importers[source].importExport(raw);
      const { summarize } = require("./netie/import/normalize");
      const sum = summarize(result);
      sendHud({
        type: "insight",
        text: sum.error
          ? `Import ${source} failed: ${sum.error}`
          : `Imported ${sum.conversations} conversation(s), ${sum.messages} message(s)${sum.skipped ? `, ${sum.skipped} skipped` : ""}.`,
      });
      await eco.audit("clicks.memory.import", sum);
      return sum;
    },
  });
  if (!queued.ok) return queued;
  void bgJobs.drain();
  return { ok: true, id: queued.id, file };
});

ipcMain.handle("hud:act", async (_e, payload) => {
  const rawMessage = (payload && payload.message) || "";
  const actAttachments = (payload && payload.attachments) || [];
  // Attached content is data, not commands (Hard rule 2). The fence tells the
  // planner so; `forcesApproval` is what makes it true — an intent carrying
  // attachments can never auto-run, so an imperative buried in a document still
  // has to get past a human reading the verb-and-destination prompt (#20/#23).
  const message = `${rawMessage}${buildAttachmentBlock(actAttachments)}`;
  const attachmentsForceApproval = forcesApproval(actAttachments);
  // Force the human beat for this whole handler when files are attached. Done
  // as a policy override rather than a flag on each plan, so a future branch
  // that builds a plan here inherits it instead of forgetting it.
  const actPolicy = attachmentsForceApproval
    ? { ...settings.safetyPolicy(), autoRunSensible: false, autoRunBenign: false }
    : settings.safetyPolicy();
  // HUD-03 — General/Transcribe/Meeting are listening modes. The renderer also
  // hides the button, but the main process is where "cannot act" has to be true:
  // a hotkey, a recipe or a stale renderer must not get past it either.
  if (!allowsActions(appMode)) {
    const label = getMode(appMode).label;
    sendHud({
      type: "answer",
      meta: `${label} mode`,
      text: `${label} mode doesn't act on the screen. Switch to Agent mode to run steps.`,
    });
    return { ok: false, reason: `mode:${appMode} does not act`, mode: appMode };
  }
  let dataUrl = (lastCapture && lastCapture.dataUrl) || null;
  if (!dataUrl) dataUrl = await ensureCaptureForPlan();
  showStage();
  pushTurn("user", message);
  sendStage({ type: "bubble", role: "user", text: message });

  // Coding ask without an explicit tool → stop and ask which app.
  if (needsAppFork(message)) {
    const fork = appForkPrompt(message);
    sendHud({
      type: "answer",
      meta: "Which app?",
      text: `${fork.question}\n• ${fork.options.map((o) => o.label).join("\n• ")}`,
    });
    sendHud({ type: "insight", text: "Say: use Cursor / use Claude Code / use Netie" });
    return { ok: true, needsChoice: true, fork };
  }

  // Cheap SOPs skip OpenVault LLM — not the Cortex security gate (A-0007).
  const recipe = expandRecipe(matchRecipe(message), recipeCoordContext());
  if (recipe && recipe.actions && recipe.actions.length) {
    const gate = await secureBeforeAct(message, "recipe");
    if (!gate.ok) {
      return { ok: false, blocked: true, reason: gate.text, recipe: recipe.id };
    }
    const vault = prepareVaultPlan(recipe.actions, message);
    if (!vault.ok) {
      return { ok: false, needsEnquire: true, fields: vault.fields, recipe: recipe.id };
    }
    const reviewed = reviewPlan(vault.actions, actPolicy);
    const plan = {
      ok: true,
      blocked: false,
      recipe: recipe.id,
      reason: `recipe:${recipe.id}`,
      actions: reviewed.actions,
      needsApproval: reviewed.needsApproval,
      autoOnly: reviewed.autoOnly,
    };
    pendingPlan = plan;
    sendHud({
      type: "answer",
      meta: plan.needsApproval ? "Waiting for nod / approve" : `Recipe · ${recipe.label}`,
      text: approvalPrompt(plan.actions || []).detail,
    });
    sendHud({ type: "insight", text: `Recipe ${recipe.id} (no LLM)` });
    const run = await maybeRunPlan(plan);
    const failed = (run.results || []).find((r) => r && r.ok === false && !r.noop && r.skipped !== "refused");
    return {
      ok: !failed,
      plan,
      run,
      recipe: recipe.id,
      actions: plan.actions,
      ran: run.ran,
      runMode: run.mode || "recipe",
      reason: failed ? (failed.message || failed.error || failed.reason) : undefined,
    };
  }

  // WP-P1-SKILLS-EXEC — a catalogued skill used to produce a toast and nothing
  // else, so a known SOP and an invented click sequence took the same path.
  // Now a hit either becomes the plan, or becomes a preamble the planner must
  // prefer. Soft-fail throughout: discovery being down never blocks Act.
  let preamble = "";
  try {
    const found = await eco.findSkills(message);
    const hits = (found && found.ok && found.hits) || [];
    if (hits.length) {
      const expanded = expandSkillsToActions(hits, {
        instruction: message,
        profile: settings.vaultProfile(),
        recipes: RECIPES,
      });
      sendHud({ type: "insight", text: describeExpansion(hits, expanded) });
      if (expanded.length) {
        const gate = await secureBeforeAct(message, "skills");
        if (!gate.ok) {
          return { ok: false, blocked: true, reason: gate.text, skill: hits[0].id || hits[0].name };
        }
        const reviewed = reviewPlan(
          resolveVaultTemplates(expanded, settings.vaultProfile()),
          actPolicy
        );
        const plan = {
          ok: true,
          blocked: false,
          skill: hits[0].id || hits[0].name || "catalog",
          reason: `skill:${hits[0].id || hits[0].name || "catalog"}`,
          actions: reviewed.actions,
          needsApproval: reviewed.needsApproval,
          custody: reviewed.custody,
          autoOnly: reviewed.autoOnly,
        };
        pendingPlan = plan;
        await eco.audit("clicks.skill.expand", {
          skill: plan.skill,
          count: plan.actions.length,
          needsApproval: plan.needsApproval,
        });
        sendHud({
          type: "answer",
          meta: plan.needsApproval ? "Waiting for nod / approve" : `Skill · ${plan.skill}`,
          text: approvalPrompt(plan.actions || []).detail,
        });
        const run = await maybeRunPlan(plan);
        return {
          ok: true,
          actions: plan.actions,
          needsApproval: plan.needsApproval,
          ran: run.ran,
          runMode: run.mode,
          skill: plan.skill,
        };
      }
      preamble = skillPreamble(hits);
    }
  } catch (err) {
    console.error("find-skills:", err.message || err);
  }

  const plan = await eco.planActions({
    instruction: message,
    dataUrl,
    hotContext: [preamble, plannerContext(message)].filter(Boolean).join("\n\n"),
    policy: actPolicy,
    profile: settings.vaultProfile(),
  });
  pendingPlan = plan;
  if (plan.ok) {
    try {
      const osr = await eco.classifyOsr(message);
      if (osr && osr.band) {
        plan.osr = osr;
        const tip = (osr.assumptions && osr.assumptions[0]) || `band=${osr.band}`;
        sendHud({ type: "insight", text: `OSR ${osr.band}: ${tip}` });
      }
    } catch (err) {
      console.error("osr classify:", err.message || err);
    }
    // A fallback from the governed planner to OpenVault is not a detail — say
    // which brain planned this (R-0011).
    if (plan.plannerFallback) {
      sendHud({
        type: "insight",
        text: `Cortex computer-use unavailable (${plan.plannerFallback}) — planned by OpenVault instead.`,
      });
    }
    if (plan.model || plan.planner) {
      const via = plan.plannerFallback
        ? `fallback · ${plan.model || "openvault"}`
        : `${plan.planner || "planner"} · ${plan.model || "default"}`;
      sendHud({ type: "insight", text: `Planned via ${via}` });
    }
    sendHud({
      type: "answer",
      meta: plan.needsApproval ? "Waiting for nod / approve" : "Auto-running",
      text: approvalPrompt(plan.actions || []).detail,
    });

    let active = plan;
    let run = await maybeRunPlan(active);
    // WP-P3-REPLAN-LOOP — a step failing used to end the task. Observe what
    // broke, re-read the screen, and plan only the remainder. Hard-bounded, and
    // shouldReplan refuses outright after an abort or a gate block.
    let observation = observeResults(run.results);
    let prior = null;
    let replanN = 0;
    while (
      run.ran &&
      shouldReplan({
        failCount: observation.failCount,
        replanN,
        maxReplans: MAX_REPLANS,
        // `abortPlan` is the authoritative kill switch; `observation.aborted`
        // only sees it if the abort happened to land mid-list. A press that
        // stopped the run after the last step leaves no "aborted" result at
        // all, and the loop would restart the agent after the human said stop.
        aborted: abortPlan || observation.aborted,
      })
    ) {
      replanN += 1;
      prior = nextPrior(prior, observation);
      sendHud({ type: "insight", text: describeReplan(observation, replanN, MAX_REPLANS) });
      await eco.audit("clicks.cu.replan", {
        n: replanN,
        failed: observation.failCount,
        completed: observation.completed,
      });
      const fresh = await ensureCaptureForPlan();
      const next = await eco.planActions({
        instruction: replanInstruction(message, observation),
        dataUrl: fresh || dataUrl,
        hotContext: [preamble, plannerContext(message)].filter(Boolean).join("\n\n"),
        policy: actPolicy,
        profile: settings.vaultProfile(),
        prior,
      });
      if (!next.ok || !next.actions.length) {
        // Say WHY. "Replan produced nothing" reads as "the model had no ideas"
        // when the actual answer is usually "Cortex went down" or "the gate
        // refused" — two things the user can act on (R-0011).
        const why = next.blocked
          ? next.reason || "the security gate refused"
          : next.reason || "no further steps";
        sendHud({ type: "insight", text: `Replan stopped — ${why}` });
        break;
      }
      if (next.plannerFallback) {
        sendHud({
          type: "insight",
          text: `Replan ${replanN} planned by OpenVault — Cortex computer-use unavailable (${next.plannerFallback}).`,
        });
      }
      active = next;
      pendingPlan = next;
      run = await maybeRunPlan(next);
      observation = observeResults(run.results);
    }

    return {
      ok: true,
      actions: active.actions,
      needsApproval: active.needsApproval,
      ran: run.ran,
      runMode: run.mode,
      osr: plan.osr || null,
      planner: active.planner || plan.planner || null,
      replans: replanN,
    };
  }
  sendHud({ type: "answer", meta: "Blocked", text: plan.reason || "Blocked" });
  return { ok: false, reason: plan.reason || "Blocked", error: plan.reason };
});

ipcMain.handle("hud:clickyHold", async (_e, payload) => {
  if (!features.isEnabled("clicky")) {
    return { ok: false, state: clickyState, reason: "clicky-disabled" };
  }
  const phase = String((payload && payload.phase) || "");
  if (phase === "start") {
    clickyHoldStartedAt = Date.now();
    setClicky(ClickyEvents.HOLD_START);
    return { ok: true, state: clickyState, holdMs: CLICKY_HOLD_MS };
  }
  if (phase === "cancel") {
    clickyHoldStartedAt = 0;
    setClicky(ClickyEvents.HOLD_CANCEL);
    return { ok: true, state: clickyState };
  }
  if (phase === "end") {
    const heldMs = Math.max(0, Date.now() - (clickyHoldStartedAt || Date.now()));
    clickyHoldStartedAt = 0;
    setClicky(ClickyEvents.HOLD_COMMIT, { heldMs });
    if (clickyState === ClickyStates.CLICKY) {
      // Stay invisible — Clicky does not force the HUD open.
      sendHudQuiet({ type: "open-ask", clicky: true });
      sendHudQuiet({
        type: "insight",
        text: "Clicky on — cursor is Netie. Speak or type what to do; last minute is in memory.",
      });
      sendStage({ type: "subtitle", text: "Clicky on", ms: 1800 });
    }
    return { ok: true, state: clickyState, heldMs };
  }
  return { ok: false, state: clickyState, reason: "bad-phase" };
});

ipcMain.handle("hud:clickyExit", async () => {
  setClicky(ClickyEvents.EXIT);
  return { ok: true, state: clickyState };
});

ipcMain.handle("hud:clickyStatus", async () => {
  const desc = clickyDescribe(clickyState);
  return {
    ok: true,
    state: clickyState,
    label: desc.label,
    hint: desc.recordingHint,
    frames: recall.snapshot().length,
    sealPixels: recall.sealPixels,
  };
});

/**
 * The HUD's own Show/Hide collapses its chrome but leaves the window up for
 * click-through, so it cannot hide the stage — a different window — by itself.
 */
ipcMain.handle("hud:hideStage", async () => {
  hideStage();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
  return { ok: true };
});

ipcMain.handle("hud:hide", async () => {
  if (clickyState === ClickyStates.CLICKY) {
    setClicky(ClickyEvents.EXIT);
  }
  hideHud();
  return { ok: true };
});

ipcMain.handle("hud:openPanel", async () => {
  // Legacy channel — panel retired. Never force-pop; nod works via Ctrl+Y.
  sendHudQuiet({ type: "nod-wait", on: true });
  sendStage({ type: "subtitle", text: "Nod / Affirm / Ctrl+Y", ms: 3500 });
  return { ok: true, surface: "hud" };
});

ipcMain.handle("hud:frameRegion", async () => {
  // Optional region refine while HUD is up.
  openOverlay();
  return { ok: true };
});

ipcMain.handle("hud:toggleListen", async (_e, payload) => {
  listenMic = Boolean(payload && payload.on);
  if (listenMic) ensureSttSidecar();
  if (!listenMic) flushSource("mic");
  const d = transcriber.describe();
  return {
    ok: true,
    engine: d.engine,
    message: listenMic ? `Mic on — ${d.label}` : "Mic paused",
  };
});

ipcMain.handle("hud:toggleSystemAudio", async (_e, payload) => {
  listenSystem = Boolean(payload && payload.on);
  if (listenSystem) ensureSttSidecar();
  if (!listenSystem) {
    flushSource("system");
    return { ok: true, message: "System audio off" };
  }
  // Capture itself is native Electron loopback; only the engine can be missing.
  const d = transcriber.describe();
  return { ok: true, engine: d.engine, message: `System audio on — ${d.label}` };
});

/** Renderer hands us 20 ms mono frames; gating + transcription live here. */
ipcMain.on("hud:audioFrame", (_e, payload) => {
  if (!payload) return;
  const source = payload.source === "system" ? "system" : "mic";
  // Arm-to-listen. The gate is a module so a test can hold the privacy claim
  // rather than trusting a comment — and so the next audio source has one place
  // to pass through. Nothing is transcribed until a human armed it.
  if (!shouldAcceptFrame({ source, listenMic, listenSystem, paused: hudPaused }).accept) return;
  const samples = payload.samples instanceof Float32Array
    ? payload.samples
    : new Float32Array(payload.samples || []);
  if (!samples.length) return;
  handleUtterance(source, segmenterFor(source).push(samples));
});

ipcMain.handle("hud:sttStatus", async (_e, payload) => {
  await transcriber.probe(Boolean(payload && payload.force));
  return transcriber.describe();
});

ipcMain.handle("hud:captureFailed", async (_e, payload) => {
  const src = (payload && payload.source) || "mic";
  if (src === "mic") listenMic = false;
  else listenSystem = false;
  return { ok: true };
});

/**
 * Act on a spoken capture command.
 *
 * "stop" closes the markdown transcript and tells the user where it landed —
 * a recording that ends with no file path is a recording you have to go hunting
 * for. "continue" re-arms whatever was armed before, so it resumes the session
 * rather than starting a new file.
 */
function applyCaptureCommand(command, heard = "") {
  if (command === "pause") {
    hudPaused = true;
    sendHud({ type: "capture", state: "paused" });
    sendHud({ type: "answer", meta: "Paused", text: `Paused. Say "continue" to carry on.` });
    return { ok: true, state: "paused" };
  }

  if (command === "continue") {
    hudPaused = false;
    // Nothing was armed — "continue" must not become a way to switch the mic on
    // by talking near the machine.
    if (!listenMic && !listenSystem) {
      sendHud({ type: "answer", meta: "Not recording", text: "Nothing was armed — press Record first." });
      return { ok: false, state: "disarmed" };
    }
    sendHud({ type: "capture", state: "recording" });
    sendHud({ type: "auto-listen", mic: listenMic, system: listenSystem, paused: false });
    sendHud({ type: "answer", meta: "Recording", text: "Continuing." });
    return { ok: true, state: "recording" };
  }

  if (command === "stop") {
    listenMic = false;
    listenSystem = false;
    hudPaused = false;
    flushSource("mic");
    flushSource("system");
    const saved = notes.stop();
    sendHud({ type: "capture", state: "stopped", notesPath: saved && saved.path });
    if (saved && saved.path) {
      sendHud({
        type: "answer",
        meta: `Saved · ${saved.lines} line(s)`,
        text: `Transcript saved to ${saved.path}`,
      });
      sendHud({ type: "insight", text: `Transcript: ${saved.path}` });
      void eco.audit("clicks.transcript.saved", { lines: saved.lines, heard: heard.slice(0, 40) });
    } else {
      sendHud({ type: "answer", meta: "Stopped", text: "Recording stopped — nothing to save." });
    }
    return { ok: true, state: "stopped", path: saved && saved.path };
  }

  return { ok: false, state: "unknown" };
}

function segmenterFor(source) {
  if (!segmenters.has(source)) segmenters.set(source, new Segmenter());
  return segmenters.get(source);
}

/** Close an open utterance when a source stops, so the last words aren't lost. */
function flushSource(source) {
  const seg = segmenters.get(source);
  if (seg) handleUtterance(source, seg.end());
}

function handleUtterance(source, utt) {
  if (!utt) return;
  // Bound concurrency: a slow CPU engine must not build an unbounded backlog.
  if (sttBusy >= 2) return;
  sttBusy += 1;
  sendHud({ type: "stt-busy", busy: true, source });
  transcriber
    .transcribe(utt.pcm)
    .then((res) => {
      if (res.ok && res.text) {
        if (nodGate.pending && isAffirmation(res.text)) {
          nodGate.signal(res.text);
        }
        // "continue" / "pause" / "stop" — spoken, whole-utterance only.
        const capCmd = detectCaptureCommand(res.text);
        if (capCmd) {
          applyCaptureCommand(capCmd, res.text);
          sendHud({
            type: "transcript",
            text: res.text,
            source,
            engine: res.engine,
            mode: appMode,
            modeSwitchOnly: true, // a command, not something to send to the model
          });
          return;
        }

        const switched = detectModeSwitch(res.text);
        if (switched) {
          applyAppMode(switched, { reason: res.text.slice(0, 80) });
          // Mode phrases are commands — never dump them into the chat composer.
          sendHud({
            type: "transcript",
            text: res.text,
            source,
            engine: res.engine,
            mode: appMode,
            modeSwitchOnly: true,
          });
          sendHud({
            type: "answer",
            meta: `${getMode(appMode).label} mode`,
            text: `Switched to ${getMode(appMode).label}. (Heard: “${res.text.slice(0, 80)}”)`,
          });
        } else {
          // System audio is always written to the markdown transcript, whatever
          // the mode: if you armed loopback you are recording something you want
          // to keep. Mic still follows the mode's autoNotes setting.
          if (getMode(appMode).autoNotes || source === "system") {
            notes.append({
              text: res.text,
              source,
              langHint: res.language || "",
            });
          }
          sendHud({
            type: "transcript",
            text: res.text,
            source,
            engine: res.engine,
            rough: Boolean(res.rough),
            confidence: res.confidence,
            language: res.language,
            mode: appMode,
            modeSwitchOnly: false,
          });
          pushTurn(source === "system" ? "heard" : "user", res.text);
          void hot.pushTick({ t: Date.now(), heard: res.text.slice(0, 160), src: source });
        }
      } else if (!res.ok) {
        sendHud({
          type: "stt-error",
          source,
          error: res.error || "transcription failed",
          hint: transcriber.describe().hint || "",
        });
      }
    })
    .catch(() => {})
    .finally(() => {
      sttBusy -= 1;
      sendHud({ type: "stt-busy", busy: sttBusy > 0, source });
    });
}

/**
 * P5-ENQUIRE — the human answered the panel.
 *
 * Writes only what `validateAnswers` accepted (known profile fields, secrets
 * refused, keystroke-unsafe characters stripped), then resumes the plan that was
 * parked waiting for them. The resume goes back through `secureBeforeAct` and
 * `maybeRunPlan`: answering a form is not an approval, and a resumed plan is not
 * a plan that already passed the gate.
 */
ipcMain.handle("hud:enquireSave", async (_e, payload) => {
  const { profile, accepted, rejected } = validateAnswers(payload && payload.answers);
  if (accepted.length) {
    settings.set({ profile: { ...(settings.get("profile") || {}), ...profile } });
  }
  // Keys only — the ledger must never carry the values the user just typed.
  await eco.audit("clicks.enquire.saved", {
    accepted,
    rejected: rejected.map((r) => r.key),
  });
  sendHud({ type: "answer", meta: "Profile", text: describeResult({ accepted, rejected }) });

  const parked = pendingEnquire;
  pendingEnquire = null;
  if (!parked || !accepted.length) {
    return { ok: true, saved: accepted, rejected, resumed: false };
  }

  const gate = await secureBeforeAct(parked.message, "enquire-resume");
  if (!gate.ok) return { ok: false, saved: accepted, rejected, resumed: false, blocked: true };

  const vault = prepareVaultPlan(parked.actions, parked.message);
  if (!vault.ok) {
    return { ok: true, saved: accepted, rejected, resumed: false, stillMissing: vault.fields };
  }
  const reviewed = reviewPlan(vault.actions, settings.safetyPolicy());
  const plan = {
    ok: true,
    blocked: false,
    actions: reviewed.actions,
    needsApproval: reviewed.needsApproval,
    custody: reviewed.custody,
    autoOnly: reviewed.autoOnly,
  };
  pendingPlan = plan;
  const run = await maybeRunPlan(plan);
  return { ok: true, saved: accepted, rejected, resumed: true, ran: run.ran, runMode: run.mode };
});

/** Drop the parked plan — answering nothing must not leave it armed forever. */
ipcMain.handle("hud:enquireCancel", async () => {
  pendingEnquire = null;
  return { ok: true };
});

ipcMain.handle("hud:setPaused", async (_e, payload) => {
  hudPaused = Boolean(payload && payload.paused);
  return { ok: true, paused: hudPaused };
});

ipcMain.handle("hud:setIgnoreMouse", async (_e, payload) => {
  setHudClickThrough(payload && payload.ignore !== false);
  return { ok: true };
});

ipcMain.handle("hud:setMode", async (_e, payload) => {
  const mode = (payload && payload.mode) || "agent";
  return applyAppMode(mode, { reason: (payload && payload.reason) || "ui" });
});

ipcMain.handle("hud:getSettings", async () => ({ ok: true, settings: settings.snapshot() }));

ipcMain.handle("hud:setSettings", async (_e, payload) => {
  const next = settings.set((payload && payload.settings) || payload || {});
  agentPointer.enabled = next.cursorBubble !== false;
  demoDebug.setEnabled(next.demoDebug === true);
  // Content protection keeps Netie out of screen shares AND out of screenshots,
  // which also makes it invisible to any tool driving the app. Toggling it is a
  // testing affordance, applied live so a demo does not need a restart.
  applyContentProtection(captureVisible());
  if (next.followCursor === false) stopCursorTracking();
  else startCursorTracking();
  if (!agentPointer.enabled) {
    try {
      await agentPointer.restore();
    } catch {
      /* ok */
    }
  }
  return { ok: true, settings: next };
});

ipcMain.handle("hud:openDemoDebug", async () => {
  const folder = demoDebug.openFolder();
  await shell.openPath(folder);
  return { ok: true, folder };
});

/**
 * On-demand screenshot for demos. The DemoDebugTrail only wrote frames during
 * an act run, so there was no way to just capture the screen — which is why
 * "demo screenshots" looked broken. Saves the full screen and returns the path.
 */
ipcMain.handle("hud:demoShot", async () => {
  try {
    const cap = await captureDisplayCrop(null);
    const dir = path.join(os.homedir(), "AppData", "Roaming", "NetieClicks", "demo-debug", "shots");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(dir, `shot-${stamp}.png`);
    fs.copyFileSync(cap.path, file);
    return { ok: true, file, dir };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("hud:openCanvas", async () => {
  createCanvas();
  return { ok: true };
});

ipcMain.handle("hud:retrieveList", async (_e, payload) => {
  const bucket = String((payload && payload.bucket) || "chat");
  if (bucket === "chat") {
    return {
      ok: true,
      bucket,
      items: chats.list(40).map((it) => ({ id: it.id, title: it.title, saved_at: it.saved_at })),
    };
  }
  if (bucket === "notes") {
    notes.ensure();
    const items = fs
      .readdirSync(notes.root)
      .filter((name) => name.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, 40)
      .map((name) => ({ id: name.replace(/\.md$/, ""), title: name, saved_at: "" }));
    return { ok: true, bucket, items };
  }
  if (bucket === "assets") {
    const items = recall
      .snapshot()
      .slice(-24)
      .reverse()
      .map((frame, idx) => ({
        id: `frame-${idx}-${frame.t}`,
        title: `${new Date(frame.t).toLocaleTimeString()} · ${frame.fgProc || "app"}`,
        saved_at: new Date(frame.t).toISOString(),
        detail: `${frame.width || "?"}x${frame.height || "?"} · cursor(${frame.cx || "?"},${frame.cy || "?"})`,
      }));
    return { ok: true, bucket, items };
  }
  if (bucket === "memory") {
    const summary = hot.summaryText(20).split("\n").filter(Boolean);
    let brainLines = [];
    try {
      brainLines = String(brain.contextForLlm() || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12);
    } catch {
      /* ok */
    }
    const items = [
      ...summary.map((row, i) => ({ id: `hot-${i}`, title: row, kind: "hot" })),
      ...brainLines.map((row, i) => ({ id: `brain-${i}`, title: row, kind: "brain" })),
    ];
    return { ok: true, bucket, items };
  }
  if (bucket === "source") {
    const roots = [
      { id: "conversations", title: "Conversations folder", path: chats.root, kind: "folder" },
      { id: "notes", title: "Notes folder", path: notes.root, kind: "folder" },
    ];
    try {
      const dataDir = brain.vault ? brain.vault.dataDir : path.join(os.homedir(), "AppData", "Roaming", "NetieClicks");
      roots.push({ id: "netie-data", title: "NetieClicks data root", path: dataDir, kind: "folder" });
      const recallDir = path.join(dataDir, "recall");
      if (fs.existsSync(recallDir)) {
        roots.push({ id: "recall", title: "Recall / assets folder", path: recallDir, kind: "folder" });
      }
    } catch {
      /* ok */
    }
    return { ok: true, bucket, items: roots };
  }
  if (bucket === "fleet") {
    let status = {};
    try {
      status = brain.status() || {};
    } catch {
      status = {};
    }
    const items = [
      {
        id: "cortex-status",
        title: `Cortex ${eco.cortexOnline ? "online" : "offline"} · ${process.env.NETIE_CORTEX_URL || "http://127.0.0.1:8010"}`,
        kind: "status",
      },
      {
        id: "fleet-sync",
        title: status.fleetOn ? "Fleet sync on — tap Open to sync now" : "Fleet sync off — enable in consent / settings",
        kind: "sync",
      },
      {
        id: "dual-brain",
        title: "Dual Brain — on-device memory + fleet telemetry",
        kind: "info",
      },
    ];
    return { ok: true, bucket, items, cortexOnline: Boolean(eco.cortexOnline), brain: status };
  }
  return { ok: true, bucket, items: [] };
});

ipcMain.handle("hud:retrieveRead", async (_e, payload) => {
  const bucket = String((payload && payload.bucket) || "chat");
  const id = String((payload && payload.id) || "");
  if (bucket === "chat") {
    const rec = chats.read(id);
    if (!rec) return { ok: false, error: "not found" };
    return {
      ok: true,
      bucket,
      markdown: rec.markdown || "",
      title: rec.meta && rec.meta.title,
      path: rec.path || null,
      openPath: rec.path || null,
    };
  }
  if (bucket === "notes") {
    const file = path.join(notes.root, id.endsWith(".md") ? id : `${id}.md`);
    if (!fs.existsSync(file)) return { ok: false, error: "not found" };
    return {
      ok: true,
      bucket,
      markdown: fs.readFileSync(file, "utf8"),
      title: path.basename(file),
      path: file,
      openPath: file,
    };
  }
  if (bucket === "source") {
    const map = {
      conversations: chats.root,
      notes: notes.root,
    };
    let openPath = map[id] || null;
    if (!openPath && id === "netie-data") {
      openPath = brain.vault ? brain.vault.dataDir : path.join(os.homedir(), "AppData", "Roaming", "NetieClicks");
    }
    if (!openPath && id === "recall") {
      const dataDir = brain.vault ? brain.vault.dataDir : path.join(os.homedir(), "AppData", "Roaming", "NetieClicks");
      openPath = path.join(dataDir, "recall");
    }
    return {
      ok: true,
      bucket,
      markdown: openPath
        ? `Original source folder:\n${openPath}\n\nOpen in Explorer to browse files.`
        : "Unknown source root.",
      path: openPath,
      openPath,
    };
  }
  if (bucket === "fleet") {
    let status = {};
    try {
      status = brain.status() || {};
    } catch {
      status = {};
    }
    return {
      ok: true,
      bucket,
      markdown: [
        `Cortex: ${eco.cortexOnline ? "online" : "offline"}`,
        `URL: ${process.env.NETIE_CORTEX_URL || "http://127.0.0.1:8010"}`,
        `Fleet: ${status.fleetOn ? "on" : "off"}`,
        "",
        "Do with Cortex sends the selected retrieve text through the Cortex-gated planner.",
        "Open runs a fleet sync (or opens Cortex URL).",
      ].join("\n"),
      openPath: null,
      fleetAction: id,
    };
  }
  if (bucket === "memory") {
    const title = String((payload && payload.title) || id);
    return {
      ok: true,
      bucket,
      markdown: title,
      openPath: null,
    };
  }
  if (bucket === "assets") {
    const title = String((payload && payload.title) || id);
    const detail = String((payload && payload.detail) || "");
    return {
      ok: true,
      bucket,
      markdown: [title, detail].filter(Boolean).join("\n"),
      openPath: null,
    };
  }
  return {
    ok: true,
    bucket,
    markdown: "Preview unavailable for this bucket.",
  };
});

/**
 * The folders Pointer may hand to the shell (#19).
 *
 * Derived from the legitimate callers, not invented: the started notes folder
 * (`:408`), the chats root (`:2359`), the demo-debug folder (`:3094`), and the
 * retrieve flow's source roots (`:3179-3184`) — conversations, notes, the
 * NetieClicks data dir and the recall dir under it — plus the Word coworker's
 * output dir, which is where the "Open" button on a finished .docx points.
 *
 * Recomputed per call because `notes.root` and the vault data dir are resolved
 * lazily and a cached list would go stale after a mode switch.
 */
function sanctionedOpenRoots() {
  const roots = [];
  const push = (p) => {
    if (p && typeof p === "string") roots.push(p);
  };
  try { push(chats.root); } catch { /* store not ready */ }
  try { push(notes.root); } catch { /* store not ready */ }
  try { push(demoDebug.root); } catch { /* store not ready */ }
  try { push(wordCoworker.sanctionedRoot()); } catch { /* ok */ }
  try {
    // The recall dir lives under this, so the parent covers both.
    push(brain.vault ? brain.vault.dataDir : path.join(os.homedir(), "AppData", "Roaming", "NetieClicks"));
  } catch {
    push(path.join(os.homedir(), "AppData", "Roaming", "NetieClicks"));
  }
  return roots;
}

/**
 * `shell.openPath` is not a viewer — for `.exe/.bat/.cmd/.ps1/.lnk/.msi` it
 * launches the target. The renderer's `path` originates outside the trust
 * boundary (screen-derived and model-derived values reach it through the
 * retrieve payloads), so an unchecked channel here is an execution primitive,
 * which CLAUDE.md Hard rule 2 forbids: screen text is data, not commands.
 *
 * Directories under a sanctioned root open in Explorer; files need to be both
 * contained and on the viewable-extension allowlist. Everything else is refused
 * with a reason that names the path (#19).
 */
ipcMain.handle("hud:openPath", async (_e, payload) => {
  const requested = payload && payload.path;
  const verdict = safePath.classifyOpen(requested, sanctionedOpenRoots());
  if (!verdict.ok) {
    // Visible refusal, not a console line — a silent no-op reads as "the button
    // is broken" and hides the fact that a control fired (KB R-0011).
    sendHud({ type: "answer", meta: "Refused", text: verdict.reason });
    return { ok: false, error: verdict.reason, path: requested || "" };
  }
  try {
    await shell.openPath(verdict.path);
    return { ok: true, path: verdict.path, display: verdict.display };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("hud:retrieveOpen", async (_e, payload) => {
  const bucket = String((payload && payload.bucket) || "");
  const openPath = payload && payload.path;
  if (bucket === "fleet") {
    try {
      const sync = await brain.syncFleet("retrieve-roulette");
      const url = process.env.NETIE_CORTEX_URL || "http://127.0.0.1:8010";
      try {
        await shell.openExternal(url);
      } catch {
        /* ok */
      }
      return { ok: true, synced: sync, opened: url };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }
  if (openPath && fs.existsSync(openPath)) {
    try {
      if (fs.statSync(openPath).isDirectory()) {
        await shell.openPath(openPath);
      } else {
        shell.showItemInFolder(openPath);
      }
      return { ok: true, path: openPath };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }
  if (bucket === "notes") {
    notes.ensure();
    await shell.openPath(notes.root);
    return { ok: true, path: notes.root };
  }
  chats.ensure();
  await shell.openPath(chats.root);
  return { ok: true, path: chats.root };
});

ipcMain.handle("hud:openInSpace", async (_e, payload) => {
  try {
    return await openInNetieSpace(payload && payload.file);
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("hud:affirm", async () => {
  if (nodGate.pending) {
    nodGate.hotkey("ui");
    return { ok: true };
  }
  return { ok: false, reason: "not waiting" };
});

ipcMain.handle("canvas:ready", async () => ({ ok: true, airgptId: AIRGPT_DAY }));

ipcMain.handle("canvas:list", async (_e, payload) => {
  const filter = (payload && payload.filter) || "today";
  if (filter === "notes") {
    notes.ensure();
    const dir = notes.root;
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, 60)
      .map((f) => ({
        id: f.replace(/\.md$/, ""),
        title: f,
        saved_at: "",
        airgpt_id: AIRGPT_DAY,
        kind: "notes",
        source: "notes",
        file: f,
      }));
    return { ok: true, items: files };
  }
  const items = chats.list(60, { today: filter === "today" }).map((it) => ({
    ...it,
    source: "conversations",
  }));
  return { ok: true, items };
});

ipcMain.handle("canvas:read", async (_e, payload) => {
  const id = payload && payload.id;
  const source = (payload && payload.source) || "conversations";
  if (source === "notes") {
    const file = path.join(notes.root, String(id).endsWith(".md") ? id : `${id}.md`);
    if (!fs.existsSync(file)) return { ok: false, error: "not found" };
    return { ok: true, markdown: fs.readFileSync(file, "utf8"), path: file };
  }
  const rec = chats.read(id);
  if (!rec) return { ok: false, error: "not found" };
  return { ok: true, ...rec };
});

ipcMain.handle("canvas:openFolder", async (_e, payload) => {
  const filter = payload && payload.filter;
  if (filter === "notes") {
    notes.ensure();
    await shell.openPath(notes.root);
    return { ok: true, folder: notes.root };
  }
  return chats.reveal();
});

/**
 * Windows system-audio capture. Electron answers getDisplayMedia itself with
 * `audio: 'loopback'` — real WASAPI loopback of what the speakers play, so no
 * Hearsay/RealtimeSTT sidecar is needed for the capture half.
 */
function setupMediaCapture() {
  const ses = session.defaultSession;
  if (typeof ses.setDisplayMediaRequestHandler === "function") {
    ses.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({ types: ["screen"] });
          callback({ video: sources[0], audio: "loopback" });
        } catch {
          callback({});
        }
      },
      { useSystemPicker: false }
    );
  }
  // Only our own windows may take mic/loopback; anything else is denied.
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    const ours = [hudWindow, panelWindow].some(
      (w) => w && !w.isDestroyed() && w.webContents.id === wc.id
    );
    callback(ours && (permission === "media" || permission === "audioCapture"));
  });
}

app.whenReady().then(() => {
  ensureTemp();
  setupCsp();
  chats.ensure();
  notes.ensure();
  createTray();
  // Preload HUD shell hidden. Mic/STT/recall stay lazy until used.
  createHud();
  setupMediaCapture();
  registerHotkey();
  console.log(
    "Netie Pointer ready - tray-first. Ctrl+` toggles session. Ctrl+Shift+Space arms Clicky (real OS pointer)."
  );
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopTicks();
  stopRecallDaemon();
  agentPointer.restore().catch(() => {});
  try {
    recall.stopFlush();
  } catch {
    /* ok */
  }
  try {
    agentPointer.restore();
  } catch {
    /* ok */
  }
  driver.dispose();
  transcriber.dispose();
  if (notes.file) notes.stop();
  try {
    if (sttChild && !sttChild.killed) sttChild.kill();
  } catch {
    /* ok */
  }
  try {
    brain.stopAutoSync();
    brain.syncFleet("quit").catch(() => {});
  } catch {
    /* ok */
  }
});

app.on("second-instance", () => {
  // User re-launched — intentional reveal.
  showHud({ expandChat: false });
});

app.on("window-all-closed", (e) => {
  // Tray app — never quit just because HUD/stage windows are hidden/closed.
  e.preventDefault();
});

app.on("before-quit", () => {
  console.log("Netie Pointer quitting...");
});

process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err && err.stack ? err.stack : err);
});
