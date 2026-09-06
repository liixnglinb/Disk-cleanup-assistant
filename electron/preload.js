const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dca", {
  platform: process.platform,
  checkUpdate: () => ipcRenderer.invoke("toolbox:check-update"),
  smartDownload: (payload) => ipcRenderer.invoke("toolbox:smart-download", payload),
});