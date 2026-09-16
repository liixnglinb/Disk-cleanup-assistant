const { contextBridge, ipcRenderer } = require("electron");

/** 订阅主进程推送的事件，返回取消订阅的函数。 */
function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("dca", {
  platform: process.platform,
  getApiToken: () => {
    const token = new URLSearchParams(window.location.search).get("apiToken");
    return token || null;
  },

  // ---- 自动更新（electron-updater）----
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateAvailable: (cb) => subscribe("update:available", cb),
  onUpdateProgress: (cb) => subscribe("update:progress", cb),
  onUpdateDownloaded: (cb) => subscribe("update:downloaded", cb),
  onUpdateError: (cb) => subscribe("update:error", cb),
});
