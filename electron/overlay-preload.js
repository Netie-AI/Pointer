const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("netieOverlay", {
  commitRegion: (region) => ipcRenderer.invoke("clicks:commitRegion", region),
  cancel: () => ipcRenderer.invoke("clicks:cancelRegion"),
});
