const { app, BrowserWindow, ipcMain, shell, net } = require("electron");
const crypto = require("crypto");
const fsPromises = require("fs/promises");
const path = require("path");
const { startBackend } = require("./backend_runner");

// 自定义协议：网页可通过 local-toolbox:// 唤起本软件
const PROTOCOL = "local-toolbox";

// ---- 更新检查与智能下载 ----
const REPO = "liixnglinb/disk-cleanup-assistant";
const GITHUB_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const GH_BASE = `https://github.com/${REPO}/releases/download`;
const DOWNLOAD_SOURCES = [
  { name: "国内镜像", prefix: "https://gh-proxy.com/" },
  { name: "备用镜像", prefix: "https://ghproxy.net/" },
  { name: "GitHub 官方", prefix: "" },
];

async function fetchJson(url, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await net.fetch(url, { signal: ctl.signal, headers: { "User-Agent": "local-toolbox" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function probeUrl(url, ms = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const start = Date.now();
  try {
    const res = await net.fetch(url, { method: "HEAD", redirect: "follow", signal: ctl.signal });
    return { ok: res.ok, ms: Date.now() - start };
  } catch {
    return { ok: false, ms };
  } finally {
    clearTimeout(timer);
  }
}

function expectedDigestFromGithub(digest) {
  const match = /^(sha256[:=])([0-9a-f]{64})$/i.exec(String(digest || ""));
  return match ? match[2].toLowerCase() : null;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function versionGt(a, b) {
  const pa = String(a || "").replace(/^v/, "").split(".").map(Number);
  const pb = String(b || "").replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

ipcMain.handle("toolbox:check-update", async () => {
  const d = await fetchJson(GITHUB_API);
  if (!d || !d.tag_name) {
    return { ok: false, error: "无法连接 GitHub，请检查网络后重试" };
  }
  const current = app.getVersion();
  const latest = d.tag_name;
  const asset = (d.assets || []).find(
    (a) => a.name.indexOf("LocalToolbox-Setup-") === 0 && a.name.indexOf(".exe") > 0
  );
  return {
    ok: true,
    current,
    latest,
    hasUpdate: versionGt(latest, current),
    assetName: asset ? asset.name : `LocalToolbox-Setup-${latest.replace(/^v/, "")}.exe`,
    size: asset ? asset.size : 0,
    digest: asset ? (asset.digest || null) : null,
    publishedAt: d.published_at || "",
    body: (d.body || "").slice(0, 600),
  };
});

ipcMain.handle("toolbox:smart-download", async (_e, payload) => {
  const asset = payload && payload.assetName
    ? payload.assetName
    : `LocalToolbox-Setup-${app.getVersion()}.exe`;
  const tag = payload && payload.tag ? payload.tag : `v${app.getVersion()}`;
  const targets = DOWNLOAD_SOURCES.map((s) => ({
    name: s.name,
    url: s.prefix + `${GH_BASE}/${tag}/${asset}`,
  }));
  const results = await Promise.all(
    targets.map(async (t) => ({ ...t, ...(await probeUrl(t.url)) }))
  );
  results.sort((a, b) => (a.ok === b.ok ? a.ms - b.ms : a.ok ? -1 : 1));
  const best = results[0];
  if (!best || !best.ok) {
    return { ok: false, error: "所有下载通道均不可达，请稍后重试" };
  }
  const expectedDigest = expectedDigestFromGithub(payload && payload.digest);
  if (!expectedDigest) {
    await shell.openExternal(best.url);
    return { ok: true, url: best.url, source: best.name, ms: best.ms, verified: false };
  }

  const res = await net.fetch(best.url, { redirect: "follow" });
  if (!res.ok) {
    return { ok: false, error: `下载失败（HTTP ${res.status}）` };
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (payload.size > 0 && bytes.length !== Number(payload.size)) {
    return { ok: false, error: "更新包大小校验失败" };
  }
  if (sha256(bytes) !== expectedDigest) {
    return { ok: false, error: "更新包 SHA256 校验失败，已停止安装" };
  }

  const fileName = path.basename(payload.assetName || "LocalToolbox-Setup.exe");
  const downloadDir = path.join(app.getPath("temp"), "local-toolbox-updates");
  await fsPromises.mkdir(downloadDir, { recursive: true });
  const filePath = path.join(downloadDir, fileName);
  await fsPromises.writeFile(filePath, bytes);
  await shell.openPath(filePath);
  return { ok: true, url: best.url, source: best.name, ms: best.ms, verified: true, filePath };
});

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
