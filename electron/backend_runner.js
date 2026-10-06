const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");
const net = require("net");

function findFreePort(min = 17650, max = 17799) {
  return new Promise((resolve, reject) => {
    const tryPort = (p) => {
      if (p > max) return reject(new Error("no free port"));
      const srv = net.createServer();
      srv.once("error", () => tryPort(p + 1));
      srv.once("listening", () => srv.close(() => resolve(p)));
      srv.listen(p, "127.0.0.1");
    };
    tryPort(min);
  });
}

function resolveBackend() {
  // 1) packaged: extraResources/backend/disk_cleanup_backend.exe
  const candidates = [
    path.join(process.resourcesPath, "backend", "disk_cleanup_backend.exe"),
    path.join(__dirname, "..", "backend_dist", "disk_cleanup_backend.exe"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return { exe: c, args: [] };
  }
  // 2) dev: venv python + launcher
  const root = path.join(__dirname, "..");
  const venvPy = path.join(root, ".venv", "Scripts", "python.exe");
  if (fs.existsSync(venvPy)) {
    return { exe: venvPy, args: [path.join(root, "backend_launcher.py")] };
  }
  return { exe: "python", args: [path.join(root, "backend_launcher.py")] };
}

function waitHealth(port, child, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn) => {
      if (done) return;
      done = true;
      fn();
    };
    // 后端秒崩（PyInstaller 解包失败 / 依赖缺失 / 端口冲突）时，只等健康检查会
    // 白等满 30 秒才报错，用户面对的是一个卡住的启动过程。子进程一退出就立刻失败。
    child.on("exit", (code, signal) => {
      finish(() =>
        reject(new Error(`后端进程已退出（code=${code === null ? "null" : code} signal=${signal || "none"}）`)),
      );
    });
    const ping = async () => {
      if (done) return;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (res.ok) return finish(() => resolve(port));
      } catch (_) {
        /* not ready */
      }
      if (Date.now() > deadline) return finish(() => reject(new Error("backend health check timed out")));
      setTimeout(ping, 400);
    };
    ping();
  });
}

/**
 * 后端 stderr 的落盘位置。
 *
 * 原来 stdio:"ignore" 会把 Python 的整段 traceback 丢掉，界面只剩一个"500"，
 * 排查没有任何线索。目录与 Python 侧 backend/core/config.py 的 log_dir() 用的是
 * 同一个 %APPDATA%\disk-cleanup-assistant —— 这个耦合是刻意的：两边都从 APPDATA
 * 定位，日志才不会写进安装目录（Programs 下普通用户不可写）。
 */
function backendLogPath() {
  const base = process.env.APPDATA || process.env.LOCALAPPDATA;
  if (!base) return null;
  const dir = path.join(base, "disk-cleanup-assistant");
  try {
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "backend_stderr.log");
  } catch (_) {
    return null;
  }
}

async function startBackend(apiToken) {
  const port = await findFreePort();
  const { exe, args } = resolveBackend();
  const logPath = backendLogPath();
  let logFd = null;
  if (logPath) {
    try {
      logFd = fs.openSync(logPath, "a");
    } catch (_) {
      logFd = null;
    }
  }
  const child = spawn(exe, [...args, `--port=${port}`, `--parent-pid=${process.pid}`], {
    stdio: logFd === null ? "ignore" : ["ignore", "ignore", logFd],
    windowsHide: true,
    env: { ...process.env, ...(apiToken ? { DCA_API_TOKEN: apiToken } : {}) },
  });
  if (logFd !== null) {
    // 句柄已由子进程继承，立刻关掉自己这份：Windows 上长期持有会挡住文件改名与删除
    try {
      fs.closeSync(logFd);
    } catch (_) {
      /* ignore */
    }
  }
  child.on("error", (err) => {
    console.log("[backend] spawn error:", (err && err.message) || err);
  });
  const okPort = await waitHealth(port, child).catch((err) => {
    // 健康检查超时/失败后子进程可能还活着：不杀掉就会留下占着端口的僵尸后端，
    // 主进程随后回退到硬编码端口并拿到空 token。
    try { child.kill(); } catch (_) { /* 已退出 */ }
    throw err;
  });
  return { child, port: okPort, apiToken };
}

module.exports = { startBackend, findFreePort, resolveBackend };
