const stage = document.getElementById("stage");
const bubbles = document.getElementById("bubbles");
const subs = document.getElementById("subs");
const orb = document.getElementById("orb");

let hideTimer = null;
const MAX_BUBBLES = 6;

function setMood(mood) {
  orb.classList.remove("thinking", "talking");
  if (mood === "thinking") orb.classList.add("thinking");
  if (mood === "talking") orb.classList.add("talking");
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

window.netieStage.onEvent((ev) => {
  if (!ev || !ev.type) return;
  if (ev.type === "layout") setLayout(ev.mode || "right");
  if (ev.type === "mood") setMood(ev.mood || "idle");
  if (ev.type === "subtitle") showSubtitle(ev.text, { ms: ev.ms, sound: ev.sound !== false });
  if (ev.type === "bubble") pushBubble(ev);
  if (ev.type === "clear") {
    bubbles.innerHTML = "";
    subs.classList.remove("visible");
    setMood("idle");
  }
});

window.netieStage.ready();
