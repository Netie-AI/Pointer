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
  "hud:openPanel",
  "hud:sttStatus",
  "hud:captureFailed",
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
    ipcRenderer.send("hud:audioFrame", { source, samples, rate });
  },
  on: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on("hud:event", h);
    return () => ipcRenderer.removeListener("hud:event", h);
  },
});
