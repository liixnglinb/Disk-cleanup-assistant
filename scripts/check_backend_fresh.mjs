/**
 * 打包前闸门：确认要塞进安装程序的后端 exe 不比后端源码旧。
 *
 * 真实风险：README 里那条"分步构建"（build:renderer → npx electron-builder）
 * 不会重新打 PyInstaller。backend_dist 里躺着上周的 exe 时，它会原封不动地
 * 被装进新版本安装程序 —— 版本号是新的，跑起来的后端是旧的，而且不会报错。
 * 本机实测就出现过：0.5.6 的界面配 0.5.1 的后端。
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXE = path.join(ROOT, "backend_dist", "disk_cleanup_backend.exe");

if (!existsSync(EXE)) {
  console.error("缺少 backend_dist/disk_cleanup_backend.exe —— 先跑 npm run build:backend");
  process.exit(1);
}

const exeMtime = statSync(EXE).mtimeMs;
let newest = 0;
let newestPath = "";
let scanned = 0;

const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__pycache__" || entry.name === ".pytest_cache") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".py")) {
      scanned += 1;
      const m = statSync(full).mtimeMs;
      if (m > newest) { newest = m; newestPath = path.relative(ROOT, full); }
    }
  }
};
walk(path.join(ROOT, "backend"));

// launcher 也在打包入口链上，同样算进来
const launcher = path.join(ROOT, "backend_launcher.py");
if (existsSync(launcher)) {
  scanned += 1;
  const m = statSync(launcher).mtimeMs;
  if (m > newest) { newest = m; newestPath = "backend_launcher.py"; }
}

const newer = newest - exeMtime;
if (newer > 0) {
  console.error(
    `后端 exe 比源码旧 ${(newer / 60000).toFixed(1)} 分钟（最新的源码：${newestPath}）。\n` +
    "先跑 npm run build:backend，或直接 npm run dist（它会串起来）。",
  );
  process.exit(1);
}
console.log(`后端 exe 新鲜（扫描 ${scanned} 个 .py，最新 ${path.basename(newestPath)}）`);
