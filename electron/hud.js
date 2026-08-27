const $ = (id) => document.getElementById(id);
const hudRoot = $("hud");
const askInput = $("ask-input");
const liveTranscript = $("live-transcript");
const subtitleText = $("subtitle-text");
const messages = $("messages");
const chatStream = $("chat-stream");
const insightSummary = $("insight-summary");
const answerBody = $("answer-body");
const answerMeta = $("answer-meta");
const wave = $("wave");
const timerEl = $("timer");
const btnListen = $("btn-listen");
const btnSystem = $("btn-system");
const btnPause = $("btn-pause");
const recLabel = $("rec-label");
const notesChip = $("notes-chip");
const settingsMenu = $("settings-menu");
const nodToast = $("nod-toast");
const roulettePanel = $("roulette-panel");
const rouletteItems = $("roulette-items");
const roulettePreview = $("roulette-preview");
const rouletteLabel = $("roulette-label");
const chatDock = $("chat-dock");
const subtitleBar = $("subtitle-bar");
const autosendChip = $("autosend");
const autosendCount = $("autosend-count");
const cleanToast = $("clean-toast");
const cleanToastText = $("clean-toast-text");
const clickyOrb = null; // floating Clicky hold removed — Ctrl+Shift+Space arms real OS pointer
const peekDrop = null;
const settingInputs = [$("set-auto"), $("set-nod"), $("set-cursor"), $("set-md"), $("set-py"), $("set-demo-debug"), $("set-verify")];

let listening = false;
let systemAudio = false;
let paused = false;
let elapsedMs = 0;
let lastTickAt = Date.now();
let finalBits = [];
let appMode = "agent";
let waveBars = [];
let latestSystemSubtitle = "";
let lastWavePaintAt = 0;
let activeBucket = "chat";
let latestRetrieveText = "";
let mouseOverChrome = false;
/** @type {{start:number, end:number, raw:string, cleaned:string}|null} */
let pendingClean = null;
let clickyHoldTimer = null;
let agentBusy = false;
let peekTimer = null;

// HUD-01..06 — the logic lives in netie/hud-live.js so the acceptance lane can
// run the real thing; this file is DOM plumbing on top of it.
const {
  createDragController,
  createAutoSend,
  createLiveLine,
  createLiveTranscript,
  createInsightFeed,
  createHoldToTalk,
  shouldRearmAfterAct,
  AUTO_SEND_MS,
} = window.NetieHudLive;

const drag = createDragController();
const liveLine = createLiveLine();
const liveFeed = createLiveTranscript({ maxLines: 5 });

const AGENT_SUGGESTS = [
  { q: "Summarize what I am looking at", ico: "✦", label: "Summarize screen" },
  { q: "What should I click next?", ico: "›", label: "What next?" },
  { q: "Suggest follow-up questions", ico: "?", label: "Suggest follow-ups" },
  { confirm: "Type this into Notes?", ico: "N", label: "Type in Notes?" },
];
const MEETING_SUGGESTS = [
  { q: "Recap this meeting", ico: "✦", label: "Recap" },
  { q: "What should I say?", ico: "›", label: "Assist" },
  { q: "List next steps", ico: "?", label: "Next steps" },
];

function paintSuggestItems(items) {
  const root = $("insight-actions");
  if (!root || !Array.isArray(items) || !items.length) return;
  root.replaceChildren();
  for (const row of items.slice(0, 6)) {
    const btn = document.createElement("button");
    btn.type = "button";
    if (row.confirm) btn.dataset.confirm = String(row.confirm).slice(0, 160);
    else btn.dataset.q = String(row.q || "").slice(0, 160);
    const ico = document.createElement("span");
    ico.className = "q-ico";
    ico.textContent = String(row.ico || "?").slice(0, 2);
    btn.appendChild(ico);
    btn.appendChild(document.createTextNode(" " + String(row.label || row.q || "").slice(0, 48)));
    root.appendChild(btn);
  }
}

function paintSuggests(mode) {
  const rows = mode === "meeting" || mode === "transcribe" ? MEETING_SUGGESTS : AGENT_SUGGESTS;
  paintSuggestItems(rows);
}

let lastCueText = "";
let lastCueKind = "say";
function cueCopyLabel(kind) {
  if (kind === "point") return "Copy next";
  if (kind === "warn") return "Copy review";
  return "Copy say-this";
}
function cueDisplay(kind, cue) {
  if (!cue) return "";
  if (kind === "point") return `Next: ${cue}`;
  if (kind === "warn") return `Review: ${cue}`;
  return `Say this: ${cue}`;
}
function paintLiveBrief(event) {
  const brief = $("coworker-brief");
  const meta = $("coworker-brief-meta");
  const cueEl = $("meeting-cue");
  const askedEl = $("meeting-asked");
  const copyBtn = $("btn-copy-cue");
  const cueRow = $("cue-row");
  const teachBack = $("btn-teach-back");
  const teachNext = $("btn-teach-next");
  if (!brief) return;
  const text = String((event && event.text) || "").slice(0, 4000);
  const cue = String((event && event.cue) || "").trim().slice(0, 240);
  const rawKind = String((event && event.cueKind) || "").toLowerCase();
  const kind = rawKind === "point" || rawKind === "warn" ? rawKind : "say";
  lastCueText = cue;
  lastCueKind = kind;
  if (!text || (event && event.act)) {
    brief.hidden = true;
    if (meta) meta.hidden = true;
    if (cueEl) {
      cueEl.hidden = true;
      cueEl.textContent = "";
    }
    if (askedEl) {
      askedEl.hidden = true;
      askedEl.textContent = "";
    }
    if (cueRow) cueRow.hidden = true;
    if (copyBtn) copyBtn.hidden = true;
    if (teachBack) teachBack.hidden = true;
    if (teachNext) teachNext.hidden = true;
    lastCueText = "";
    lastCueKind = "say";
    return;
  }
  brief.hidden = false;
  brief.textContent = text;
  if (meta) {
    meta.hidden = false;
    meta.textContent = `${(event && event.desk) || "meeting"} coworker · live · never acts`;
  }
  const asked = String((event && event.asked) || "").trim().slice(0, 160);
  const rest = String((event && event.rest) || "").trim().slice(0, 160);
  if (askedEl) {
    if (kind === "point" && rest) {
      askedEl.hidden = false;
      askedEl.textContent = `Then: ${rest}`;
    } else if (asked) {
      askedEl.hidden = false;
      askedEl.textContent = `They asked: ${asked}`;
    } else {
      askedEl.hidden = true;
      askedEl.textContent = "";
    }
  }
  if (cueEl) {
    cueEl.hidden = !cue;
    cueEl.textContent = cueDisplay(kind, cue);
  }
  if (cueRow) cueRow.hidden = !cue;
  if (teachBack) teachBack.hidden = !(kind === "point" && cue);
  if (teachNext) teachNext.hidden = !(kind === "point" && cue);
  if (copyBtn) {
    copyBtn.hidden = !cue;
    copyBtn.textContent = cueCopyLabel(kind);
  }
}

/** Mirrors the main-process settings the renderer needs each frame. */
const hudSettings = { autoSend: false, followCursor: true, liveLines: 5 };

/**
 * Paint the LIVE bar as up to five rolling lines.
 *
 * `textContent` per line, never innerHTML: these strings are transcribed from
 * whatever is playing on screen, and a YouTube title is not markup we control.
 */
function renderSubtitle() {
  const feed = $("transcript-feed");
  const lines = liveFeed.lines().slice(-hudSettings.liveLines);
  // LIVE subtitle bar removed from default chrome — transcripts live in insights flip.
  if (subtitleText) {
    if (!lines.length) {
      subtitleText.textContent = listening || systemAudio ? "Listening…" : "";
    } else {
      subtitleText.replaceChildren();
      for (const line of lines) {
        const row = document.createElement("div");
        row.className = `live-line src-${line.source}${line.partial ? " partial" : ""}`;
        const who = document.createElement("span");
        who.className = "live-who";
        who.textContent = line.label;
        row.appendChild(who);
        row.appendChild(document.createTextNode(line.text));
        subtitleText.appendChild(row);
      }
    }
  }
  if (feed) {
    feed.replaceChildren();
    for (const line of lines) {
      const row = document.createElement("div");
      row.className = `live-line src-${line.source}${line.partial ? " partial" : ""}`;
      const who = document.createElement("span");
      who.className = "live-who";
      who.textContent = line.label;
      row.appendChild(who);
      row.appendChild(document.createTextNode(line.text));
      feed.appendChild(row);
    }
    if (!lines.length) {
      feed.textContent = listening || systemAudio ? "Listening…" : "No transcripts yet.";
    }
  }
}

/**
 * Keep the LIVE bar near the mouse. Clamped to the viewport so it cannot walk
 * off a screen edge, and offset below-right so it never sits under the pointer
 * itself — the cursor is Netie's identity and must stay visible.
 */
function positionSubtitle(x, y) {
  if (!subtitleBar || hudRoot.classList.contains("morph-hidden")) return;
  const rect = subtitleBar.getBoundingClientRect();
  const pad = 12;
  const left = Math.min(Math.max(pad, x + 18), window.innerWidth - rect.width - pad);
  const top = Math.min(Math.max(pad, y + 22), window.innerHeight - rect.height - pad);
  subtitleBar.style.left = `${Math.round(left)}px`;
  subtitleBar.style.top = `${Math.round(top)}px`;
  subtitleBar.style.transform = "none"; // drop the -50% centring while tracking
}
const insightFeed = createInsightFeed({
  onInsight: (i) => {
    insightSummary.textContent = i.summary;
    $("insight-topic").textContent = i.topic;
  },
});
const autoSend = createAutoSend({
  delayMs: AUTO_SEND_MS,
  onTick: (s) => paintAutoSend(s),
  onCancel: () => paintAutoSend({ armed: false }),
  onFire: ({ text }) => {
    paintAutoSend({ armed: false });
    // The composer already accumulates the same words; anything the user typed
    // on top of them is the instruction they actually mean.
    if (!askInput.value.trim()) askInput.value = text;
    // General mode listens and answers; it must never reach the act path.
    if (appMode === "general") doAsk();
    else doAct();
  },
});

const capture = new window.NetieCapture.LiveCapture((source, samples) => {
  paintWaveFromSamples(samples);
  window.netieHud.sendFrame(source, samples, 16000);
});

function invoke(channel, payload) {
  return window.netieHud.invoke(channel, payload);
}

function appendMessage(role, text, dedupe = false) {
  const value = String(text || "").trim();
  if (!value) return null;
  const kind = role === "user" ? "user" : role === "retrieve" ? "retrieve" : "assistant";
  const previous = messages.lastElementChild;
  if (dedupe && previous && previous.classList.contains(kind) && previous.textContent === value) {
    return previous;
  }
  const bubble = document.createElement("div");
  bubble.className = `msg ${kind}`;
  bubble.textContent = value;
  messages.appendChild(bubble);
  chatStream.scrollTop = chatStream.scrollHeight;
  return bubble;
}

function setLivePartial(text) {
  const value = String(text || "").trim();
  if (!value) {
    liveTranscript.hidden = true;
    liveTranscript.textContent = "…";
    return;
  }
  liveTranscript.hidden = false;
  liveTranscript.textContent = value;
  chatStream.scrollTop = chatStream.scrollHeight;
}

function paintWaveFromSamples(samples) {
  if (!samples?.length) return;
  const now = Date.now();
  if (now - lastWavePaintAt < 50) return;
  lastWavePaintAt = now;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  const level = Math.min(1, rms * 14);
  if (!waveBars.length) waveBars = Array.from(wave.querySelectorAll("i"));
  waveBars.forEach((bar, i) => {
    const phase = (i / Math.max(1, waveBars.length - 1)) * Math.PI;
    const h = 4 + Math.round(level * (14 + 12 * Math.sin(now / 55 + phase)));
    bar.style.height = `${h}px`;
    bar.style.opacity = String(0.3 + level * 0.7);
  });
  wave.classList.toggle("live", level > 0.02);
  wave.classList.toggle("hot", level > 0.35);
}

function setLive(on) {
  if (!on) {
    wave.classList.remove("live", "thinking", "hot");
    if (!waveBars.length) waveBars = Array.from(wave.querySelectorAll("i"));
    waveBars.forEach((bar) => {
      bar.style.height = "4px";
      bar.style.opacity = "0.35";
    });
    return;
  }
  wave.classList.add("live");
}

function updateRecUi() {
  btnListen.classList.toggle("active", listening && !paused);
  btnListen.classList.toggle("warn-on", listening && paused);
  if (!listening) recLabel.textContent = "Record";
  else if (paused) recLabel.textContent = "Paused";
  else recLabel.textContent = "Recording";
  btnPause.classList.toggle("paused", paused);
  btnPause.classList.toggle("active", paused);
  btnPause.title = paused ? "Resume" : "Pause";
  btnPause.disabled = !listening && !systemAudio;
  btnSystem.classList.toggle("warn-on", systemAudio);
  btnSystem.classList.toggle("active", systemAudio);
}

function tickTimer() {
  const now = Date.now();
  if (!paused && (listening || systemAudio) && !document.hidden) elapsedMs += now - lastTickAt;
  lastTickAt = now;
  const seconds = Math.floor(elapsedMs / 1000);
  timerEl.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
setInterval(tickTimer, 200);

function setChatOpen(open) {
  hudRoot.classList.toggle("chat-open", Boolean(open));
  $("btn-chat-toggle").classList.toggle("active", Boolean(open));
  if (open) {
    askInput.focus();
    // FIX-C15: do not force global click capture when opening chat.
    // Pointer-move / hitChrome already decide.
  }
}

function setMorphHidden(hidden) {
  hudRoot.classList.toggle("morph-hidden", Boolean(hidden));
  hudRoot.classList.remove("peeking");
  setMenu(false);
  if (hidden) {
    roulettePanel.classList.remove("open");
    closeEnquire();
    syncClickThrough(false);
    // The stage is a separate window: CSS here cannot reach it, so its nod
    // toast and subtitles would stay on screen with no chrome around them.
    invoke("hud:hideStage");
  } else {
    syncClickThrough(true);
  }
}

function setAgentBusy(busy) {
  agentBusy = Boolean(busy);
  hudRoot.classList.toggle("agent-busy", agentBusy);
  document.querySelectorAll("#mode-pill button").forEach((button) => {
    button.disabled = agentBusy;
  });
}

function applyTheme(theme) {
  const next = ["dark", "light", "gra"].includes(theme) ? theme : "dark";
  hudRoot.classList.remove("theme-dark", "theme-light", "theme-gra");
  hudRoot.classList.add(`theme-${next}`);
  localStorage.setItem("netie-hud-theme", next);
  document.querySelectorAll("#theme-row button").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === next);
  });
}
applyTheme(localStorage.getItem("netie-hud-theme") || "dark");
$("theme-row").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-theme]");
  if (button) applyTheme(button.dataset.theme);
});

function applyModeUi(mode, notesPath) {
  appMode = mode || "agent";
  // A countdown armed under the old mode must not fire under the new one —
  // "agent mode" spoken while General was armed would send the mode phrase.
  // Safe unguarded: applyModeUi only runs from hud:ready and event callbacks,
  // both after module evaluation. (A `typeof` guard would be worse than none —
  // `typeof` on a const still in its temporal dead zone throws.)
  autoSend.cancel("mode-change");
  hudRoot.classList.remove("mode-agent", "mode-general", "mode-transcribe", "mode-meeting");
  hudRoot.classList.add(`mode-${appMode}`);
  paintSuggests(appMode);
  if (appMode !== "meeting" && appMode !== "transcribe") {
    paintLiveBrief({ text: "", act: false });
  }
  document.querySelectorAll("#mode-pill button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === appMode);
  });
  if (notesPath) {
    notesChip.textContent = "Notes live";
    notesChip.title = notesPath;
  }
}

async function loadSettings() {
  const result = await invoke("hud:getSettings");
  const settings = (result && result.settings) || {};
  $("set-auto").checked = settings.autoRunSensible !== false;
  $("set-nod").checked = settings.nodConfirm !== false;
  $("set-cursor").checked = settings.cursorBubble !== false;
  $("set-md").checked = settings.saveAllMarkdown !== false;
  $("set-py").checked = settings.runPythonChecks !== false;
  if ($("set-demo-debug")) $("set-demo-debug").checked = settings.demoDebug === true;
  if ($("set-verify")) $("set-verify").checked = settings.verifySteps === true;
  if ($("set-autosend")) $("set-autosend").checked = settings.autoSend === true;
  if ($("set-cloud-stt")) $("set-cloud-stt").checked = settings.cloudStt === true;
  if ($("set-follow")) $("set-follow").checked = settings.followCursor !== false;
  if ($("set-capture-visible")) $("set-capture-visible").checked = settings.captureVisible === true;
  hudSettings.autoSend = settings.autoSend === true;
  hudSettings.followCursor = settings.followCursor !== false;
  hudSettings.liveLines = Number(settings.liveLines) > 0 ? Number(settings.liveLines) : 5;
  if (!hudSettings.followCursor) resetSubtitlePosition();
}

/** Put the LIVE bar back under the top bar when it stops tracking the mouse. */
function resetSubtitlePosition() {
  if (!subtitleBar) return;
  subtitleBar.style.left = "";
  subtitleBar.style.top = "";
  subtitleBar.style.transform = "";
}
async function saveSettingsFromUi() {
  await invoke("hud:setSettings", {
    settings: {
      autoRunSensible: $("set-auto").checked,
      nodConfirm: $("set-nod").checked,
      cursorBubble: $("set-cursor").checked,
      saveAllMarkdown: $("set-md").checked,
      runPythonChecks: $("set-py").checked,
      demoDebug: $("set-demo-debug") ? $("set-demo-debug").checked : false,
      verifySteps: $("set-verify") ? $("set-verify").checked : false,
      autoSend: $("set-autosend") ? $("set-autosend").checked : false,
      cloudStt: $("set-cloud-stt") ? $("set-cloud-stt").checked : false,
      followCursor: $("set-follow") ? $("set-follow").checked : true,
      captureVisible: $("set-capture-visible") ? $("set-capture-visible").checked : false,
    },
  });
  await loadSettings();
}

function setMenu(open) {
  settingsMenu.classList.toggle("open", Boolean(open));
  $("btn-more").setAttribute("aria-expanded", String(Boolean(open)));
}

function applyDockTransform() {
  if (!hudRoot.classList.contains("chat-open")) return;
  const o = drag.offset("chat");
  // FIX-C16: match CSS — desktop -20%, narrow -50% — so drag keeps centring.
  const cx = window.innerWidth <= 900 ? "-50%" : "-20%";
  chatDock.style.transform = `translate(calc(${cx} + ${o.x}px), ${o.y}px) scale(1)`;
}

function applyInsightTransform() {
  if (!hudRoot.classList.contains("chat-open")) return;
  const panel = $("insight-panel");
  if (!panel) return;
  const o = drag.offset("insight");
  const cx = window.innerWidth <= 900 ? "-50%" : "0px";
  panel.style.transform = `translate(calc(${cx} + ${o.x}px), ${o.y}px)`;
}

/** The LIVE bar is centred, so its drag offset rides on top of the -50%. */
function applySubtitleTransform() {
  if (!subtitleBar) return;
  const o = drag.offset("subtitle");
  subtitleBar.style.transform = `translate(calc(-50% + ${o.x}px), ${o.y}px)`;
}

function applyTransform(target) {
  if (target === "chat") applyDockTransform();
  else if (target === "insight") applyInsightTransform();
  else if (target === "subtitle") applySubtitleTransform();
}

/** HUD-02 — the countdown has to be readable and cancellable at a glance. */
function paintAutoSend(state) {
  if (!autosendChip) return;
  const armed = Boolean(state && state.armed);
  autosendChip.classList.toggle("armed", armed);
  if (armed && autosendCount) {
    autosendCount.textContent = String(Math.ceil((state.remainingMs || 0) / 1000));
  }
}

// One clock drives the countdown and the insight debounce; hud-live owns the
// deadline arithmetic so both are testable without sleeping.
setInterval(() => {
  const now = Date.now();
  if (autoSend.armed) autoSend.tick(now);
  insightFeed.flush(now);
}, 200);

async function armCapture({ mic = false, system = false, resume = true } = {}) {
  if (resume) paused = false;
  if (mic) {
    listening = true;
    const result = await invoke("hud:toggleListen", { on: true });
    const started = await capture.start("mic");
    if (!started.ok) {
      listening = false;
      await invoke("hud:toggleListen", { on: false });
      answerMeta.textContent = `Mic unavailable (${started.error || "unknown"})`;
      updateRecUi();
      return false;
    }
    answerMeta.textContent = result.message || "Recording";
  }
  if (system) {
    systemAudio = true;
    const result = await invoke("hud:toggleSystemAudio", { on: true });
    const started = await capture.start("system");
    if (!started.ok) {
      systemAudio = false;
      await invoke("hud:toggleSystemAudio", { on: false });
      answerMeta.textContent = `System audio unavailable (${started.error || "denied"})`;
      updateRecUi();
      return false;
    }
    answerMeta.textContent = result.message || "System audio on";
  }
  updateRecUi();
  setLive(capture.active("mic") || capture.active("system"));
  setChatOpen(true);
  try {
    const stt = await invoke("hud:sttStatus");
    if (stt && stt.engine && stt.engine !== "none") {
      answerMeta.textContent = `Listening · ${stt.label || stt.engine}`;
    } else if (stt && stt.hint) {
      answerMeta.textContent = stt.hint;
      subtitleText.textContent = stt.hint;
    }
  } catch {
    /* ok */
  }
  return true;
}

function syncClickThrough(over) {
  if (over === mouseOverChrome) return;
  mouseOverChrome = over;
  invoke("hud:setIgnoreMouse", { ignore: !over });
}

function hitChrome(target) {
  return Boolean(target && target.closest && target.closest(".chrome"));
}

document.addEventListener(
  "pointermove",
  (event) => {
    if (hudRoot.classList.contains("morph-hidden")) {
      // No peek orb — use Ctrl+` / Show/Hide to restore. Ignore hover chrome.
      syncClickThrough(false);
      return;
    }
    syncClickThrough(hitChrome(event.target));
    const moved = drag.move({ x: event.screenX, y: event.screenY });
    if (moved) applyTransform(moved.target);
  },
  true
);
document.addEventListener("pointerdown", (event) => syncClickThrough(hitChrome(event.target)), true);
document.addEventListener("pointerleave", () => {
  if (!drag.dragging && hudRoot.classList.contains("morph-hidden")) {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      hudRoot.classList.remove("peeking");
      syncClickThrough(false);
    }, 400);
  } else if (!drag.dragging) syncClickThrough(false);
}, true);
document.addEventListener("pointerup", () => {
  drag.end();
});

/** Every draggable panel goes through the one controller — HUD-01. */
function bindDrag(handleId, target) {
  const handle = $(handleId);
  if (!handle) return;
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button")) return;
    drag.begin(target, { x: event.screenX, y: event.screenY });
    event.currentTarget.setPointerCapture(event.pointerId);
  });
}
bindDrag("chat-drag", "chat");
bindDrag("insight-drag", "insight");
bindDrag("subtitle-drag", "subtitle");
const btnChatClose = $("btn-chat-close");
if (btnChatClose) btnChatClose.addEventListener("click", () => setChatOpen(false));
const btnShowTranscript = $("btn-show-transcript");
let insightView = "ai";
let statusOpenPath = "";

function setInsightView(view) {
  insightView = view === "transcripts" ? "transcripts" : "ai";
  const ai = $("insight-ai-view");
  const tr = $("insight-transcript-view");
  if (ai) ai.hidden = insightView !== "ai";
  if (tr) tr.hidden = insightView !== "transcripts";
  document.querySelectorAll(".insight-tab").forEach((btn) => {
    const on = btn.dataset.insightView === insightView;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  if (insightView === "transcripts") renderSubtitle();
}

function showStatusPill({ title, sub, path, ready }) {
  const pill = $("status-pill");
  if (!pill) return;
  $("status-title").textContent = title || "Working…";
  $("status-sub").textContent = sub || "";
  statusOpenPath = path || "";
  $("btn-status-open").hidden = !ready;
  pill.hidden = false;
  pill.classList.add("show");
}

function hideStatusPill() {
  const pill = $("status-pill");
  if (!pill) return;
  pill.classList.remove("show");
  pill.hidden = true;
  statusOpenPath = "";
}

function maybeShowOnboard() {
  try {
    if (localStorage.getItem("netie_pointer_onboarded") === "1") {
      hudRoot.classList.add("onboarded", "theme-onboarded");
      return;
    }
  } catch (_) { /* ignore */ }
  const el = $("onboard");
  if (el) el.hidden = false;
}

document.querySelector(".insight-tabs")?.addEventListener("click", (event) => {
  const tab = event.target.closest(".insight-tab");
  if (!tab) return;
  setInsightView(tab.dataset.insightView);
});

$("btn-status-cancel")?.addEventListener("click", hideStatusPill);
$("btn-status-open")?.addEventListener("click", async () => {
  if (!statusOpenPath) {
    hideStatusPill();
    return;
  }
  // Keep the pill up until the open actually succeeds. Dismissing first meant a
  // containment refusal (#19) took the only surface that could report it with
  // it, and the customer saw a button that did nothing (R-0011).
  let result;
  try {
    result = await invoke("hud:openPath", { path: statusOpenPath });
  } catch (err) {
    result = { ok: false, error: String((err && err.message) || err) };
  }
  if (result && result.ok) {
    hideStatusPill();
    return;
  }
  $("status-title").textContent = "Could not open";
  $("status-sub").textContent = (result && result.error) || "refused";
  $("btn-status-open").hidden = true;
});

$("btn-onboard-done")?.addEventListener("click", () => {
  try { localStorage.setItem("netie_pointer_onboarded", "1"); } catch (_) { /* ignore */ }
  hudRoot.classList.add("onboarded", "theme-onboarded");
  const el = $("onboard");
  if (el) el.hidden = true;
});

$("command-bar-tools")?.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-cmd]");
  if (!btn) return;
  const cmd = btn.dataset.cmd;
  if (cmd === "attach") $("file-attach")?.click();
  else if (cmd === "apps") {
    askInput.value = "List active apps and suggest what I can do next";
    doAsk();
  } else if (cmd === "walk" || cmd === "shots") invoke("hud:frameRegion");
  else if (cmd === "clipboard") {
    askInput.value = "Summarize my clipboard and offer paste targets";
    doAsk();
  }
});

/**
 * Attachments the customer has actually staged (#23).
 *
 * The old code read `file.name`, built a chip, and then cleared `input.value`,
 * which destroys the FileList — so nothing could ever recover the selection and
 * the chip was decoration. State lives here, keyed to its chip element, and is
 * cleared both when a chip is removed and after a successful submit, so one
 * intent's attachments cannot leak into the next.
 *
 * @type {Array<{name:string, size:number, content:string|null, ok:boolean,
 *               reason:string, chip:HTMLElement}>}
 */
let attachments = [];

const ATTACH = globalThis.NetieAttachments;

function renderAttachmentChip(entry) {
  const chip = document.createElement("span");
  chip.className = entry.ok ? "file-chip" : "file-chip refused";
  const label = document.createElement("span");
  label.className = "file-chip-name";
  label.textContent = entry.name;
  chip.appendChild(label);

  if (!entry.ok) {
    // R-0011: a refused file must LOOK refused. A chip identical to an accepted
    // one is the original defect with extra steps.
    const why = document.createElement("span");
    why.className = "file-chip-why";
    why.textContent = entry.reason;
    chip.appendChild(why);
    chip.title = `Not attached — ${entry.reason}`;
  } else {
    chip.title = `${entry.name} will be sent as reference material`;
  }

  const x = document.createElement("button");
  x.type = "button";
  x.textContent = "×";
  x.setAttribute("aria-label", `Remove ${entry.name}`);
  x.addEventListener("click", () => {
    attachments = attachments.filter((a) => a !== entry);
    chip.remove();
  });
  chip.appendChild(x);
  entry.chip = chip;
  return chip;
}

function clearAttachments() {
  for (const entry of attachments) entry.chip?.remove();
  attachments = [];
  const chips = $("file-chips");
  if (chips) chips.replaceChildren();
}

/**
 * What actually leaves the renderer: accepted files only, with content. A
 * refused chip contributes nothing, which is the point — the customer can see
 * at the chip that it was not sent.
 */
function attachmentPayload() {
  return attachments
    .filter((a) => a.ok && a.content != null)
    .map((a) => ({ name: a.name, size: a.size, content: a.content, ok: true }));
}

/** Read an accepted text file. Refusals never get here, so never get read. */
function readFileText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

$("file-attach")?.addEventListener("change", async () => {
  const chips = $("file-chips");
  const input = $("file-attach");
  if (!chips || !input?.files?.length) return;
  const picked = Array.from(input.files);
  // Clear the input immediately — but only after copying the FileList out, which
  // is the step the old code was missing.
  input.value = "";

  const accepted = attachments.filter((a) => a.ok);
  const verdicts = ATTACH.classifySelection(picked, accepted);

  for (let i = 0; i < picked.length; i += 1) {
    const file = picked[i];
    const verdict = verdicts[i];
    const entry = {
      name: file.name,
      size: file.size,
      content: null,
      ok: verdict.ok,
      reason: verdict.reason || "",
      chip: null,
    };
    attachments.push(entry);
    chips.appendChild(renderAttachmentChip(entry));

    if (verdict.ok) {
      const text = await readFileText(file);
      if (text == null) {
        // Unreadable after acceptance — say so at the chip rather than sending
        // an intent that silently lost a file.
        entry.ok = false;
        entry.reason = "could not be read";
        entry.chip.replaceWith(renderAttachmentChip(entry));
      } else {
        entry.content = text;
      }
    }
  }
});

// ── #25 · hold-to-talk ──────────────────────────────────────────────────────
// The gesture lives here; the lifecycle lives in hud-live.js so the hard-stop
// paths are tested without a browser. What the renderer owns is: which DOM
// events count as a release, and what the control looks like while the mic is
// open. Those two must never disagree — an open mic with an idle-looking button
// is the privacy defect this ticket is actually about.
const btnHold = $("btn-hold-hint");

const holdToTalk = createHoldToTalk({
  engineAvailable: async () => {
    try {
      const stt = await invoke("hud:sttStatus");
      if (!stt || !stt.engine || stt.engine === "none") {
        return { ok: false, reason: (stt && stt.hint) || "no transcription engine" };
      }
      return { ok: true, label: stt.label || stt.engine };
    } catch {
      return { ok: false, reason: "transcription status unavailable" };
    }
  },
  start: async () => {
    const started = await capture.start("mic");
    if (!started.ok) return started;
    listening = true;
    await invoke("hud:toggleListen", { on: true });
    paused = false;
    updateRecUi();
    setLive(true);
    return { ok: true };
  },
  stop: async () => {
    capture.stop("mic");
    listening = false;
    try {
      await invoke("hud:toggleListen", { on: false });
    } catch {
      /* the mic is already closed locally; never leave `holding` stuck on it */
    }
    updateRecUi();
    setLive(capture.active("system"));
    setLivePartial("");
  },
  onState: ({ state, detail }) => {
    if (!btnHold) return;
    btnHold.classList.toggle("holding", state === "holding");
    btnHold.classList.toggle("unavailable", state === "unavailable");
    if (state === "holding") {
      btnHold.textContent = "Listening — release to send";
      answerMeta.textContent = "Listening (hold)";
    } else if (state === "unavailable") {
      // Said at the control, not only in a log line.
      btnHold.textContent = "Hold to talk — unavailable";
      btnHold.title = detail || "No transcription engine";
      answerMeta.textContent = detail || "No transcription engine";
    } else if (state === "idle") {
      btnHold.textContent = "Hold to talk";
      // A hold that ended because the window went away should say so rather
      // than looking like a normal release.
      if (detail && detail !== "release") answerMeta.textContent = `Stopped listening (${detail})`;
    }
  },
});

if (btnHold) {
  btnHold.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    // Capture the pointer so a drag off the button still delivers pointerup.
    try { btnHold.setPointerCapture(event.pointerId); } catch { /* not supported */ }
    holdToTalk.begin("pointer");
  });
  for (const evt of ["pointerup", "pointercancel", "pointerleave"]) {
    btnHold.addEventListener(evt, () => holdToTalk.end(evt));
  }
  // Keyboard parity: the control is a button, so Space/Enter must work too, and
  // must release on keyup like the pointer does.
  btnHold.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      holdToTalk.begin("key");
    }
  });
  btnHold.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") holdToTalk.end("keyup");
  });
}

// The hard stops that have nothing to do with the button. Alt-tab, a system
// gesture, or the window losing focus must close the microphone — otherwise the
// hold outlives the UI that says it is happening.
window.addEventListener("blur", () => holdToTalk.end("window blur"));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") holdToTalk.end("window hidden");
});

maybeShowOnboard();
setInsightView("ai");

if (btnShowTranscript) {
  btnShowTranscript.addEventListener("click", () => {
    setChatOpen(true);
    askInput.focus();
  });
}

async function doAsk() {
  const message = askInput.value.trim() || finalBits.slice(-1)[0] || "";
  if (!message) return;
  autoSend.cancel("sent");
  dismissCleanToast();
  setChatOpen(true);
  appendMessage("user", message, true);
  askInput.value = "";
  setLivePartial("");
  answerMeta.textContent = "Thinking…";
  answerBody.textContent = "…";
  if (window.NetieSound) NetieSound.think();
  const sent = attachmentPayload();
  const transcript = typeof liveFeed.render === "function" ? liveFeed.render() : "";
  const result = await invoke("hud:ask", { message, attachments: sent, transcript, mode: appMode });
  if (sent.length) clearAttachments();
  answerMeta.textContent = result.degraded ? "Answered (degraded)" : "AI response";
  appendMessage("assistant", result.ok ? result.reply || "" : result.error || "Failed");
  answerBody.textContent = "";
  if (window.NetieSound) (result.ok ? NetieSound.ok : NetieSound.warn)();
}

async function doAct() {
  // Listening modes are coworkers, not agents. Hiding the button is cosmetics;
  // this is the line that means a stray "do it" cannot move the mouse.
  if (appMode !== "agent") {
    answerMeta.textContent = `${appMode} mode — answering, not acting`;
    await doAsk();
    return;
  }
  const message = askInput.value.trim() || finalBits.slice(-1)[0] || "";
  if (!message) return;
  autoSend.cancel("sent"); // it is going now; no second copy in four seconds
  dismissCleanToast();
  setChatOpen(true);
  appendMessage("user", message, true);
  askInput.value = "";
  answerMeta.textContent = "Planning…";
  const sentAct = attachmentPayload();
  const result = await invoke("hud:act", { message, attachments: sentAct });
  if (sentAct.length) clearAttachments();
  // HUD-04 — acting used to end the conversation; the follow-up ("no, the other
  // one") landed on a dead mic. Pick capture back up unless the user paused it.
  await rearmAfterAct();
  if (!result.ok) {
    appendMessage("assistant", result.reason || result.error || "Blocked");
    if (window.NetieSound) NetieSound.warn();
    return;
  }
  const failed = ((result.run && result.run.results) || []).find(
    (r) => r && r.ok === false && !r.noop && r.skipped !== "refused"
  );
  if (failed) {
    appendMessage("assistant", failed.message || failed.error || failed.reason || "Step failed");
    if (window.NetieSound) NetieSound.warn();
    return;
  }
  // The main process already computed the verb/destination disclosure (#20);
  // repeating a bare count here would put the old lie back in the transcript.
  const n = (result.actions || (result.plan && result.plan.actions) || []).length;
  appendMessage(
    "assistant",
    result.ran ? `Running ${n} step(s) — see the panel for what each one does.`
               : `${n} step(s) ready — read the steps above, then nod / Affirm / Ctrl+Y.`
  );
}

async function rearmAfterAct() {
  const want = shouldRearmAfterAct({ listening, systemAudio, paused, mode: appMode });
  if (!want.mic && !want.system) return want;
  const need = { mic: want.mic && !capture.active("mic"), system: want.system && !capture.active("system") };
  if (need.mic || need.system) await armCapture({ ...need, resume: true });
  else setLive(true);
  return want;
}

function addTextToChat(text, asRetrieve = false) {
  const value = String(text || "").trim();
  if (!value) return;
  setChatOpen(true);
  if (asRetrieve) {
    appendMessage("retrieve", value);
    return;
  }
  const current = askInput.value.trim();
  askInput.value = current ? `${current}\n${value}` : value;
  askInput.focus();
}

$("btn-chat-toggle").addEventListener("click", () => {
  if (hudRoot.classList.contains("morph-hidden")) {
    setMorphHidden(false);
    setChatOpen(true);
    return;
  }
  setChatOpen(!hudRoot.classList.contains("chat-open"));
});

$("btn-roulette").addEventListener("click", async () => {
  if (hudRoot.classList.contains("morph-hidden")) {
    setMorphHidden(false);
    setChatOpen(true);
    roulettePanel.classList.add("open");
    await fetchBucket(activeBucket);
    return;
  }
  const open = !roulettePanel.classList.contains("open");
  roulettePanel.classList.toggle("open", open);
  if (open) await fetchBucket(activeBucket);
});

peekDrop && peekDrop.addEventListener("click", () => {
  setMorphHidden(false);
  setChatOpen(true);
});

$("btn-hide-top").addEventListener("click", () => setMorphHidden(true));
$("btn-hide").addEventListener("click", () => {
  setMenu(false);
  setMorphHidden(true);
});

$("btn-space").addEventListener("click", async () => {
  const selected = roulettePreview.dataset.path || null;
  const result = await invoke("hud:openInSpace", selected ? { file: selected } : {});
  answerMeta.textContent = result.ok ? result.hint || "Opened for Netie Space" : result.error || "Space open failed";
  setMenu(false);
});

if ($("btn-demo-debug")) {
  $("btn-demo-debug").addEventListener("click", async () => {
    setMenu(false);
    const result = await invoke("hud:openDemoDebug");
    answerMeta.textContent = result.ok
      ? `Debug shots: ${result.folder}`
      : result.error || "Debug folder failed";
  });
}

document.querySelectorAll(".slice").forEach((slice) => {
  slice.addEventListener("mouseenter", () => fetchBucket(slice.dataset.bucket));
  slice.addEventListener("click", () => fetchBucket(slice.dataset.bucket));
});

async function fetchBucket(bucket) {
  activeBucket = bucket;
  const labels = {
    chat: "Chat",
    notes: "Notes",
    assets: "Assets",
    memory: "Memory",
    source: "Source",
    fleet: "Fleet",
  };
  rouletteLabel.textContent = labels[bucket] || bucket[0].toUpperCase() + bucket.slice(1);
  document.querySelectorAll(".slice").forEach((el) => {
    el.classList.toggle("active", el.dataset.bucket === bucket);
  });
  const result = await invoke("hud:retrieveList", { bucket });
  rouletteItems.innerHTML = "";
  latestRetrieveText = "";
  roulettePreview.dataset.path = "";
  roulettePreview.dataset.bucket = bucket;
  (result.items || []).forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.title || item.id;
    button.addEventListener("click", async () => {
      const details = await invoke("hud:retrieveRead", {
        bucket,
        id: item.id,
        title: item.title,
        detail: item.detail,
      });
      roulettePreview.textContent = details.markdown || details.error || "No preview";
      latestRetrieveText = details.markdown || item.title || "";
      const openPath = details.openPath || details.path || item.path || "";
      if (openPath) {
        roulettePreview.dataset.path = openPath;
        answerMeta.textContent = "Selected — Open / Add / Do with Cortex";
      } else {
        roulettePreview.dataset.path = "";
        answerMeta.textContent = "Selected — Add to chat or Do with Cortex";
      }
    });
    rouletteItems.appendChild(button);
  });
  if (!result.items || !result.items.length) {
    roulettePreview.textContent = "No items yet.";
    latestRetrieveText = "";
  } else if (bucket === "fleet" && typeof result.cortexOnline === "boolean") {
    answerMeta.textContent = result.cortexOnline ? "Cortex online" : "Cortex offline";
  }
}

$("btn-retrieve-add").addEventListener("click", () => {
  if (!latestRetrieveText) {
    answerMeta.textContent = "Pick a retrieve item first";
    return;
  }
  addTextToChat(latestRetrieveText, true);
  answerMeta.textContent = "Added to chat";
  roulettePanel.classList.remove("open");
});

const btnRetrieveOpen = $("btn-retrieve-open");
if (btnRetrieveOpen) {
  btnRetrieveOpen.addEventListener("click", async () => {
    const result = await invoke("hud:retrieveOpen", {
      bucket: activeBucket,
      path: roulettePreview.dataset.path || null,
    });
    answerMeta.textContent = result.ok
      ? result.opened || result.path || "Opened"
      : result.error || "Open failed";
  });
}

const btnRetrieveAct = $("btn-retrieve-act");
if (btnRetrieveAct) {
  btnRetrieveAct.addEventListener("click", async () => {
    if (!latestRetrieveText) {
      answerMeta.textContent = "Pick a retrieve item first";
      return;
    }
    addTextToChat(latestRetrieveText, true);
    askInput.value = `Using retrieved ${activeBucket} context, do the sensible next actions:\n\n${latestRetrieveText}`;
    roulettePanel.classList.remove("open");
    setChatOpen(true);
    await doAct();
  });
}

$("btn-clear").addEventListener("click", () => {
  askInput.value = "";
  finalBits = [];
  setLivePartial("");
  dismissCleanToast();
});
$("btn-act").addEventListener("click", doAct);
$("btn-add-sub").addEventListener("click", () => addTextToChat(latestSystemSubtitle, true));
const btnAutoSendCancel = $("btn-autosend-cancel");
if (btnAutoSendCancel) {
  btnAutoSendCancel.addEventListener("click", () => {
    autoSend.cancel("user");
    answerMeta.textContent = "Auto-send cancelled";
  });
}
// Typing is taking control back — a countdown that fires mid-edit sends half a
// thought. Escape kills it outright.
askInput.addEventListener("input", () => {
  autoSend.cancel("typing");
  // The offer only applies to the exact span it was made for — once the user
  // touches the box, that span may no longer point at the right text.
  if (pendingClean) dismissCleanToast();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && autoSend.armed) autoSend.cancel("escape");
});
$("btn-clean-yes").addEventListener("click", () => {
  if (!pendingClean) return;
  const { start, end, raw, cleaned } = pendingClean;
  // Re-verify the span still holds exactly the raw text the offer was made
  // for — if the user edited around it since, don't guess, just back off.
  if (askInput.value.slice(start, end) !== raw) {
    dismissCleanToast();
    return;
  }
  askInput.value = askInput.value.slice(0, start) + cleaned + askInput.value.slice(end);
  askInput.focus();
  dismissCleanToast();
});
$("btn-clean-no").addEventListener("click", dismissCleanToast);
$("insight-actions").addEventListener("click", (event) => {
  const confirmBtn = event.target.closest("button[data-confirm]");
  if (confirmBtn) {
    askInput.value = confirmBtn.dataset.confirm;
    showStatusPill({
      title: confirmBtn.dataset.confirm,
      sub: "Confirm with Do it / nod",
      ready: false,
    });
    return;
  }
  const button = event.target.closest("button[data-q]");
  if (!button) return;
  askInput.value = button.dataset.q;
  doAsk();
});
if (btnShowTranscript) {
  btnShowTranscript.addEventListener("click", () => setInsightView("transcripts"));
}
$("desk-pill").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-desk]");
  if (!button) return;
  const q = String(button.dataset.q || "");
  if (!q) return;
  document.querySelectorAll("#desk-pill button").forEach((b) => {
    b.classList.toggle("active", b === button);
  });
  askInput.value = q;
  if (button.dataset.autoask === "1") doAsk();
  else askInput.focus();
});
const cueRow = $("cue-row");
if (cueRow) {
  cueRow.addEventListener("click", (event) => {
    const button = event.target.closest("#btn-teach-back, #btn-teach-next");
    if (!button) return;
    const q = String(button.dataset.q || "");
    if (!q) return;
    askInput.value = q;
    doAsk();
  });
}
const btnCopyCue = $("btn-copy-cue");
if (btnCopyCue) {
  btnCopyCue.addEventListener("click", async () => {
    const text = String(lastCueText || "").trim();
    if (!text) return;
    const res = await invoke("hud:copyText", { text });
    btnCopyCue.textContent = res && res.ok ? "Copied" : "Copy failed";
    setTimeout(() => {
      btnCopyCue.textContent = cueCopyLabel(lastCueKind);
    }, 1200);
  });
}
$("mode-pill").addEventListener("click", async (event) => {
  if (agentBusy) {
    answerMeta.textContent = "Agent busy — mode locked";
    return;
  }
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  const result = await invoke("hud:setMode", { mode: button.dataset.mode });
  applyModeUi(result.mode, result.notesPath);
  if (result.listen || result.systemAudio) {
    await armCapture({ mic: Boolean(result.listen), system: Boolean(result.systemAudio) });
    const armedText = {
      meeting: "Meeting — mic + system audio armed",
      transcribe: "Transcribe — mic armed, speak now",
      general: "General — listening, I won't click anything",
    };
    subtitleText.textContent = armedText[result.mode] || "Mic armed";
  }
});
$("btn-more").addEventListener("click", async (event) => {
  event.stopPropagation();
  if (hudRoot.classList.contains("morph-hidden")) {
    setMorphHidden(false);
  }
  const open = !settingsMenu.classList.contains("open");
  setMenu(open);
  if (open) await loadSettings();
});
settingsMenu.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("pointerdown", (event) => {
  if (settingsMenu.classList.contains("open") && !event.target.closest(".menu-anchor")) setMenu(false);
});
settingInputs.filter(Boolean).forEach((input) => input.addEventListener("change", saveSettingsFromUi));
$("btn-canvas").addEventListener("click", () => {
  invoke("hud:openCanvas");
  setMenu(false);
});
$("btn-frame").addEventListener("click", () => {
  invoke("hud:frameRegion");
  setMenu(false);
});
$("btn-frame-top").addEventListener("click", () => {
  invoke("hud:frameRegion");
  setMenu(false);
});
$("btn-affirm").addEventListener("click", () => invoke("hud:affirm"));
$("btn-nod-go").addEventListener("click", () => invoke("hud:affirm"));

btnListen.addEventListener("click", async () => {
  listening = !listening;
  lastTickAt = Date.now();
  updateRecUi();
  const result = await invoke("hud:toggleListen", { on: listening });
  if (listening) {
    const started = await capture.start("mic");
    if (!started.ok) {
      listening = false;
      updateRecUi();
      await invoke("hud:captureFailed", { source: "mic" });
      answerMeta.textContent = `Mic unavailable (${started.error || "unknown"})`;
      return;
    }
    paused = false;
    updateRecUi();
    setLive(true);
    answerMeta.textContent = result.message || "Recording";
    return;
  }
  capture.stop("mic");
  setLive(capture.active("system"));
  setLivePartial("");
  answerMeta.textContent = "Mic off";
  updateRecUi();
});

btnSystem.addEventListener("click", async () => {
  systemAudio = !systemAudio;
  updateRecUi();
  const result = await invoke("hud:toggleSystemAudio", { on: systemAudio });
  if (!systemAudio) {
    capture.stop("system");
    setLive(capture.active("mic"));
    answerMeta.textContent = "System audio off";
    return;
  }
  const started = await capture.start("system");
  if (!started.ok) {
    systemAudio = false;
    await invoke("hud:toggleSystemAudio", { on: false });
    updateRecUi();
    answerMeta.textContent = `System audio unavailable (${started.error || "denied"})`;
    return;
  }
  setLive(true);
  answerMeta.textContent = result.message || "System audio on";
});

btnPause.addEventListener("click", async () => {
  if (!listening && !systemAudio) return;
  paused = !paused;
  updateRecUi();
  await invoke("hud:setPaused", { paused });
  lastTickAt = Date.now();
  if (paused) {
    capture.stopAll();
    setLive(false);
    answerMeta.textContent = "Paused";
    return;
  }
  if (listening) await capture.start("mic");
  if (systemAudio) await capture.start("system");
  setLive(capture.active("mic") || capture.active("system"));
  answerMeta.textContent = "Resumed";
});

clickyOrb && clickyOrb.addEventListener("pointerdown", async (event) => {
  if (event.button !== 0) return;
  clickyOrb && clickyOrb.classList.add("armed");
  clickyHoldTimer = "holding";
  await invoke("hud:clickyHold", { phase: "start" });
});
const endClickyHold = async (commit) => {
  if (!clickyHoldTimer) return;
  clickyHoldTimer = null;
  await invoke("hud:clickyHold", { phase: commit ? "end" : "cancel" });
};
clickyOrb && clickyOrb.addEventListener("pointerup", () => endClickyHold(true));
clickyOrb && clickyOrb.addEventListener("pointercancel", () => endClickyHold(false));
clickyOrb && clickyOrb.addEventListener("dblclick", async () => {
  clickyOrb && clickyOrb.classList.remove("armed");
  await invoke("hud:clickyExit");
});

askInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    const start = askInput.selectionStart;
    const end = askInput.selectionEnd;
    askInput.value = `${askInput.value.slice(0, start)}\n${askInput.value.slice(end)}`;
    askInput.selectionStart = askInput.selectionEnd = start + 1;
    return;
  }
  event.preventDefault();
  doAsk();
});

/**
 * Everything main.js pushes at the HUD lands here.
 *
 * Named rather than inline so the smoke test can hand it a synthetic event and
 * assert what gets painted. That adds no surface: it is the same handler the
 * IPC bridge already calls, it can only draw, and anything able to call it can
 * already run script in this renderer.
 */
/**
 * Local, no-network disfluency pass: strips filler interjections ("um", "uh")
 * and immediate word-repetition stutters ("I I I want" -> "I want"). Never an
 * LLM call, so it runs instantly and the words never leave the device -- same
 * privacy stance as the mic pipeline itself (netie/transcriber.js).
 */
function cleanupTranscript(text) {
  return String(text || "")
    .replace(/\b(um+|uh+|erm+|hm+)\b[,.]?/gi, "")
    .replace(/\b(\w+)(\s+\1\b)+/gi, "$1")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function dismissCleanToast() {
  pendingClean = null;
  cleanToast.hidden = true;
}

/** Offer to clean the segment just inserted at [start,end) of askInput.value. */
function offerCleanup(start, end, raw, cleaned) {
  pendingClean = { start, end, raw, cleaned };
  cleanToastText.textContent = `Clean up "${raw.length > 40 ? `${raw.slice(0, 40)}…` : raw}"?`;
  cleanToast.hidden = false;
}

function onHudEvent(event) {
  if (!event?.type) return;
  if (event.type === "mode") applyModeUi(event.mode, event.notesPath);
  if (event.type === "nod-wait") nodToast.classList.toggle("show", event.on !== false);
  if (event.type === "plan-running") setAgentBusy(event.on !== false);
  if (event.type === "transcript") {
    if (event.modeSwitchOnly) return;
    const text = String(event.text || "").trim();
    const source = event.source === "system" ? "system" : "mic";
    // The LIVE bar is what the SCREEN is saying -- the video, the call, the
    // other side. Your own voice does not belong in it: you already know what
    // you said, and mixing both made it impossible to read either. Your words
    // go to the Ask box instead, where you can edit them before sending.
    if (text && source === "system") {
      liveLine.push(source, text);
      liveFeed.push(source, text, { partial: Boolean(event.partial) });
      renderSubtitle();
    }
    if (source === "system") {
      latestSystemSubtitle = text;
      insightFeed.push(text, Date.now()); // HUD-05 — the room counts as speech
    } else if (event.partial) {
      setLivePartial(text);
      if (text) setChatOpen(true);
    } else if (text) {
      finalBits.push(text);
      if (finalBits.length > 12) finalBits = finalBits.slice(-12);
      setLivePartial("");
      setChatOpen(true);
      // Deliberately NOT appendMessage() here. Echoing your speech into the
      // chat log made it look like it had been sent -- the transcript appeared
      // as a user turn identical to one you actually submitted, so "it keeps
      // auto-sending" was the only reasonable reading. It goes in the composer
      // and stays there until you press Do it.
      // Put the words in the box you are about to send. They only lived in the
      // chat log before, so the Ask field looked empty and speaking read as
      // "nothing happened" — even though Ask/Do it silently fell back to the
      // last transcript. Accumulate so two sentences make one instruction.
      const existing = askInput.value.trim();
      const insertStart = existing ? existing.length + 1 : 0;
      askInput.value = existing ? `${existing} ${text}` : text;
      askInput.scrollTop = askInput.scrollHeight;
      insightFeed.push(text, Date.now());
      // Offer cleanup only when there is actually a filler/stutter to strip —
      // asking "clean or nah?" after every clean sentence would just be noise.
      const cleaned = cleanupTranscript(text);
      if (cleaned && cleaned !== text.trim()) {
        offerCleanup(insertStart, askInput.value.length, text, cleaned);
      }
      // HUD-02 — opt-in only. What you say lands in the Ask box and waits there
      // so you can edit it, add to it by typing, and send when you mean to.
      // Auto-sending a half-finished sentence is worse than not sending at all.
      if (hudSettings.autoSend && (appMode === "agent" || appMode === "general")) {
        autoSend.arm(text, Date.now());
      }
    }
  }
  if (event.type === "capture") {
    if (event.state === "stopped") {
      listening = false;
      systemAudio = false;
      paused = false;
      capture.stopAll();
      setLive(false);
      liveFeed.clear();
      renderSubtitle();
      updateRecUi();
    } else if (event.state === "paused") {
      paused = true;
      updateRecUi();
    } else if (event.state === "recording") {
      paused = false;
      updateRecUi();
    }
  }
  if (event.type === "cursor" && hudSettings.followCursor) positionSubtitle(event.x, event.y);
  if (event.type === "stt-busy") wave.classList.toggle("thinking", Boolean(event.busy));
  if (event.type === "stt-error") {
    answerMeta.textContent = event.hint ? `${event.error} — ${event.hint}` : event.error;
  }
  if (event.type === "answer") {
    setChatOpen(true);
    appendMessage("assistant", event.text || "");
  }
  if (event.type === "insight") insightSummary.textContent = event.text || "";
  if (event.type === "suggests") paintSuggestItems(event.items || []);
  if (event.type === "live-brief") paintLiveBrief(event);
  if (event.type === "auto-listen") {
    armCapture({
      mic: Boolean(event.mic),
      system: Boolean(event.system),
      resume: event.paused === false,
    }).then((ok) => {
      if (ok) subtitleText.textContent = event.system
        ? "Meeting capture live"
        : "Transcribe capture live — speak now";
    });
  }
  if (event.type === "open-ask") {
    setMorphHidden(false);
    setChatOpen(true);
    if (event.text) askInput.value = event.text;
    askInput.focus();
    syncClickThrough(true);
  }
  if (event.type === "ui") {
    setMorphHidden(false);
    if (typeof event.compact === "boolean") setChatOpen(!event.compact);
    if (typeof event.chatOpen === "boolean") setChatOpen(event.chatOpen);
  }
  if (event.type === "reset-timer") {
    elapsedMs = 0;
    lastTickAt = Date.now();
  }
  if (event.type === "clicky") {
    clickyOrb && clickyOrb.classList.toggle("armed", event.state === "clicky" || event.state === "holding");
    if (event.label && subtitleText) {
      subtitleText.textContent = event.label;
    }
  }
  if (event.type === "subtitle" && event.text && subtitleText) {
    subtitleText.textContent = event.text;
  }
  if (event.type === "enquire") renderEnquire(event);
  if (event.type === "point") renderPoints(event.points, event.ttlMs, event.hold);
  if (event.type === "bg") renderBgStatus(event);
  if (event.type === "pointer") {
    answerMeta.textContent = event.mode ? `Pointer · ${event.mode}` : answerMeta.textContent;
  }
  if (event.type === "status" || event.type === "act-status") {
    // `done` is what lets a run take the pill back down. Without it the pill
    // would sit on "Working…" forever after the work finished, which is worse
    // than never showing it (R-0011).
    if (event.done) {
      hideStatusPill();
    } else {
      showStatusPill({
        title: event.title || event.label || "Working…",
        sub: event.sub || event.detail || event.phase || "",
        path: event.path || "",
        ready: Boolean(event.ready || event.path),
      });
    }
  }
  if (event.type === "word-docx" && event.path) {
    const preview = String(event.preview || "").trim();
    showStatusPill({
      title: preview ? `Document ready - ${preview}` : "Document ready",
      // The destination, not a reassurance. #19's acceptance is that the
      // customer has seen where a path goes BEFORE the Open button acts on it.
      sub: event.path,
      path: event.path,
      ready: true,
    });
  }
}

window.netieHud.on(onHudEvent);
window.__netieOnEvent = onHudEvent;

invoke("hud:ready").then(async (info) => {
  if (info?.mode) applyModeUi(info.mode, info.notesPath);
  await loadSettings();
  if (info?.listen) {
    listening = true;
    await capture.start("mic");
    setLive(true);
  } else {
    listening = false;
    setLive(false);
  }
  updateRecUi();
  setChatOpen(true);
  setMorphHidden(false);
  await fetchBucket("chat");
  syncClickThrough(true);
});

/**
 * P5-ENQUIRE — build the missing-profile form from what main asked for.
 *
 * `textContent` for every label and placeholder: these strings originate in a
 * plan, and a plan can come from a model reading the screen. Nothing here is
 * ever interpolated as HTML.
 */
const enquirePanel = $("enquire-panel");
const enquireFields = $("enquire-fields");

function renderEnquire(event) {
  if (!enquirePanel || !enquireFields) return;
  const prompts = (event && event.prompts) || [];
  if (!prompts.length) return;

  enquireFields.replaceChildren();
  prompts.forEach((prompt, i) => {
    const id = `enquire-${prompt.key}`;
    const label = document.createElement("label");
    label.className = "enquire-field";
    label.htmlFor = id;

    const caption = document.createElement("span");
    caption.textContent = prompt.label || prompt.key;
    label.appendChild(caption);

    const input = document.createElement("input");
    input.type = "text";
    input.id = id;
    input.name = prompt.key;
    input.autocomplete = "off";
    if (prompt.hint) input.placeholder = prompt.hint;
    if (i === 0) input.autofocus = true;
    label.appendChild(input);

    enquireFields.appendChild(label);
  });

  enquirePanel.hidden = false;
  setChatOpen(true);
  syncClickThrough(true);
  const first = enquireFields.querySelector("input");
  if (first) first.focus();
}

function closeEnquire() {
  if (!enquirePanel) return;
  enquirePanel.hidden = true;
  if (enquireFields) enquireFields.replaceChildren();
}

if (enquirePanel) {
  // A real form: submit fires on Enter and on the button, so there is no
  // keydown handler to get wrong.
  enquirePanel.addEventListener("submit", async (event) => {
    event.preventDefault();
    const answers = {};
    enquireFields.querySelectorAll("input[name]").forEach((input) => {
      answers[input.name] = input.value;
    });
    closeEnquire();
    answerMeta.textContent = "Saving…";
    const result = await invoke("hud:enquireSave", { answers });
    if (result && result.stillMissing && result.stillMissing.length) {
      answerMeta.textContent = `Still need: ${result.stillMissing.join(", ")}`;
    } else if (result && result.resumed) {
      answerMeta.textContent = result.ran ? "Saved — running" : "Saved — waiting for your nod";
    } else {
      answerMeta.textContent = "Saved";
    }
  });
  const cancel = $("btn-enquire-cancel");
  if (cancel) {
    cancel.addEventListener("click", () => {
      closeEnquire();
      invoke("hud:enquireCancel");
      answerMeta.textContent = "Cancelled — nothing was typed";
    });
  }
  enquirePanel.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeEnquire();
    invoke("hud:enquireCancel");
  });
}

/**
 * P3-POINT-OVERLAY — draw where Netie is pointing, then get out of the way.
 * A crosshair and a label that fade. Not a companion, not a ring that lives on
 * screen; the floating Clicky chrome was removed for good reasons.
 */
function renderPoints(points, ttlMs, hold) {
  const layer = $("point-layer");
  if (!layer) return;
  layer.innerHTML = "";
  for (const point of points || []) {
    const mark = document.createElement("div");
    const boxed = Number(point.wPct) > 0 && Number(point.hPct) > 0;
    mark.className = boxed ? "point-mark point-box" : "point-mark";
    if (boxed) {
      mark.style.left = `${point.leftPct}%`;
      mark.style.top = `${point.topPct}%`;
      mark.style.width = `${point.wPct}%`;
      mark.style.height = `${point.hPct}%`;
    } else {
      mark.style.left = `${point.xPct}%`;
      mark.style.top = `${point.yPct}%`;
    }
    const ring = document.createElement("div");
    ring.className = "point-ring";
    mark.appendChild(ring);
    if (point.label) {
      const label = document.createElement("span");
      label.className = "point-label";
      label.textContent = point.label;
      mark.appendChild(label);
    }
    layer.appendChild(mark);
  }
  clearTimeout(renderPoints._fadeTimer);
  clearTimeout(renderPoints._wipeTimer);
  if (hold || !(Number(ttlMs) > 0) || !(points || []).length) return;
  const ttl = Number(ttlMs);
  renderPoints._fadeTimer = setTimeout(() => {
    layer.querySelectorAll(".point-mark").forEach((el) => el.classList.add("fading"));
    renderPoints._wipeTimer = setTimeout(() => {
      layer.innerHTML = "";
    }, 450);
  }, ttl);
}

/** P4-BG-AGENTS — one line, bottom left, with a way to stop it. */
let bgActiveId = null;
function renderBgStatus(event) {
  const bar = $("bg-status");
  const text = $("bg-status-text");
  if (!bar || !text) return;
  const summary = event.summary || {};
  const busy = Boolean(summary.active || summary.queued);
  text.textContent = event.text || "";
  bar.classList.toggle("show", Boolean(event.text));
  if (event.job && event.job.status === "running") bgActiveId = event.job.id;
  else if (event.job && bgActiveId === event.job.id && !busy) bgActiveId = null;
  const cancel = $("btn-bg-cancel");
  if (cancel) cancel.hidden = !bgActiveId;
}
const btnBgCancel = $("btn-bg-cancel");
if (btnBgCancel) {
  btnBgCancel.addEventListener("click", () => {
    if (bgActiveId) invoke("hud:bgCancel", { id: bgActiveId });
  });
}

// On-demand demo screenshot. Replaces the old bottom-right orb, which had no
// discoverable action bound to it beyond a hold gesture.
const shotBtn = $("btn-shot");
if (shotBtn) {
  shotBtn.addEventListener("click", async () => {
    shotBtn.disabled = true;
    const prev = shotBtn.textContent;
    shotBtn.textContent = "...";
    const res = await invoke("hud:demoShot");
    const ok = res && res.ok;
    shotBtn.textContent = ok ? "Saved" : "Failed";
    answerMeta.textContent = ok
      ? `Screenshot saved to ${res.dir}`
      : `Screenshot failed: ${(res && res.error) || "unknown"}`;
    setTimeout(() => {
      shotBtn.textContent = prev;
      shotBtn.disabled = false;
    }, 1200);
  });
}
