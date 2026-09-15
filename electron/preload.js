const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dca", {
  platform: process.platform,
  getApiToken: () => {
    const token = new URLSearchParams(window.location.search).get('apiToken');
    return token || null;
  },
  checkUpdate: () => ipcRenderer.invoke("toolbox:check-update"),
  smartDownload: (payload) => ipcRenderer.invoke("toolbox:smart-download", payload),
});
