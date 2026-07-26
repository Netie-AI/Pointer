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
];

contextBridge.exposeInMainWorld("netieHud", {
  invoke: (channel, payload) => {
    if (!INVOKE.includes(channel)) return Promise.reject(new Error("blocked " + channel));
    return ipcRenderer.invoke(channel, payload);
  },
  on: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on("hud:event", h);
    return () => ipcRenderer.removeListener("hud:event", h);
  },
});
