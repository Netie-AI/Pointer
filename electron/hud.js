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

let listening = true;
let systemAudio = false;
let paused = false;
let startedAt = Date.now();
let recognition = null;
let finalBits = [];

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

function startBrowserSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setTranscript("(SpeechRecognition unavailable — type instead)");
    return;
  }
  stopBrowserSpeech();
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalBits.push(r[0].transcript.trim());
      else interim += r[0].transcript;
    }
    const line = [...finalBits, interim].filter(Boolean).join(" ");
    setTranscript(line, !ev.results[ev.results.length - 1].isFinal);
    if (interim && askBubble.classList.contains("open") && !askInput.value) {
      askInput.placeholder = interim;
    }
    // Auto-fill ask box with latest final utterance
    if (finalBits.length) askInput.value = finalBits[finalBits.length - 1];
  };
  recognition.onerror = () => {
    wave.classList.remove("live");
    fab.classList.remove("listening");
  };
  recognition.onend = () => {
    if (listening && !paused) {
      try {
        recognition.start();
      } catch {
        /* already started */
      }
    }
  };
  try {
    recognition.start();
    wave.classList.add("live");
    fab.classList.add("listening");
    if (window.NetieSound) NetieSound.soft();
  } catch {
    /* permission */
  }
}

function stopBrowserSpeech() {
  if (recognition) {
    try {
      recognition.onend = null;
      recognition.stop();
    } catch {
      /* ok */
    }
  }
  recognition = null;
  wave.classList.remove("live");
  fab.classList.remove("listening");
}

fab.addEventListener("click", () => {
  askBubble.classList.toggle("open");
  hint.style.display = askBubble.classList.contains("open") ? "none" : "block";
  if (askBubble.classList.contains("open")) {
    askInput.focus();
    if (window.NetieSound) NetieSound.pop();
  }
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
  if (listening) startBrowserSpeech();
  else stopBrowserSpeech();
  answerMeta.textContent = res.message || (listening ? "Mic on" : "Mic off");
});

btnSystem.addEventListener("click", async () => {
  systemAudio = !systemAudio;
  btnSystem.classList.toggle("warn-on", systemAudio);
  const res = await window.netieHud.invoke("hud:toggleSystemAudio", { on: systemAudio });
  answerMeta.textContent = res.message || (systemAudio ? "System audio requested" : "System audio off");
  if (!res.ok && window.NetieSound) NetieSound.warn();
});

btnPause.addEventListener("click", async () => {
  paused = !paused;
  btnPause.textContent = paused ? "Resume" : "Pause";
  await window.netieHud.invoke("hud:setPaused", { paused });
  if (paused) stopBrowserSpeech();
  else if (listening) startBrowserSpeech();
});

document.getElementById("btn-hide").addEventListener("click", () => {
  window.netieHud.invoke("hud:hide");
});

document.getElementById("btn-frame").addEventListener("click", () => {
  window.netieHud.invoke("hud:frameRegion");
});

window.netieHud.on((ev) => {
  if (!ev || !ev.type) return;
  if (ev.type === "transcript") setTranscript(ev.text, ev.partial);
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

window.netieHud.invoke("hud:ready").then((info) => {
  if (info && info.listen !== false) startBrowserSpeech();
});
