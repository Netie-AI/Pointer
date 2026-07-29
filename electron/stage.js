const stage = document.getElementById("stage");
const bubbles = document.getElementById("bubbles");
const subs = document.getElementById("subs");
const orb = document.getElementById("orb");
const matrix = document.getElementById("matrix");
const cursorBubble = document.getElementById("cursor-bubble");
const cursorBody = document.getElementById("cursor-body");
const cursorLabel = document.getElementById("cursor-label");
const nodBanner = document.getElementById("nod-banner");

let hideTimer = null;
const MAX_BUBBLES = 6;
let cursorSteps = [];
let cursorStepIdx = 0;
let matrixSeeded = false;

function seedMatrix() {
  if (!matrix || matrixSeeded) return;
  matrixSeeded = true;
  const glyphs = "01アイウエオカキクケコサシスセソタチツテトナニヌネノﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ<>/+*#";
  for (let i = 0; i < 18; i += 1) {
    const span = document.createElement("span");
    let text = "";
    const len = 10 + Math.floor(Math.random() * 14);
    for (let j = 0; j < len; j += 1) text += glyphs[Math.floor(Math.random() * glyphs.length)];
    span.textContent = text;
    span.style.left = `${4 + i * 5.4}%`;
    span.style.animationDuration = `${3.2 + (i % 7) * 0.45}s`;
    span.style.animationDelay = `${(i % 5) * 0.35}s`;
    matrix.appendChild(span);
  }
}

function setMood(mood) {
  orb.classList.remove("thinking", "talking", "crazy");
  if (mood === "thinking" || mood === "crazy_smile") orb.classList.add("thinking");
  if (mood === "talking" || mood === "soft_smile" || mood === "smile") orb.classList.add("talking");
  if (mood === "crazy" || mood === "crazy_smile") orb.classList.add("crazy");
}

function setPresence({ mood, label, crazy, matrix: matrixOn } = {}) {
  if (mood) setMood(mood === "crazy_smile" ? "crazy" : mood);
  if (label) cursorLabel.textContent = label;
  cursorBubble.classList.toggle("working", Boolean(crazy));
  if (matrix) {
    if (matrixOn) {
      seedMatrix();
      matrix.classList.add("on");
    } else {
      matrix.classList.remove("on");
    }
  }
}

function setLayout(mode) {
  stage.classList.toggle("layout-below", mode === "below");
}

function showSubtitle(text, { ms = 4500, sound = true } = {}) {
  const t = String(text || "").trim();
  if (!t) {
    subs.classList.remove("visible");
    subs.classList.add("hidden-empty");
    return;
  }
  subs.textContent = t;
  subs.classList.remove("hidden-empty");
  subs.classList.add("visible");
  setMood("talking");
  if (sound && window.NetieSound) NetieSound.soft();
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    subs.classList.remove("visible");
    setMood("idle");
  }, ms);
}

function pushBubble({ role, text, sound = true }) {
  const el = document.createElement("div");
  el.className = `bubble ${role === "user" ? "user" : "netie"}`;
  el.textContent = String(text || "").slice(0, 500);
  bubbles.appendChild(el);
  while (bubbles.children.length > MAX_BUBBLES) bubbles.removeChild(bubbles.firstChild);
  if (sound && window.NetieSound) NetieSound.pop();
  if (role !== "user") setMood("talking");
}

function renderCursorBody() {
  if (!cursorSteps.length) {
    cursorBody.textContent = "";
    return;
  }
  cursorBody.innerHTML = "";
  cursorSteps.forEach((s, i) => {
    const row = document.createElement("span");
    row.className = "step" + (i === cursorStepIdx ? " active" : "");
    row.textContent = `${i + 1}. ${s}`;
    cursorBody.appendChild(row);
  });
  cursorBubble.classList.toggle("grow", cursorSteps.length >= 3 || String(cursorSteps.join("")).length > 80);
}

function showCursorGuide({ steps, label, text, x, y } = {}) {
  if (Array.isArray(steps) && steps.length) {
    cursorSteps = steps.map((s) => String(s).slice(0, 120));
    cursorStepIdx = 0;
  } else if (text) {
    cursorSteps = [String(text).slice(0, 280)];
    cursorStepIdx = 0;
  }
  if (label) cursorLabel.textContent = label;
  renderCursorBody();
  cursorBubble.classList.add("visible");
  if (typeof x === "number" && typeof y === "number") {
    cursorBubble.style.left = `${Math.max(8, x)}px`;
    cursorBubble.style.top = `${Math.max(8, y)}px`;
  }
  setMood("talking");
}

function moveCursorGuide({ x, y, stepIndex } = {}) {
  if (typeof x === "number") cursorBubble.style.left = `${Math.max(8, x)}px`;
  if (typeof y === "number") cursorBubble.style.top = `${Math.max(8, y)}px`;
  if (typeof stepIndex === "number") {
    cursorStepIdx = stepIndex;
    renderCursorBody();
  }
  cursorBubble.classList.add("visible");
}

function hideCursorGuide() {
  cursorBubble.classList.remove("visible", "grow", "working");
  cursorSteps = [];
}

window.netieStage.onEvent((ev) => {
  if (!ev || !ev.type) return;
  if (ev.type === "layout") setLayout(ev.mode || "right");
  if (ev.type === "mood") setMood(ev.mood || "idle");
  if (ev.type === "presence") setPresence(ev);
  if (ev.type === "subtitle") showSubtitle(ev.text, { ms: ev.ms, sound: ev.sound !== false });
  if (ev.type === "bubble") pushBubble(ev);
  if (ev.type === "cursor-guide") showCursorGuide(ev);
  if (ev.type === "cursor-move") moveCursorGuide(ev);
  if (ev.type === "cursor-hide") hideCursorGuide();
  if (ev.type === "nod-wait") {
    nodBanner.textContent = ev.text || "Nod · say “yes” · or press Y";
    nodBanner.classList.toggle("visible", ev.on !== false);
  }
  if (ev.type === "clear") {
    bubbles.innerHTML = "";
    subs.classList.remove("visible");
    hideCursorGuide();
    nodBanner.classList.remove("visible");
    if (matrix) matrix.classList.remove("on");
    setMood("idle");
  }
});

window.netieStage.ready();
