"use strict";
/**
 * OpenWillow-class hold-to-talk. Electron globalShortcut only fires on press,
 * so after listen starts we poll key state and stop on release. Dry-run and
 * Linux never report a physical hold, so those stay tap-to-toggle.
 */

const DICTATE_HOLD_VKS = Object.freeze([0x11, 0x12, 0x20]); // Ctrl, Alt, Space

function createHoldMonitor(opts = {}) {
  const intervalMs = Number(opts.intervalMs) > 0 ? Number(opts.intervalMs) : 40;
  const poll = opts.poll;
  const onRelease = opts.onRelease;
  const setInt = typeof opts.setInterval === "function" ? opts.setInterval : setInterval;
  const clearInt = typeof opts.clearInterval === "function" ? opts.clearInterval : clearInterval;
  let timer = null;
  let armed = false;
  let seenDown = false;

  function stop() {
    armed = false;
    seenDown = false;
    if (timer != null) {
      clearInt(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    if (typeof poll !== "function") return { ok: false, reason: "no poll" };
    armed = true;
    timer = setInt(() => {
      Promise.resolve(poll())
        .then((sample) => {
          if (!armed) return;
          if (sample && sample.dryRun) return;
          if (sample && sample.down === true) {
            seenDown = true;
            return;
          }
          if (seenDown && sample && sample.down !== true) {
            const fn = onRelease;
            stop();
            if (typeof fn === "function") fn(sample);
          }
        })
        .catch(() => {});
    }, intervalMs);
    return { ok: true };
  }

  return {
    start,
    stop,
    get armed() {
      return armed;
    },
    get seenDown() {
      return seenDown;
    },
  };
}

module.exports = { createHoldMonitor, DICTATE_HOLD_VKS };
