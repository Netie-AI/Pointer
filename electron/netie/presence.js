"use strict";

const STATES = Object.freeze({
  IDLE: "idle",
  THINKING: "thinking",
  WORKING: "working",
  WAITING_NOD: "waiting_nod",
  DONE: "done",
  ERROR: "error",
});

const EVENTS = Object.freeze({
  THINK: "think",
  START: "start",
  WAIT: "wait",
  NOD: "nod",
  COMPLETE: "complete",
  FAIL: "fail",
  RESET: "reset",
  TIMEOUT: "timeout",
});

const DESCRIPTIONS = Object.freeze({
  [STATES.IDLE]: Object.freeze({ mood: "calm", label: "Ready", crazy: false, matrix: false }),
  [STATES.THINKING]: Object.freeze({ mood: "crazy_smile", label: "Thinking", crazy: true, matrix: true }),
  [STATES.WORKING]: Object.freeze({ mood: "crazy_smile", label: "Working", crazy: true, matrix: true }),
  [STATES.WAITING_NOD]: Object.freeze({ mood: "soft_smile", label: "Waiting for your nod", crazy: false, matrix: false }),
  [STATES.DONE]: Object.freeze({ mood: "smile", label: "Done", crazy: false, matrix: false }),
  [STATES.ERROR]: Object.freeze({ mood: "concerned", label: "Needs attention", crazy: false, matrix: false }),
});

const TRANSITIONS = Object.freeze({
  [EVENTS.THINK]: STATES.THINKING,
  [EVENTS.START]: STATES.WORKING,
  [EVENTS.WAIT]: STATES.WAITING_NOD,
  [EVENTS.NOD]: STATES.WORKING,
  [EVENTS.COMPLETE]: STATES.DONE,
  [EVENTS.FAIL]: STATES.ERROR,
  [EVENTS.RESET]: STATES.IDLE,
  [EVENTS.TIMEOUT]: STATES.IDLE,
});

function transition(from, event) {
  const current = Object.values(STATES).includes(from) ? from : STATES.IDLE;
  if (event === EVENTS.TIMEOUT && current !== STATES.DONE) return current;
  return TRANSITIONS[event] || current;
}

function describe(state) {
  const description = DESCRIPTIONS[state] || DESCRIPTIONS[STATES.IDLE];
  return { ...description };
}

module.exports = {
  STATES,
  EVENTS,
  transition,
  describe,
};
