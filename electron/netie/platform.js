"use strict";
/**
 * Which OS this Pointer build is sitting on.
 *
 * Windows owns SendInput Act. Linux and Mac ship the same HUD / overlay /
 * host coworker; clicks stay fail-closed until a native driver exists and
 * Cortex /dms/secure still gates them. Never invent xdotool or CGEvent
 * just to look like Clicky.
 */

function packId(platform) {
  const p = platform || process.platform;
  if (p === "darwin") return "mac";
  if (p === "linux") return "linux";
  if (p === "win32") return "win";
  return String(p || "unknown");
}

function actOs(platform) {
  return (platform || process.platform) === "win32";
}

function actRefuseReason(platform) {
  const id = packId(platform);
  return (
    "Act is fail-closed on " +
    id +
    " (SendInput is Windows-only). Ask, overlay Draw, and the host still work. Never Act."
  );
}

const OS_ACT = Object.freeze([
  "movecursor",
  "hover",
  "click",
  "doubleclick",
  "rightclick",
  "type",
  "fill",
  "setvalue",
  "paste",
  "clipboard_paste",
  "clipboard_set",
  "clipboard_get",
  "copy_clipboard",
  "copy",
  "select_copy",
  "select_all",
  "press",
  "keypress",
  "scroll",
  "drag",
  "navigate",
  "open",
]);

function isOsAct(type) {
  return OS_ACT.includes(String(type || "").toLowerCase());
}

module.exports = { packId, actOs, actRefuseReason, isOsAct, OS_ACT };
