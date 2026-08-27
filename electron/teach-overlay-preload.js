"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("netieTeachOverlay", {
  onPoint: (fn) => {
    ipcRenderer.on("teach-overlay:point", (_e, event) => {
      if (typeof fn === "function") fn(event);
    });
  },
});
