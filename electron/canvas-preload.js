const { contextBridge, ipcRenderer } = require("electron");

const INVOKE = ["canvas:ready", "canvas:list", "canvas:read", "canvas:openFolder"];

contextBridge.exposeInMainWorld("netieCanvas", {
  invoke: (channel, payload) => {
    if (!INVOKE.includes(channel)) return Promise.reject(new Error("blocked " + channel));
    return ipcRenderer.invoke(channel, payload);
  },
});
