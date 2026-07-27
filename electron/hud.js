const fab = document.getElementById("fab");
const askBubble = document.getElementById("ask-bubble");
const askInput = document.getElementById("ask-input");
const liveTranscript = document.getElementById("live-transcript");
const insightSummary = document.getElementById("insight-summary");
const answerBody = document.getElementById("answer-body");
const answerMeta = document.getElementById("answer-meta");
const wave = document.getElementById("wave");
const timerEl = document.getElementById("timer");
const btnListen = document.getElementById("btn-listen");
const btnSystem = document.getElementById("btn-system");
const btnPause = document.getElementById("btn-pause");
const hint = document.getElementById("hint");
const hudRoot = document.getElementById("hud");
const notesChip = document.getElementById("notes-chip");

let listening = true;
let systemAudio = false;
let paused = false;
let startedAt = Date.now();
let finalBits = [];
let sttEngine = null;
let appMode = "agent";

const capture = new window.NetieCapture.LiveCapture((source, samples, rate) => {
  window.netieHud.sendFrame(source, samples, rate);
});

/** Click-through: ignore mouse except while pointer is over .chrome. */
function wireClickThrough() {
  document.querySelectorAll(".chrome").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      window.netieHud.invoke("hud:setIgnoreMouse", { ignore: false });
    });
    el.addEventListener("mouseleave", () => {
      window.netieHud.invoke("hud:setIgnoreMouse", { ignore: true });
    });
  });
}
wireClickThrough();

function applyModeUi(mode, notesPath) {
  appMode = mode || "agent";
  hudRoot.classList.remove("mode-agent", "mode-transcribe", "mode-meeting");
  hudRoot.classList.add(`mode-${appMode}`);
  document.querySelectorAll("#mode-pill button").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-mode") === appMode);
  });
  if (notesPath) {
    notesChip.textContent = "Notes live";
    notesChip.title = notesPath;
  }
}

function setTranscript(text, partial = false) {
  const t = String(text || "").trim();
  liveTranscript.textContent = t || "Transcript will appear here.";
  liveTranscript.classList.toggle("has", Boolean(t));
  if (t && !partial) {
    insightSummary.textContent = `You said: “${t.slice(0, 140)}${t.length > 140 ? "…" : ""}”`;
  }
}

function tickTimer() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  timerEl.textContent = `${mm}:${ss}`;
}
setInterval(tickTimer, 500);

function setLive(on) {
  wave.classList.toggle("live", on);
  fab.classList.toggle("listening", on);
}

/** Show what is actually transcribing, so the HUD never fakes "listening". */
async function refreshEngine(force = false) {
  sttEngine = await window.netieHud.invoke("hud:sttStatus", { force });
  if (sttEngine.engine === "none") {
    answerMeta.textContent = sttEngine.label;
    setTranscript("");
    liveTranscript.textContent = sttEngine.hint || sttEngine.label;
  } else {
    answerMeta.textContent = sttEngine.label || "STT ready";
  }
  return sttEngine;
}

async function startMic() {
  const res = await capture.start("mic");
  if (!res.ok) {
    setLive(false);
    listening = false;
    btnListen.classList.remove("active");
    await window.netieHud.invoke("hud:captureFailed", { source: "mic" });
    answerMeta.textContent = /NotAllowed/i.test(res.error || "")
      ? "Mic blocked — allow microphone access in Windows settings"
      : `Mic unavailable (${res.error || "unknown"})`;
    if (window.NetieSound) NetieSound.warn();
    return false;
  }
  setLive(true);
  if (window.NetieSound) NetieSound.soft();
  return true;
}

function stopMic() {
  capture.stop("mic");
  setLive(capture.active("system"));
}

document.getElementById("mode-pill").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-mode]");
  if (!btn) return;
  const res = await window.netieHud.invoke("hud:setMode", { mode: btn.getAttribute("data-mode") });
  applyModeUi(res.mode, res.notesPath);
  if (window.NetieSound) NetieSound.pop();
});

function setMenu(open) {
  settingsMenu.classList.toggle("open", open);
  fab.classList.toggle("menu-open", open);
}

function setAsk(open) {
  askBubble.classList.toggle("open", open);
  hint.style.display = open ? "none" : "block";
  if (open) askInput.focus();
}

/**
 * The FAB is the one entry point: settings, history, frame, hide. It used to
 * just toggle a text box, which gave no hint it was pressable or what it did.
 */
fab.addEventListener("click", async () => {
  const open = !settingsMenu.classList.contains("open");
  setMenu(open);
  if (open) {
    setAsk(false);
    await loadSettings(); // reflect real values, not stale checkboxes
  }
  if (window.NetieSound) NetieSound.pop();
});

document.getElementById("btn-ask-open").addEventListener("click", () => {
  setMenu(false);
  setAsk(true);
});

/**
 * Esc unwinds one layer at a time rather than nuking everything, so it never
 * throws away a half-typed question just to close a menu.
 */
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  e.preventDefault();
  if (settingsMenu.classList.contains("open")) return setMenu(false);
  if (askBubble.classList.contains("open")) return setAsk(false);
  window.netieHud.invoke("hud:hide");
});

document.getElementById("btn-clear").addEventListener("click", () => {
  askInput.value = "";
  finalBits = [];
  setTranscript("");
});

async function doAsk() {
  const q = askInput.value.trim() || finalBits.slice(-1)[0] || "";
  if (!q) return;
  answerMeta.textContent = "Thinking…";
  answerBody.textContent = "…";
  if (window.NetieSound) NetieSound.think();
  const res = await window.netieHud.invoke("hud:ask", { message: q });
  answerMeta.textContent = res.degraded ? "Answered (degraded)" : "AI response";
  answerBody.textContent = res.ok ? res.reply || "" : res.error || "Failed";
  if (window.NetieSound) (res.ok ? NetieSound.ok : NetieSound.warn)();
}

async function doAct() {
  const q = askInput.value.trim() || finalBits.slice(-1)[0] || "";
  if (!q) return;
  answerMeta.textContent = "Planning…";
  answerBody.textContent = "Building a safe plan…";
  const res = await window.netieHud.invoke("hud:act", { message: q });
  if (!res.ok) {
    answerBody.textContent = res.reason || res.error || "Blocked";
    if (window.NetieSound) NetieSound.warn();
    return;
  }
  answerMeta.textContent = "Plan ready — approve in panel";
  answerBody.textContent = `${(res.actions || []).length} step(s). Open panel to Run safe steps.`;
  await window.netieHud.invoke("hud:openPanel");
  if (window.NetieSound) NetieSound.pop();
}

document.getElementById("btn-ask").addEventListener("click", doAsk);
document.getElementById("btn-act").addEventListener("click", doAct);
askInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    doAsk();
  }
});

document.getElementById("insight-actions").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-q]");
  if (!btn) return;
  askInput.value = btn.getAttribute("data-q");
  askBubble.classList.add("open");
  hint.style.display = "none";
  if (btn.getAttribute("data-act") === "true") doAct();
  else doAsk();
});

btnListen.addEventListener("click", async () => {
  listening = !listening;
  btnListen.classList.toggle("active", listening);
  const res = await window.netieHud.invoke("hud:toggleListen", { on: listening });
  if (listening) {
    if (await startMic()) answerMeta.textContent = res.message || "Mic on";
  } else {
    stopMic();
    answerMeta.textContent = "Mic off";
  }
});

btnSystem.addEventListener("click", async () => {
  systemAudio = !systemAudio;
  btnSystem.classList.toggle("warn-on", systemAudio);
  const res = await window.netieHud.invoke("hud:toggleSystemAudio", { on: systemAudio });
  if (!systemAudio) {
    capture.stop("system");
    setLive(capture.active("mic"));
    answerMeta.textContent = "System audio off";
    return;
  }
  const cap = await capture.start("system");
  if (!cap.ok) {
    systemAudio = false;
    btnSystem.classList.remove("warn-on");
    await window.netieHud.invoke("hud:toggleSystemAudio", { on: false });
    answerMeta.textContent = `System audio unavailable (${cap.error || "denied"})`;
    if (window.NetieSound) NetieSound.warn();
    return;
  }
  setLive(true);
  answerMeta.textContent = res.message || "System audio on";
});

btnPause.addEventListener("click", async () => {
  paused = !paused;
  btnPause.textContent = paused ? "Resume" : "Pause";
  await window.netieHud.invoke("hud:setPaused", { paused });
  if (paused) {
    capture.stopAll();
    setLive(false);
    return;
  }
  if (listening) await startMic();
  if (systemAudio) await capture.start("system");
});

document.getElementById("btn-hide").addEventListener("click", () => {
  window.netieHud.invoke("hud:hide");
});

document.getElementById("btn-frame").addEventListener("click", () => {
  window.netieHud.invoke("hud:frameRegion");
});

const settingsMenu = document.getElementById("settings-menu");
const nodToast = document.getElementById("nod-toast");
const setAuto = document.getElementById("set-auto");
const setNod = document.getElementById("set-nod");
const setCursor = document.getElementById("set-cursor");
const setMd = document.getElementById("set-md");
const setPy = document.getElementById("set-py");

async function loadSettings() {
  const res = await window.netieHud.invoke("hud:getSettings");
  const s = (res && res.settings) || {};
  setAuto.checked = s.autoRunSensible !== false;
  setNod.checked = s.nodConfirm !== false;
  setCursor.checked = s.cursorBubble !== false;
  setMd.checked = s.saveAllMarkdown !== false;
  setPy.checked = s.runPythonChecks !== false;
}

async function saveSettingsFromUi() {
  await window.netieHud.invoke("hud:setSettings", {
    settings: {
      autoRunSensible: setAuto.checked,
      nodConfirm: setNod.checked,
      cursorBubble: setCursor.checked,
      saveAllMarkdown: setMd.checked,
      runPythonChecks: setPy.checked,
    },
  });
}

document.getElementById("btn-more").addEventListener("click", async () => {
  // Same menu as the FAB — keep the open/close state in one place.
  const open = !settingsMenu.classList.contains("open");
  setMenu(open);
  if (open) await loadSettings();
});

[setAuto, setNod, setCursor, setMd, setPy].forEach((el) => {
  el.addEventListener("change", saveSettingsFromUi);
});

document.getElementById("btn-canvas").addEventListener("click", () => {
  window.netieHud.invoke("hud:openCanvas");
  settingsMenu.classList.remove("open");
});

document.getElementById("btn-affirm").addEventListener("click", () => {
  window.netieHud.invoke("hud:affirm");
});

document.getElementById("btn-nod-go").addEventListener("click", () => {
  window.netieHud.invoke("hud:affirm");
});

window.netieHud.on((ev) => {
  if (!ev || !ev.type) return;
  if (ev.type === "mode") {
    applyModeUi(ev.mode, ev.notesPath);
    answerMeta.textContent = `${ev.label || ev.mode} mode`;
  }
  if (ev.type === "nod-wait") {
    nodToast.classList.toggle("show", ev.on !== false);
  }
  if (ev.type === "transcript") {
    finalBits.push(ev.text);
    if (finalBits.length > 12) finalBits = finalBits.slice(-12);
    setTranscript(finalBits.join(" "));
    if (appMode === "agent") askInput.value = ev.text;
    if (ev.engine && sttEngine) sttEngine.engine = ev.engine;
    liveTranscript.classList.toggle("rough", Boolean(ev.rough));
    if (ev.rough) {
      answerMeta.textContent = "Heard roughly — check the text before Do it";
    } else if (ev.language) {
      answerMeta.textContent = `Heard (${ev.language}${ev.engine ? ` · ${ev.engine}` : ""})`;
    }
  }
  if (ev.type === "stt-busy") wave.classList.toggle("thinking", Boolean(ev.busy));
  if (ev.type === "stt-error") {
    answerMeta.textContent = ev.hint ? `${ev.error} — ${ev.hint}` : ev.error;
  }
  if (ev.type === "answer") {
    answerMeta.textContent = ev.meta || "AI response";
    answerBody.textContent = ev.text || "";
  }
  if (ev.type === "insight") insightSummary.textContent = ev.text || "";
  if (ev.type === "open-ask") {
    askBubble.classList.add("open");
    hint.style.display = "none";
    if (ev.text) askInput.value = ev.text;
  }
  if (ev.type === "reset-timer") startedAt = Date.now();
});

window.netieHud.invoke("hud:ready").then(async (info) => {
  await refreshEngine();
  await loadSettings();
  if (info && info.listen !== false) await startMic();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) capture.stopAll();
});
