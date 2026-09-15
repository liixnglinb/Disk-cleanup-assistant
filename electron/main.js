const { app, BrowserWindow, ipcMain, shell } = require("electron");
const crypto = require("crypto");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const { startBackend } = require("./backend_runner");

// 自定义协议：网页可通过 local-toolbox:// 唤起本软件
const PROTOCOL = "local-toolbox";

let backendHandle = null;
let mainWindow = null;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// ---------------------------------------------------------------------------
// 自动更新（electron-updater，electron-builder 官方配套更新器）
// ---------------------------------------------------------------------------
// 主源写在 package.json 的 publish 里，构建时由 electron-builder 写入
// resources/app-update.yml。下面两个备用源用于主源不可达时回退——三者都指向
// GitHub Releases 的 latest 通道，因此拿到的始终是最新版本的 latest.yml 与安装包。
const FALLBACK_FEEDS = [
  "https://ghproxy.net/https://github.com/liixnglinb/Disk-cleanup-assistant/releases/latest/download",
  "https://github.com/liixnglinb/Disk-cleanup-assistant/releases/latest/download",
];

autoUpdater.autoDownload = false; // 由用户在界面确认后再下载
autoUpdater.autoInstallOnAppQuit = false; // 下载完成后由用户点「重启并安装」
autoUpdater.allowDowngrade = false;

autoUpdater.on("download-progress", (p) => {
  send("update:progress", {
    percent: Math.round((p.percent || 0) * 10) / 10,
    transferred: p.transferred || 0,
    total: p.total || 0,
    bytesPerSecond: p.bytesPerSecond || 0,
  });
});

autoUpdater.on("update-downloaded", (info) => {
  send("update:downloaded", { version: (info && info.version) || "" });
});

autoUpdater.on("error", (err) => {
  send("update:error", { message: String((err && err.message) || err) });
});

function versionGt(a, b) {
  const pa = String(a || "").replace(/^v/, "").split(".").map(Number);
  const pb = String(b || "").replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

async function checkWithFallback() {
  const feeds = [null, ...FALLBACK_FEEDS]; // null = 沿用 app-update.yml 中的主源
  let lastError = "无法连接更新服务，请检查网络后重试";
  for (const feed of feeds) {
    if (feed) autoUpdater.setFeedURL({ provider: "generic", url: feed });
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo) return { ok: true, result };
    } catch (err) {
      lastError = String((err && err.message) || err);
    }
  }
  return { ok: false, error: lastError };
}

ipcMain.handle("update:check", async () => {
  if (!app.isPackaged) {
    return { ok: false, error: "开发模式下不检查更新，请安装打包版本后再试。" };
  }
  const current = app.getVersion();
  const r = await checkWithFallback();
  if (!r.ok) return { ok: false, error: r.error };
  const info = r.result.updateInfo;
  const latest = String(info.version || "").replace(/^v/, "");
  const notes = typeof info.releaseNotes === "string" ? info.releaseNotes : "";
  return {
    ok: true,
    current,
    latest,
    hasUpdate: versionGt(latest, current),
    releaseDate: info.releaseDate || "",
    releaseNotes: notes.slice(0, 800),
  };
});

ipcMain.handle("update:download", async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle("update:install", () => {
  // 静默安装：不显示安装向导，装完自动拉起新版本，用户无需重新走安装流程
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return { ok: true };
});

// ---------------------------------------------------------------------------
// 单实例锁 + 自定义协议
// ---------------------------------------------------------------------------
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

  function createWindow(port, apiToken) {
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
    const query = { backend: String(port), apiToken };
    if (devUrl) {
      mainWindow.loadURL(`${devUrl.replace(/\/$/, "")}?${new URLSearchParams(query)}`);
    } else {
      mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query });
    }

    // 外部链接一律交给系统浏览器，不在应用内新开窗口
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) {
        shell.openExternal(url);
      }
      return { action: "deny" };
    });
  }

  app.whenReady().then(async () => {
    let apiToken = null;
    try {
      apiToken = crypto.randomBytes(32).toString("hex");
      backendHandle = await startBackend(apiToken);
      console.log("[disk-cleanup-assistant] backend running on", backendHandle.port);
    } catch (err) {
      console.error("[disk-cleanup-assistant] backend failed to start:", err);
      backendHandle = null;
      apiToken = null;
    }
    const port = backendHandle ? backendHandle.port : 17650;
    createWindow(port, apiToken);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(port, apiToken);
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
