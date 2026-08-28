const { contextBridge, ipcRenderer } = require("electron");

const INVOKE = [
  "hud:ready",
  "hud:ask",
  "hud:act",
  "hud:hide",
  "hud:frameRegion",
  "hud:toggleListen",
  "hud:toggleSystemAudio",
  "hud:setPaused",
  "hud:setIgnoreMouse",
  "hud:setMode",
  "hud:getSettings",
  "hud:setSettings",
  "hud:openCanvas",
  "hud:demoShot",
  "hud:retrieveList",
  "hud:retrieveRead",
  "hud:retrieveOpen",
  // The status pill's Open button. Shipped with a main-process handler and a
  // renderer call but no allowlist entry, so every click was rejected as a
  // blocked channel and the button did nothing. Containment for what it may
  // open lives in main.js (#19); this list only decides which channels exist.
  "hud:openPath",
  "hud:openInSpace",
  "hud:affirm",
  "hud:openPanel",
  "hud:openDemoDebug",
  "hud:sttStatus",
  "hud:captureFailed",
  "hud:clickyHold",
  "hud:clickyExit",
  "hud:clickyStatus",
  "hud:snapshotDelivery",
  "hud:bgList",
  "hud:bgCancel",
  "hud:importMemory",
  "hud:enquireSave",
  "hud:enquireCancel",
  "hud:hideStage",
  "hud:meetingNotes",
  "hud:copyText",
  "hud:reportProblem",
];

contextBridge.exposeInMainWorld("netieHud", {
  invoke: (channel, payload) => {
    if (!INVOKE.includes(channel)) return Promise.reject(new Error("blocked " + channel));
    return ipcRenderer.invoke(channel, payload);
  },
  /**
   * Audio frames are fire-and-forget (50/sec) — `send` avoids a promise per
   * frame, and main drops them when paused or the source is off.
   */
  sendFrame: (source, samples, rate) => {
    const frame =
      samples instanceof Float32Array
        ? samples
        : Array.isArray(samples)
          ? Float32Array.from(samples)
          : new Float32Array(samples || []);
    ipcRenderer.send("hud:audioFrame", { source, samples: frame, rate });
  },
  on: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on("hud:event", h);
    return () => ipcRenderer.removeListener("hud:event", h);
  },
});
