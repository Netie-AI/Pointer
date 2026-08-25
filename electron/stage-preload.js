const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("netieStage", {
  onEvent: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on("stage:event", h);
    return () => ipcRenderer.removeListener("stage:event", h);
  },
  ready: () => ipcRenderer.invoke("stage:ready"),
  dismiss: () => ipcRenderer.invoke("stage:dismiss"),
});
