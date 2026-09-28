const { app, BrowserWindow, ipcMain, shell, Notification, Menu } = require("electron");
const crypto = require("crypto");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const { startBackend } = require("./backend_runner");
const { rankFeedsBySpeed } = require("./update_probe");

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
// 主源须与 package.json 的 build.publish 保持一致（构建时会写入 resources/app-update.yml）。
// 代码里再写一份是有意的：每次检查前都要显式设定 feed，否则某次主源失败切到备用源后，
// 后续检查会一直沿用那个备用源，即便主源已经恢复。
const PRIMARY_FEED =
  "https://gh-proxy.com/https://github.com/liixnglinb/Disk-cleanup-assistant/releases/latest/download";

if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true; // 开发模式读仓库根的 dev-app-update.yml（已 gitignore）
// 保持 false，由 update-available 处理器显式下载：这样测速可插在检查与下载之间
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false; // 必须由用户点「更新并重启」确认，退出时不静默安装
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
  // 以事件里的 info.version 为准：downloadingVersion 记的是"开始下载时"的版本，
  // 若下载途中又发布了新版本，两者会不一致，记错会让后续同版本检查重复下载整个安装包。
  downloadedVersion = String((info && info.version) || downloadingVersion);
  downloadingVersion = null;
  send("update:downloaded", { version: (info && info.version) || "" });
});

// 去重闸门：同一版本只自动下载一次（渲染层与主进程各会触发一次 update-available）
let downloadingVersion = null;
let downloadedVersion = null;

autoUpdater.on("update-available", async (info) => {
  const v = String((info && info.version) || "");
  if (!v || v === downloadingVersion || v === downloadedVersion) return;
  downloadingVersion = v;
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    downloadingVersion = null;
    send("update:error", { message: String((err && err.message) || err) });
  }
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

// 测速缓存：同一会话内 10 分钟不重复测（避免每次检查都跑 3 次采样）
let speedCache = { at: 0, ranked: null, log: [] };
const SPEED_TTL = 10 * 60 * 1000;

async function resolveFeeds() {
  if (speedCache.ranked && Date.now() - speedCache.at < SPEED_TTL) {
    return { ranked: speedCache.ranked, log: [...speedCache.log, "（10 分钟内的测速缓存）"] };
  }
  const r = await rankFeedsBySpeed();
  speedCache = { at: Date.now(), ranked: r.ranked, log: r.log };
  return r;
}

async function checkWithFallback() {
  const { ranked, log } = await resolveFeeds();
  console.log("[update] 渠道测速：\n" + log.join("\n"));
  let lastError = "无法连接更新服务，请检查网络后重试";
  for (const feed of ranked) {
    autoUpdater.setFeedURL({ provider: "generic", url: feed });
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo) return { ok: true, result, feed };
    } catch (err) {
      lastError = String((err && err.message) || err);
    }
  }
  return { ok: false, error: lastError };
}

/** 启动后静默检查一次；发现新版本时发系统通知，并同步给界面（不自动下载）。 */
function scheduleStartupCheck() {
  if (!app.isPackaged) return;
  setTimeout(async () => {
    try {
      const r = await checkWithFallback();
      if (!r.ok) return;
      const info = r.result.updateInfo;
      const latest = String(info.version || "").replace(/^v/, "");
      if (!versionGt(latest, app.getVersion())) return;

      const notes = typeof info.releaseNotes === "string" ? info.releaseNotes : "";
      const payload = {
        latest,
        current: app.getVersion(),
        releaseDate: info.releaseDate || "",
        releaseNotes: notes.slice(0, 2000),
      };
      send("update:available", payload);

      if (Notification.isSupported()) {
        new Notification({
          title: "磁盘清理助手有新版本",
          body: `v${latest} 已发布，正在后台下载；下载完成后点击标题栏的更新方块即可安装并重启。`,
        }).show();
      }
    } catch {
      /* 启动检查失败不打扰用户 */
    }
  }, 5000);
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
    releaseNotes: notes.slice(0, 2000),
  };
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
      title: "磁盘清理助手",
      icon: path.join(__dirname, "..", "build", "icons", "icon.ico"),
      // 保留原生 NC 区（贴边吸附/缩放交给系统），仅隐藏标题栏并自绘同一行内容。
      // 不用 frame:false —— 那会丢掉系统吸附行为，且需自补缩放命中区。
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#F7F7F5", symbolColor: "#16161A", height: 34 },
      backgroundColor: "#EFEFED",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    mainWindow.on("maximize", () => send("win:maximized-changed", { maximized: true }));
    mainWindow.on("unmaximize", () => send("win:maximized-changed", { maximized: false }));

    const devUrl = process.env.ELECTRON_START_URL;
    const query = { backend: String(port), apiToken };
    if (devUrl) {
      mainWindow.loadURL(`${devUrl.replace(/\/$/, "")}?${new URLSearchParams(query)}`);
    } else {
      mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query });
    }

    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);

    // 外部链接一律交给系统浏览器，不在应用内新开窗口
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) {
        shell.openExternal(url);
      }
      return { action: "deny" };
    });
  }

  // 与 build.appId 保持一致；Windows 上的系统通知依赖它
  app.setAppUserModelId("com.localtools.diskcleanup");

  // 只保留标准编辑加速器（role 自带 accelerator），隐藏菜单栏。
  // 不调用 Menu.setApplicationMenu(null)：官方未说明它是否连带失去 Ctrl+C/V。
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "编辑",
        submenu: [
          { role: "undo", label: "撤销" },
          { role: "redo", label: "重做" },
          { type: "separator" },
          { role: "cut", label: "剪切" },
          { role: "copy", label: "复制" },
          { role: "paste", label: "粘贴" },
          { role: "selectAll", label: "全选" },
        ],
      },
    ]),
  );

  ipcMain.handle("win:toggle-maximize", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { maximized: false };
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return { maximized: mainWindow.isMaximized() };
  });

  ipcMain.handle("win:set-titlebar-overlay", (_e, theme) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
    const dark = theme === "dark";
    mainWindow.setTitleBarOverlay({
      color: dark ? "#17181C" : "#F7F7F5",
      symbolColor: dark ? "#EDEEF1" : "#16161A",
      height: 34,
    });
    mainWindow.setBackgroundColor(dark ? "#101114" : "#EFEFED");
    return { ok: true };
  });

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
    scheduleStartupCheck();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(port, apiToken);
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  function killBackendTree() {
    if (!backendHandle || !backendHandle.child) return;
    // 先把子进程句柄取出来：backendHandle 马上要被置空，兜底分支还要用它。
    const child = backendHandle.child;
    const pid = child.pid;
    const killChild = () => {
      try {
        child.kill();
      } catch (_) {
        /* ignore */
      }
    };
    // 先置空再动手，保证三处钩子（before-quit / will-quit / process.on("exit")）幂等：
    // 只有第一次调用真正清理，后续调用直接返回。
    backendHandle = null;
    if (!pid) return;
    if (process.platform !== "win32") {
      // 非 Windows 上 taskkill 不存在，直接杀子进程。
      killChild();
      return;
    }
    try {
      // 尽力而为（不是可靠保障）：taskkill /T 能连子进程一起收，dev 下后端是
      // python.exe → python.exe 两级，只 kill 一级不够。但本函数也会在
      // process.on("exit") 里跑，退出期做异步 execFile 不可靠（可能来不及执行），
      // 所以它只是兜底清理；真正的可靠保障由后续任务的父进程看门狗负责。
      require("child_process").execFile("taskkill", ["/PID", String(pid), "/T", "/F"], (err) => {
        // taskkill 不存在（ENOENT）或执行失败（非零退出）时，退回 child.kill()
        // 至少收掉直接子进程，避免留孤儿。
        if (err) killChild();
      });
    } catch (_) {
      killChild();
    }
  }

  app.on("before-quit", killBackendTree);
  app.on("will-quit", killBackendTree);
  process.on("exit", killBackendTree);
}
