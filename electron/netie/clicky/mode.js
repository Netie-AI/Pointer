"use strict";

const HOLD_MS = 180;

const STATES = Object.freeze({
  IDLE: "idle",
  HOLDING: "holding",
  CLICKY: "clicky",
});

const EVENTS = Object.freeze({
  HOLD_START: "hold_start",
  HOLD_CANCEL: "hold_cancel",
  HOLD_COMMIT: "hold_commit",
  EXIT: "exit",
  FAIL: "fail",
});

function transition(from, event, meta = {}) {
  if (!Object.values(STATES).includes(from)) return STATES.IDLE;

  if (event === EVENTS.FAIL || event === EVENTS.EXIT) return STATES.IDLE;

  if (from === STATES.IDLE && event === EVENTS.HOLD_START) {
    return STATES.HOLDING;
  }

  if (from === STATES.HOLDING) {
    if (event === EVENTS.HOLD_CANCEL) return STATES.IDLE;
    if (event === EVENTS.HOLD_COMMIT) {
      return Number(meta.heldMs) >= HOLD_MS ? STATES.CLICKY : STATES.IDLE;
    }
  }

  return from;
}

function describe(state) {
  switch (state) {
    case STATES.HOLDING:
      return {
        label: "Hold for Clicky",
        cursorOn: false,
        recordingHint: "Release after Clicky arms",
      };
    case STATES.CLICKY:
      return {
        label: "Clicky",
        cursorOn: true,
        recordingHint: "Recent screen context is available",
      };
    default:
      return {
        label: "Clicky off",
        cursorOn: false,
        recordingHint: "Hold to arm Clicky",
      };
  }
}

module.exports = {
  STATES,
  EVENTS,
  HOLD_MS,
  transition,
  describe,
};
