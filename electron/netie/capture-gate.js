"use strict";
/**
 * Arm-to-listen — the privacy position, as code rather than as a claim.
 *
 * The competing demos stream the microphone to a cloud endpoint continuously and
 * call it "always on". Netie does not: capture starts disarmed, a human arms it
 * (hotkey, the Record button, or switching to a listening mode), transcription
 * happens on-device, and only gated bursts ever leave the box.
 *
 * That was true in the IPC handler and asserted nowhere, which makes it a
 * marketing sentence rather than an invariant. It lives here so a test can hold
 * it, and so the next person who adds an audio source has one place to pass.
 */

/** Capture is off at boot. Every `true` below is something a human did. */
const DISARMED = Object.freeze({ listenMic: false, listenSystem: false, paused: false });

/**
 * Should this audio frame be transcribed at all?
 *
 * @param {object} state
 *   source        'mic' | 'system'
 *   listenMic     mic armed by the user
 *   listenSystem  loopback armed by the user
 *   paused        explicit "stop hearing me"
 * @returns {{accept:boolean, reason:string}}
 */
function shouldAcceptFrame(state) {
  const s = state || {};
  const source = s.source === "system" ? "system" : "mic";
  // Pause outranks arming: it is the user saying stop, mid-session.
  if (s.paused === true) return { accept: false, reason: "paused" };
  if (source === "mic" && s.listenMic !== true) return { accept: false, reason: "mic-disarmed" };
  if (source === "system" && s.listenSystem !== true) {
    return { accept: false, reason: "system-disarmed" };
  }
  return { accept: true, reason: `armed:${source}` };
}

/**
 * Spoken capture commands — "continue", "pause", "stop".
 *
 * Deliberately not in modes.js: these do not change what Netie is, they change
 * whether it is recording. They live next to the frame gate so both rules about
 * capture sit in one file.
 *
 * Anchored to the whole utterance. "continue" inside a sentence is the user
 * talking, not commanding — "so we continue with the invoice" must never
 * restart a recording that was deliberately stopped.
 */
const CAPTURE_COMMANDS = Object.freeze([
  { re: /^(continue|carry on|keep going|resume|start again|continue recording)\s*[.!]?$/i, command: "continue" },
  { re: /^(pause|hold on|pause recording|wait a (sec|second|moment))\s*[.!]?$/i, command: "pause" },
  { re: /^(stop|stop recording|end recording|done recording|that'?s all|finish(ed)?)\s*[.!]?$/i, command: "stop" },
]);

/**
 * @param {string} text a FINAL transcript line, never a partial
 * @returns {"continue"|"pause"|"stop"|null}
 */
function detectCaptureCommand(text) {
  const clean = String(text || "").trim();
  if (!clean || clean.length > 40) return null;
  for (const { re, command } of CAPTURE_COMMANDS) {
    if (re.test(clean)) return command;
  }
  return null;
}

module.exports = { DISARMED, shouldAcceptFrame, detectCaptureCommand, CAPTURE_COMMANDS };
