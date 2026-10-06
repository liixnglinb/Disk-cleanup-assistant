const { app, BrowserWindow, ipcMain, shell, Notification, Menu, dialog } = require("electron");
const crypto = require("crypto");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const { startBackend } = require("./backend_runner");
const { rankFeedsBySpeed, getText } = require("./update_probe");
const { releaseNotesToPlainText } = require("./feeds");

// 自定义协议：网页可通过 local-toolbox:// 唤起本软件
const PROTOCOL = "local-toolbox";

/**
 * 标题栏 overlay 的高度与配色 —— 必须与 src/styles/global.css 的
 * --titlebar-h / --bg / --text 保持一致。
 *
 * 为什么要在主进程再写一份：Electron 的 titleBarOverlay 由主进程设置，
 * 渲染进程无法直接改窗口 chrome；CSS 变量到不了这里。三处硬编码曾经各写各的
 * （标题栏 CSS 34px、overlay 34px、配色还是上一版暖灰），改成常量后至少
 * 本文件内不会再漂移。改标题栏高度时仍需同步 global.css 的 --titlebar-h。
 *
 * 配色取自设计系统 v9（方案二 Tokens）：浅色 #F9F9F9 / #111827，
 * 暗色 #121212 / #F3F4F6。
 */
const OVERLAY = {
  height: 64,
  light: { color: "#F9F9F9", symbol: "#111827", bg: "#F9F9F9" },
  dark: { color: "#121212", symbol: "#F3F4F6", bg: "#121212" },
};

let backendHandle = null;
let mainWindow = null;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/**
 * 收掉后端进程树。模块级函数，三处退出钩子与"更新并重启"都要能调到它。
 *
 * 必须同步执行：process.on("exit") 里注册的函数不能再依赖异步回调 ——
 * 事件循环已经停了，execFile 的回调根本来不及跑，python.exe 就成了孤儿，
 * 下次启动还占着端口。taskkill /T 连子进程一起收（dev 下是 python.exe→python.exe
 * 两级，只杀一级不够）。后端自己还有父进程看门狗（backend/core/watchdog.py）
 * 作为最后一道保障，但它要等心跳超时才动手，不能指望它替安装让路。
 */
function killBackendTree() {
  if (!backendHandle || !backendHandle.child) return;
  const child = backendHandle.child;
  const pid = child.pid;
  const killChild = () => {
    try {
      child.kill();
    } catch (_) {
      /* 已退出 */
    }
  };
  // 先置空再动手，保证多次调用幂等：只有第一次真正清理。
  backendHandle = null;
  if (!pid) return;
  if (process.platform !== "win32") {
    killChild();
    return;
  }
  const cp = require("child_process");
  try {
    cp.execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      timeout: 5000,
      windowsHide: true,
      stdio: "ignore",
    });
  } catch (_) {
    // taskkill 不存在/超时/非零退出：退回直接杀子进程，至少不留一层
    killChild();
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
// 保持 false，但注意：真正的下载触发点是下面的 update-available 处理器 —— 发现新版
// 就后台拉包（系统通知也是这么写的），测速只决定"从哪个镜像拉 latest.yml"，
// 并不参与下载时机。改这里之前先想清楚要不要保留这个自动预下载。
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
  // 只比三段数字；预发布后缀（-beta.2）先剥掉，否则 Number() 出 NaN，
  // 而 NaN 的所有比较都是 false → 预发布版永远判为"无更新"。
  const norm = (v) => String(v || "").replace(/^v/, "").split("-")[0].split(".").map((x) => parseInt(x, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

// 更新说明的唯一来源是 GitHub Release 正文：electron-builder 写进 latest.yml 的
// 只有 version/files/path/sha512/releaseDate，generic provider 解析出来的 updateInfo
// 因此永远没有 releaseNotes —— 不自己取，应用内就只会显示"本次发布未提供更新说明"。
const RELEASE_API = "https://api.github.com/repos/liixnglinb/Disk-cleanup-assistant/releases/";
let notesCache = { tag: "", text: "" };

/** 取该版本的 Release 正文并降级为纯文本；取不到返回空串，绝不阻塞更新流程。 */
async function resolveReleaseNotes(version) {
  const tag = "v" + String(version || "").replace(/^v/, "");
  if (tag === "v") return "";
  if (notesCache.tag === tag) return notesCache.text;
  let text = "";
  try {
    // version 来自更新源（第三方镜像）的 latest.yml，进 URL 前必须转义，
    // 否则 ../ ? # 能操纵 api.github.com 的路径。
    const r = await getText(RELEASE_API + encodeURIComponent(tag), { timeoutMs: 4000 });
    if (r && r.ok && r.text) {
      text = releaseNotesToPlainText(JSON.parse(r.text).body);
    }
  } catch {
    text = ""; // 网络失败/限流/JSON 异常都退回"未提供更新说明"，不能因此卡住检查
  }
  notesCache = { tag, text };
  return text;
}

/** 优先用 updateInfo 自带的 releaseNotes（GitHub provider 会有），否则回读 Release 正文。 */
async function notesFor(info, version) {
  const own = typeof info.releaseNotes === "string" ? info.releaseNotes.trim() : "";
  if (own) return releaseNotesToPlainText(own);
  return resolveReleaseNotes(version);
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

      const notes = await notesFor(info, latest);
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
          // 更新入口自 v0.5.0 起从标题栏搬到右下角胶囊，文案别再指回标题栏
          body: `v${latest} 已发布，正在后台下载；下载完成后点击右下角的「更新」胶囊即可安装并重启。`,
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
  const notes = await notesFor(info, latest);
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
  if (!app.isPackaged) {
    return { ok: false, error: "开发模式下无法安装更新，请安装打包版本后再试。" };
  }
  // 安装包真在下好的那份才装。以前这里无条件返回 {ok:true}：没下载完 / 下载失败
  // 时点"更新并重启"也会像成功一样关窗口，用户重开还是旧版本。
  if (!downloadedVersion) {
    return { ok: false, error: "新版本安装包还没下载完成，请稍等后再点。" };
  }
  try {
    // 先把后端收掉：安装器要替换 resources\backend\*.exe，python 占着文件会让
    // 安装半途失败。killBackendTree 是同步的，返回时端口已经释放。
    killBackendTree();
    // 静默安装：不显示安装向导，装完自动拉起新版本，用户无需重新走安装流程
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
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
      titleBarOverlay: { color: OVERLAY.light.color, symbolColor: OVERLAY.light.symbol, height: OVERLAY.height },
      backgroundColor: OVERLAY.light.bg,
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

    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);

    // 外部链接一律交给系统浏览器，不在应用内新开窗口
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) {
        shell.openExternal(url);
      }
      return { action: "deny" };
    });

    // 也不许本窗口自己被导航走：setWindowOpenHandler 只管 window.open，
    // 渲染层若被注入，location= 跳转后 preload 会在新页面上重跑，
    // 那个页面就能拿到带 getApiToken 的 dca API。
    mainWindow.webContents.on("will-navigate", (e, url) => {
      // 用事件自己的 sender，别去摸模块级的 mainWindow：窗口 closed 后那个引用
      // 不会被清空，之后触发的导航会抛 "Object has been destroyed"。
      const wc = e.sender;
      if (!wc || wc.isDestroyed()) return;
      if (url !== wc.getURL()) e.preventDefault();
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
    const o = dark ? OVERLAY.dark : OVERLAY.light;
    mainWindow.setTitleBarOverlay({
      color: o.color,
      symbolColor: o.symbol,
      height: OVERLAY.height,
    });
    mainWindow.setBackgroundColor(o.bg);
    return { ok: true };
  });

  app.whenReady().then(async () => {
    let apiToken = null;
    try {
      apiToken = crypto.randomBytes(32).toString("hex");
      backendHandle = await startBackend(apiToken);
      console.log("[disk-cleanup-assistant] backend running on", backendHandle.port);
    } catch (err) {
      const why = String((err && err.message) || err);
      console.error("[disk-cleanup-assistant] backend failed to start:", why);
      // 原来这里只是把 backendHandle/apiToken 置空，然后带着硬编码端口 17650
      // 继续开窗口：界面每个面板都是空的，用户只当软件坏了；而且空 token
      // 打到的可能是上一次残留的孤儿后端，返回的全是 401。启动失败要当面说清。
      dialog.showErrorBox(
        "磁盘清理助手启动失败",
        `本地服务没能启动：${why}\n\n` +
          `详细信息见日志：${path.join(process.env.APPDATA || "", "disk-cleanup-assistant", "backend_stderr.log")}\n\n` +
          "如果反复出现，请重新安装本软件（卸载不会影响你的清理记录）。",
      );
      app.quit();
      return;
    }
    const port = backendHandle.port;
    createWindow(port, apiToken);
    scheduleStartupCheck();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(port, apiToken);
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", killBackendTree);
  app.on("will-quit", killBackendTree);
  process.on("exit", killBackendTree);
}
