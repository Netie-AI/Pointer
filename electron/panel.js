const thumb = document.getElementById("thumb");
const thumbPlaceholder = document.getElementById("thumb-placeholder");
const messageEl = document.getElementById("message");
const replyEl = document.getElementById("reply");
const statusEl = document.getElementById("status");
const sendBtn = document.getElementById("send-btn");
const recaptureBtn = document.getElementById("recapture-btn");
const hotkeyLabel = document.getElementById("hotkey-label");

let lastDataUrl = null;

function setStatus(text, isError) {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("error", !!isError);
}

function showThumb(dataUrl) {
  lastDataUrl = dataUrl || null;
  if (!dataUrl) {
    thumb.hidden = true;
    thumbPlaceholder.hidden = false;
    return;
  }
  thumb.src = dataUrl;
  thumb.hidden = false;
  thumbPlaceholder.hidden = true;
}

async function refreshInfo() {
  try {
    const info = await window.netieClick.getAppInfo();
    if (info.hotkey) hotkeyLabel.textContent = info.hotkey.replace("Control", "Ctrl");
    if (info.state && info.state !== "IDLE") {
      setStatus(`Session ${info.state} · ${info.ticks || 0} hot ticks`);
    }
  } catch {
    /* ignore */
  }
}

window.netieClick.onHotkeyFired((payload) => {
  if (payload && payload.dataUrl) showThumb(payload.dataUrl);
  setStatus("Region captured — ask Netie what to do");
  messageEl.focus();
});

window.netieClick.onState((payload) => {
  if (payload?.hotkey) {
    hotkeyLabel.textContent = String(payload.hotkey).replace("Control", "Ctrl");
  }
  if (payload?.state === "SELECTING") {
    setStatus("Drag on screen to frame a region…");
  } else if (payload?.state === "ARMED") {
    setStatus("Armed — drag a frame or Esc");
  }
});

window.netieClick.onError((payload) => {
  setStatus(payload?.message || "Error", true);
});

recaptureBtn.addEventListener("click", async () => {
  setStatus("Capturing…");
  const res = await window.netieClick.captureNow();
  if (!res.ok) setStatus(res.error || "Capture failed", true);
});

sendBtn.addEventListener("click", async () => {
  const message = messageEl.value.trim();
  if (!message) {
    setStatus("Type an instruction first", true);
    return;
  }
  sendBtn.disabled = true;
  setStatus("Talking to OpenVault…");
  replyEl.textContent = "…";
  try {
    const res = await window.netieClick.askBuddy({
      message,
      dataUrl: lastDataUrl,
    });
    if (!res.ok) {
      replyEl.textContent = "";
      setStatus(res.error || "Ask failed", true);
    } else {
      replyEl.textContent = res.reply || "";
      setStatus("Done");
    }
  } catch (e) {
    setStatus(String(e.message || e), true);
  } finally {
    sendBtn.disabled = false;
  }
});

refreshInfo();
setStatus("Press Ctrl+Space, then drag a frame on screen");
