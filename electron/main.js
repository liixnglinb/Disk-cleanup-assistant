const { app, BrowserWindow } = require("electron");
const path = require("path");
const { startBackend } = require("./backend_runner");

// 自定义协议：网页可通过 local-toolbox:// 唤起本软件
const PROTOCOL = "local-toolbox";

let backendHandle = null;
let mainWindow = null;

// ---- 单实例锁：避免重复启动；协议唤起时聚焦已有窗口 ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // 第二次启动（含 local-toolbox:// 协议唤起）→ 聚焦已有窗口
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // 注册自定义协议处理（生产环境直接注册；开发环境以 electron 可执行文件作为处理者）
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }

  function createWindow(port) {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 980,
      minHeight: 640,
      backgroundColor: "#F9F9FB",
      icon: path.join(__dirname, "..", "build", "icons", "icon.ico"),
      title: "本地工具箱",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const devUrl = process.env.ELECTRON_START_URL;
    if (devUrl) {
      mainWindow.loadURL(`${devUrl.replace(/\/$/, "")}?backend=${port}`);
    } else {
      mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
        query: { backend: String(port) },
      });
    }
  }

  app.whenReady().then(async () => {
    try {
      backendHandle = await startBackend();
      console.log("[disk-cleanup-assistant] backend running on", backendHandle.port);
    } catch (err) {
      console.error("[disk-cleanup-assistant] backend failed to start:", err);
      backendHandle = null;
    }
    const port = backendHandle ? backendHandle.port : 17650;
    createWindow(port);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("will-quit", () => {
    if (backendHandle && backendHandle.child) {
      try {
        backendHandle.child.kill();
      } catch (_) {
        /* ignore */
      }
      backendHandle = null;
    }
  });
}
