const subs = document.getElementById("subs");
const nodBanner = document.getElementById("nod-banner");

let hideTimer = null;

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
  if (sound && window.NetieSound) NetieSound.soft();
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    subs.classList.remove("visible");
  }, ms);
}

window.netieStage.onEvent((ev) => {
  if (!ev || !ev.type) return;
  // Bubbles / orb / matrix / cursor-guide intentionally ignored — pointer is the identity.
  if (ev.type === "subtitle") showSubtitle(ev.text, { ms: ev.ms, sound: ev.sound !== false });
  if (ev.type === "nod-wait") {
    nodBanner.textContent = ev.text || 'Nod · say "yes" · or press Y';
    nodBanner.classList.toggle("visible", ev.on !== false);
  }
  if (ev.type === "clear") {
    subs.classList.remove("visible");
    nodBanner.classList.remove("visible");
  }
});

window.netieStage.ready();
