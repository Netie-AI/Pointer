/**
 * Soft UI sounds — tiny Web Audio beeps (no asset files).
 */
(function (root) {
  let ctx = null;
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function tone(freq, dur, type, gain) {
    try {
      const c = ac();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || "sine";
      o.frequency.value = freq;
      g.gain.value = gain ?? 0.04;
      o.connect(g);
      g.connect(c.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.stop(c.currentTime + dur);
    } catch {
      /* autoplay / headless */
    }
  }
  root.NetieSound = {
    pop: () => tone(880, 0.08, "triangle", 0.035),
    soft: () => tone(520, 0.12, "sine", 0.03),
    ok: () => {
      tone(660, 0.07, "sine", 0.03);
      setTimeout(() => tone(880, 0.1, "sine", 0.03), 70);
    },
    think: () => tone(320, 0.15, "triangle", 0.025),
    warn: () => tone(240, 0.18, "square", 0.02),
  };
})(window);
