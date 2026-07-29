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
const clickyOrb = $("btn-clicky");
const peekDrop = $("peek-drop");
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
let dockOffset = { x: 0, y: 0 };
let insightOffset = { x: 0, y: 0 };
let dragState = null;
let clickyHoldTimer = null;
let agentBusy = false;
let peekTimer = null;

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
    syncClickThrough(true);
  }
}

function setMorphHidden(hidden) {
  hudRoot.classList.toggle("morph-hidden", Boolean(hidden));
  hudRoot.classList.remove("peeking");
  setMenu(false);
  if (hidden) {
    roulettePanel.classList.remove("open");
    syncClickThrough(false);
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
  hudRoot.classList.remove("mode-agent", "mode-transcribe", "mode-meeting");
  hudRoot.classList.add(`mode-${appMode}`);
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
    },
  });
}

function setMenu(open) {
  settingsMenu.classList.toggle("open", Boolean(open));
  $("btn-more").setAttribute("aria-expanded", String(Boolean(open)));
}

function applyDockTransform() {
  if (!hudRoot.classList.contains("chat-open")) return;
  chatDock.style.transform = `translate(calc(-20% + ${dockOffset.x}px), ${dockOffset.y}px) scale(1)`;
}

function applyInsightTransform() {
  if (!hudRoot.classList.contains("chat-open")) return;
  const panel = $("insight-panel");
  if (!panel) return;
  panel.style.transform = `translate(${insightOffset.x}px, ${insightOffset.y}px)`;
}

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
      const nearTop = event.clientY < 28;
      if (nearTop) {
        hudRoot.classList.add("peeking");
        syncClickThrough(true);
      } else if (!event.target.closest("#peek-drop")) {
        hudRoot.classList.remove("peeking");
        syncClickThrough(false);
      }
      return;
    }
    syncClickThrough(hitChrome(event.target));
    if (!dragState) return;
    const dx = event.screenX - dragState.startX;
    const dy = event.screenY - dragState.startY;
    if (dragState.target === "chat") {
      dockOffset.x = dragState.originX + dx;
      dockOffset.y = dragState.originY + dy;
      applyDockTransform();
    } else if (dragState.target === "insight") {
      insightOffset.x = dragState.originX + dx;
      insightOffset.y = dragState.originY + dy;
      applyInsightTransform();
    }
  },
  true
);
document.addEventListener("pointerdown", (event) => syncClickThrough(hitChrome(event.target)), true);
document.addEventListener("pointerleave", () => {
  if (!dragState && hudRoot.classList.contains("morph-hidden")) {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      hudRoot.classList.remove("peeking");
      syncClickThrough(false);
    }, 400);
  } else if (!dragState) syncClickThrough(false);
}, true);
document.addEventListener("pointerup", () => {
  dragState = null;
});

$("chat-drag").addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (event.target.closest("button")) return;
  dragState = {
    target: "chat",
    startX: event.screenX,
    startY: event.screenY,
    originX: dockOffset.x,
    originY: dockOffset.y,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
});
const insightDrag = $("insight-drag");
if (insightDrag) {
  insightDrag.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button")) return;
    dragState = {
      target: "insight",
      startX: event.screenX,
      startY: event.screenY,
      originX: insightOffset.x,
      originY: insightOffset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  });
}
const btnChatClose = $("btn-chat-close");
if (btnChatClose) btnChatClose.addEventListener("click", () => setChatOpen(false));
const btnShowTranscript = $("btn-show-transcript");
if (btnShowTranscript) {
  btnShowTranscript.addEventListener("click", () => {
    setChatOpen(true);
    askInput.focus();
  });
}

async function doAsk() {
  const message = askInput.value.trim() || finalBits.slice(-1)[0] || "";
  if (!message) return;
  setChatOpen(true);
  appendMessage("user", message, true);
  askInput.value = "";
  setLivePartial("");
  answerMeta.textContent = "Thinking…";
  answerBody.textContent = "…";
  if (window.NetieSound) NetieSound.think();
  const result = await invoke("hud:ask", { message });
  answerMeta.textContent = result.degraded ? "Answered (degraded)" : "AI response";
  appendMessage("assistant", result.ok ? result.reply || "" : result.error || "Failed");
  answerBody.textContent = "";
  if (window.NetieSound) (result.ok ? NetieSound.ok : NetieSound.warn)();
}

async function doAct() {
  const message = askInput.value.trim() || finalBits.slice(-1)[0] || "";
  if (!message) return;
  setChatOpen(true);
  appendMessage("user", message, true);
  askInput.value = "";
  answerMeta.textContent = "Planning…";
  const result = await invoke("hud:act", { message });
  if (!result.ok) {
    appendMessage("assistant", result.reason || result.error || "Blocked");
    if (window.NetieSound) NetieSound.warn();
    return;
  }
  const n = (result.actions || []).length;
  appendMessage(
    "assistant",
    result.ran ? `${n} step(s) running.` : `${n} step(s) ready — nod / Affirm / Ctrl+Y.`
  );
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

peekDrop.addEventListener("click", () => {
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
});
$("btn-act").addEventListener("click", doAct);
$("btn-add-sub").addEventListener("click", () => addTextToChat(latestSystemSubtitle, true));
$("insight-actions").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-q]");
  if (!button) return;
  askInput.value = button.dataset.q;
  doAsk();
});
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
    subtitleText.textContent =
      result.mode === "meeting"
        ? "Meeting — mic + system audio armed"
        : "Transcribe — mic armed, speak now";
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

clickyOrb.addEventListener("pointerdown", async (event) => {
  if (event.button !== 0) return;
  clickyOrb.classList.add("armed");
  clickyHoldTimer = "holding";
  await invoke("hud:clickyHold", { phase: "start" });
});
const endClickyHold = async (commit) => {
  if (!clickyHoldTimer) return;
  clickyHoldTimer = null;
  await invoke("hud:clickyHold", { phase: commit ? "end" : "cancel" });
};
clickyOrb.addEventListener("pointerup", () => endClickyHold(true));
clickyOrb.addEventListener("pointercancel", () => endClickyHold(false));
clickyOrb.addEventListener("dblclick", async () => {
  clickyOrb.classList.remove("armed");
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

window.netieHud.on((event) => {
  if (!event?.type) return;
  if (event.type === "mode") applyModeUi(event.mode, event.notesPath);
  if (event.type === "nod-wait") nodToast.classList.toggle("show", event.on !== false);
  if (event.type === "plan-running") setAgentBusy(event.on !== false);
  if (event.type === "transcript") {
    if (event.modeSwitchOnly) return;
    const text = String(event.text || "").trim();
    const source = event.source === "system" ? "system" : "mic";
    if (source === "system") {
      latestSystemSubtitle = text;
      subtitleText.textContent = text || "No system-audio subtitle yet.";
    } else if (event.partial) {
      setLivePartial(text);
      if (text) setChatOpen(true);
    } else if (text) {
      finalBits.push(text);
      if (finalBits.length > 12) finalBits = finalBits.slice(-12);
      setLivePartial("");
      setChatOpen(true);
      appendMessage("user", text);
      // Put the words in the box you are about to send. They only lived in the
      // chat log before, so the Ask field looked empty and speaking read as
      // "nothing happened" — even though Ask/Do it silently fell back to the
      // last transcript. Accumulate so two sentences make one instruction.
      const existing = askInput.value.trim();
      askInput.value = existing ? `${existing} ${text}` : text;
      askInput.scrollTop = askInput.scrollHeight;
    }
  }
  if (event.type === "stt-busy") wave.classList.toggle("thinking", Boolean(event.busy));
  if (event.type === "stt-error") {
    answerMeta.textContent = event.hint ? `${event.error} — ${event.hint}` : event.error;
  }
  if (event.type === "answer") {
    setChatOpen(true);
    appendMessage("assistant", event.text || "");
  }
  if (event.type === "insight") insightSummary.textContent = event.text || "";
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
    clickyOrb.classList.toggle("armed", event.state === "clicky" || event.state === "holding");
  }
  if (event.type === "pointer") {
    answerMeta.textContent = event.mode ? `Pointer · ${event.mode}` : answerMeta.textContent;
  }
});

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
