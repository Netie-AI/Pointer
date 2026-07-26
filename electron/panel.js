const thumb = document.getElementById("thumb");
const thumbPlaceholder = document.getElementById("thumb-placeholder");
const messageEl = document.getElementById("message");
const replyEl = document.getElementById("reply");
const statusEl = document.getElementById("status");
const goBtn = document.getElementById("go-btn");
const approveBtn = document.getElementById("approve-btn");
const abortBtn = document.getElementById("abort-btn");
const recaptureBtn = document.getElementById("recapture-btn");
const hotkeyLabel = document.getElementById("hotkey-label");
const bannerEl = document.getElementById("banner");
const planSection = document.getElementById("plan-section");
const planSteps = document.getElementById("plan-steps");
const helpImprove = document.getElementById("help-improve");
const memCount = document.getElementById("mem-count");
const brainBadge = document.getElementById("brain-badge");
const mascot = document.getElementById("mascot");
const layoutBtn = document.getElementById("layout-btn");
const saveBtn = document.getElementById("save-btn");
const folderBtn = document.getElementById("folder-btn");
const spaceBtn = document.getElementById("space-btn");
const chatsEl = document.getElementById("chats");

let lastDataUrl = null;
let lastPlan = null;
let bubbleMode = "right";

function setBusy(on) {
  if (mascot) mascot.classList.toggle("busy", !!on);
  if (on && window.NetieSound) NetieSound.think();
}

function setStatus(text, isError) {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("error", !!isError);
}

function setBanner(text, kind) {
  if (!text) {
    bannerEl.classList.remove("visible", "blocked");
    bannerEl.textContent = "";
    return;
  }
  bannerEl.textContent = text;
  bannerEl.classList.add("visible");
  bannerEl.classList.toggle("blocked", kind === "blocked");
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

function dispositionLabel(s) {
  if (!s) return "";
  if (s.disposition === "auto") return "auto";
  if (s.disposition === "approve") return s.irreversible ? "needs you · irreversible" : "needs you";
  if (s.disposition === "custody") return "you type this (secret)";
  if (s.disposition === "refuse") return "blocked";
  return s.disposition;
}

function renderPlan(plan) {
  lastPlan = plan;
  planSteps.innerHTML = "";
  if (!plan || !plan.ok) {
    planSection.classList.remove("visible");
    return;
  }
  planSection.classList.add("visible");
  (plan.actions || []).forEach((a, i) => {
    const row = document.createElement("div");
    const s = a.safety || {};
    row.className = "plan-step";
    if (s.irreversible) row.classList.add("irreversible");
    if (s.disposition === "custody") row.classList.add("custody");
    if (s.disposition === "refuse") row.classList.add("refuse");

    const check = document.createElement("input");
    check.type = "checkbox";
    check.dataset.idx = String(i);
    check.disabled = s.disposition !== "approve";
    check.checked =
      s.disposition === "auto" || (s.disposition === "approve" && !s.irreversible);

    const text = document.createElement("div");
    text.style.flex = "1";
    text.textContent = `${i + 1}. ${a.type} ${a.target || a.field || ""}${
      a.value ? ` = ${a.value}` : ""
    }  ·  ${dispositionLabel(s)}`;

    row.appendChild(check);
    row.appendChild(text);
    planSteps.appendChild(row);
  });
}

function setFleetUi(on) {
  helpImprove.checked = !!on;
  brainBadge.textContent = on ? "Dual Brain · on" : "Dual Brain · paused";
  brainBadge.classList.toggle("off", !on);
}

async function refreshInfo() {
  try {
    const info = await window.netieClick.getAppInfo();
    if (info.hotkey) hotkeyLabel.textContent = info.hotkey.replace("Control", "Ctrl");
    if (info.state && info.state !== "IDLE") {
      setStatus(`Session ${info.state} · ${info.ticks || 0} hot ticks`);
    }
    if (info.cortexOnline === false) {
      setBanner("Cortex offline — I can still answer, but I won't act until it's back.", "warn");
    }
    if (info.brain) {
      memCount.textContent = `Memory · ${info.brain.memoryCount || 0}`;
      setFleetUi(info.brain.fleetOn !== false);
    }
  } catch {
    /* ignore when opened outside Electron */
  }
}

window.netieClick.onHotkeyFired((payload) => {
  if (payload && payload.dataUrl) showThumb(payload.dataUrl);
  setStatus("Got it — tell me what you want, then Go");
  messageEl.focus();
});

window.netieClick.onState((payload) => {
  if (payload?.hotkey) {
    hotkeyLabel.textContent = String(payload.hotkey).replace("Control", "Ctrl");
  }
  if (payload?.aborted) {
    setStatus("Stopped — Esc / hotkey abort");
    setBanner("Plan aborted.", "warn");
    return;
  }
  if (payload?.state === "SELECTING") setStatus("Drag on screen to frame a region…");
  else if (payload?.state === "ARMED") setStatus("Armed — drag a frame or Esc");
});

window.netieClick.onError((payload) => {
  setStatus(payload?.message || "Error", true);
});

recaptureBtn.addEventListener("click", async () => {
  setStatus("Capturing…");
  const res = await window.netieClick.captureNow();
  if (!res.ok) setStatus(res.error || "Capture failed", true);
});

async function runGo() {
  const message = messageEl.value.trim();
  if (!message) {
    setStatus("Type what you want — I'll figure out the rest", true);
    return;
  }
  goBtn.disabled = true;
  setBusy(true);
  setStatus("On it…");
  setBanner("");
  replyEl.textContent = "…";
  renderPlan(null);
  try {
    const res = await window.netieClick.go({ message, dataUrl: lastDataUrl });
    if (res.mode === "ask") {
      if (!res.ok) {
        replyEl.textContent = "";
        setStatus(res.error || "Failed", true);
        if (window.NetieSound) NetieSound.warn();
        if (res.blocked) setBanner(res.error || "Blocked", "blocked");
        else if (res.degraded) setBanner("Answered without Cortex gate.", "warn");
      } else {
        replyEl.textContent = res.reply || "";
        setStatus("Done");
        if (window.NetieSound) NetieSound.ok();
        if (res.degraded) setBanner("Degraded mode — Cortex was unreachable.", "warn");
      }
      return;
    }

    if (!res.ok) {
      setStatus(res.reason || "Plan blocked", true);
      setBanner(res.reason || "Blocked", "blocked");
      replyEl.textContent = res.reason || "";
      if (window.NetieSound) NetieSound.warn();
      return;
    }
    renderPlan(res);
    const irreversible = (res.actions || []).some((a) => a.safety && a.safety.irreversible);
    replyEl.textContent = res.needsApproval
      ? irreversible
        ? "I prepared steps. Irreversible ones stay unchecked — you decide."
        : "Looks safe. Hit Run safe steps when ready."
      : "Only read steps — Run to finish.";
    setStatus(`${(res.actions || []).length} step(s) ready`);
    if (window.NetieSound) NetieSound.pop();
  } catch (e) {
    setStatus(String(e.message || e), true);
  } finally {
    goBtn.disabled = false;
    setBusy(false);
    refreshInfo();
  }
}

goBtn.addEventListener("click", runGo);
messageEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    runGo();
  }
});

approveBtn.addEventListener("click", async () => {
  if (!lastPlan) return;
  const approvedIndexes = [];
  planSteps.querySelectorAll("input[type=checkbox]").forEach((el) => {
    if (el.checked && !el.disabled) approvedIndexes.push(Number(el.dataset.idx));
  });
  approveBtn.disabled = true;
  setStatus("Running…");
  try {
    const res = await window.netieClick.approvePlan({
      approvedIndexes,
      approveAllSafe: true,
    });
    const lines = (res.results || []).map((r) => {
      if (r.skipped) return `· skipped: ${r.skipped}`;
      return `· ${r.message || "ok"}`;
    });
    replyEl.textContent = lines.join("\n") || "Done";
    setStatus("Finished");
  } catch (e) {
    setStatus(String(e.message || e), true);
  } finally {
    approveBtn.disabled = false;
    refreshInfo();
  }
});

abortBtn.addEventListener("click", async () => {
  await window.netieClick.abortPlan();
  setStatus("Stopped");
});

helpImprove.addEventListener("change", async () => {
  const on = helpImprove.checked;
  const res = await window.netieClick.setConsent({
    outcome_telemetry: on,
    training_feedback: on,
    session_sketches: on,
  });
  if (!res.ok) {
    helpImprove.checked = !on;
    setStatus(res.error || "Could not save", true);
    return;
  }
  setFleetUi(on);
  setStatus(
    on
      ? "Dual Brain learning on — strengthens Netie for everyone. Personal memory stays on your PC."
      : "Fleet learning paused. Personal assistant memory still works offline."
  );
  if (on) window.netieClick.flushTelemetry({ reason: "consent-on" }).catch(() => {});
});

async function refreshChats() {
  try {
    const res = await window.netieClick.listConversations();
    if (!res.ok || !res.items || !res.items.length) {
      chatsEl.classList.remove("visible");
      chatsEl.innerHTML = "";
      return;
    }
    chatsEl.classList.add("visible");
    chatsEl.innerHTML = "";
    res.items.slice(0, 8).forEach((item) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `${item.title} · ${item.turns || 0} turns`;
      b.title = item.file;
      b.addEventListener("click", async () => {
        await window.netieClick.revealConversations(item.file);
        setStatus("Opened in Explorer");
      });
      chatsEl.appendChild(b);
    });
  } catch {
    /* ignore */
  }
}

layoutBtn.addEventListener("click", async () => {
  bubbleMode = bubbleMode === "right" ? "below" : "right";
  await window.netieClick.setStageLayout(bubbleMode);
  layoutBtn.textContent = bubbleMode === "below" ? "Bubbles↓" : "Bubbles→";
  setStatus(bubbleMode === "below" ? "Bubbles under the subtitle" : "Bubbles on the right");
  if (window.NetieSound) NetieSound.pop();
});

saveBtn.addEventListener("click", async () => {
  const res = await window.netieClick.saveConversation({});
  if (!res.ok) {
    setStatus(res.error || "Nothing to save", true);
    return;
  }
  setStatus(`Saved ${res.id}.md`);
  if (window.NetieSound) NetieSound.ok();
  refreshChats();
});

folderBtn.addEventListener("click", async () => {
  await window.netieClick.revealConversations();
  setStatus("Conversations folder in Explorer");
});

spaceBtn.addEventListener("click", async () => {
  const res = await window.netieClick.openInSpace();
  setStatus(res.ok ? "Folder ready for Netie Space" : res.error || "Failed", !res.ok);
});

refreshInfo();
refreshChats();
setStatus("Press Ctrl+Space, frame a region, then Go");
