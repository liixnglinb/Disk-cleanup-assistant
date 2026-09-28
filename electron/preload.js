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

  // ---- 窗口控制（标题栏由渲染层自绘，按钮由系统 overlay 绘制）----
  toggleMaximize: () => ipcRenderer.invoke("win:toggle-maximize"),
  setTitleBarOverlay: (theme) => ipcRenderer.invoke("win:set-titlebar-overlay", theme),
  onMaximizedChanged: (cb) => subscribe("win:maximized-changed", cb),

  // ---- 自动更新（electron-updater）----
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateAvailable: (cb) => subscribe("update:available", cb),
  onUpdateProgress: (cb) => subscribe("update:progress", cb),
  onUpdateDownloaded: (cb) => subscribe("update:downloaded", cb),
  onUpdateError: (cb) => subscribe("update:error", cb),
});
