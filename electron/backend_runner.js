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

function waitHealth(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const ping = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (res.ok) return resolve(port);
      } catch (_) {
        /* not ready */
      }
      if (Date.now() > deadline) return reject(new Error("backend health check timed out"));
      setTimeout(ping, 400);
    };
    ping();
  });
}

async function startBackend(apiToken) {
  const port = await findFreePort();
  const { exe, args } = resolveBackend();
  const child = spawn(exe, [...args, `--port=${port}`], {
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, ...(apiToken ? { DCA_API_TOKEN: apiToken } : {}) },
  });
  child.on("error", (err) => {
    console.error("backend spawn error", err);
  });
  const okPort = await waitHealth(port);
  return { child, port: okPort, apiToken };
}

module.exports = { startBackend, findFreePort, resolveBackend };
