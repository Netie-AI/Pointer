"use strict";
const { contextBridge, ipcRenderer } = require("electron");

const INVOKE = ["teach-overlay:ask", "teach-overlay:setIgnoreMouse"];

contextBridge.exposeInMainWorld("netieTeachOverlay", {
  onPoint: (fn) => {
    ipcRenderer.on("teach-overlay:point", (_e, event) => {
      if (typeof fn === "function") fn(event);
    });
  },
  invoke: (channel, payload) => {
    if (!INVOKE.includes(channel)) return Promise.reject(new Error("blocked " + channel));
    return ipcRenderer.invoke(channel, payload);
  },
});
