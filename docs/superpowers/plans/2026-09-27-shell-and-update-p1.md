# 外壳与更新交互（P1）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把磁盘清理助手的外壳换成一行的自绘标题栏 + 48px 左侧导航栏，删掉状态栏、默认菜单与出厂检测，并把更新链路重做（真测速选源、常驻下载框、悬停内容、确认后重启安装）。

**Architecture:** Electron 侧用 `titleBarStyle: "hidden"` + `titleBarOverlay` 保留原生 NC 区（吸附/缩放交给系统），仅用自绘内容占据同一行；更新渠道选择抽成"先探测 latest.yml 拿资产名 → 再对安装包做 256KB Range 采样测吞吐"的两阶段纯函数 + net 探测，前端更新状态上提到 `App` 顶层的 `UpdaterProvider` 常驻订阅，标题栏方块与设置页共用同一状态源。

**Tech Stack:** Electron 33（`net.request` / `setTitleBarOverlay` / `Menu` roles）、React 18 + TS、Vite 6、Python 3.12 + FastAPI + uvicorn、pytest、Node 内置 `node:test`（零新依赖）。

**Spec:** `docs/superpowers/specs/2026-09-27-ui-modern-refactor-design.md`（本次实现 §2、§9、§10、§16 与 §12/§13 中 P1 相关条目）

## Global Constraints

以下为项目级硬约束，每个任务都隐含包含：

- **不改后端判定逻辑**：`backend/core/classifier.py`、`cleanup_kb.py`、`cache_dirs.py`、`protected_paths.py`、`delete_manager.py`、`config.py` 的 `PROTECTED_RELATIVE` 一律不动。新增的 `watchdog.py` 只做进程存活检测，不参与任何分类/风险/删除判定。
- **不引入组件库、Tailwind、新运行时依赖**；Node 侧测试用内置 `node:test`（零新依赖）。
- **尺寸基线**：标题栏 34px、左侧导航栏 48px、工作区头 40px、表格行高 24px、正文 12px、元数据 11px、输入框 26px。
- **语义色四轴**：`--ok` 绿（可释放/推荐清理/低风险）、`--warn` 琥珀（谨慎/中风险）、`--danger` 红（锁定/系统/危险/永久删除）、`--primary` 紫（仅 CTA/激活/焦点）。状态标签一律"图标着色 + 中性文字"；彩色胶囊只用于聚合计数（高 18px、11px 字）。品牌紫不做大面积底色。
- **材质**：面板 = surface 色阶 + 顶部 1px 内高光 + `--shadow-sm`；表格行不卡片化；浮层才用 `--shadow` / `--shadow-lg`。
- **窗口**：本阶段不用 `frame: false`，也不用 `Menu.setApplicationMenu(null)`。
- **更新策略**：渠道移除 ghproxy.net；`autoInstallOnAppQuit = false`；`autoDownload` 保持 false 但在 `update-available` 里显式下载；测速必须校验**真实收到的字节数**，不得用 `Content-Length` 或耗时推断（本项目曾因 `curl -o /dev/null` 假报 0 字节误判"三个镜像全瘫"）。
- **版本号 7 处一致**：`npm run check:versions` 必须退出 0。本计划把 `SettingsPanel.tsx` 改用 `__APP_VERSION__` 后，它不再是独立版本落点，须同步从 `scripts/check_versions.py` 的 `TEXT_TARGETS` 移除（8 → 7 处，见 Task 5 Step 5b，理由：Shell 与 registry.tsx 改用注入后即按同一规则移除过）。**注意用 `.venv/Scripts/python.exe` 跑该脚本，本机 `python` 不在 PATH。**
- **提交信息**：中文 + conventional 前缀（`feat(scope):` / `fix(scope):` / `chore(scope):`）。
- **改动前记录**：任何文件改动前先跑一次 `npm run typecheck` 与 `pytest backend/tests -q` 留基线（本计划基线：typecheck 通过、pytest **37 passed**）。

---

## 文件结构（本计划涉及）

| 文件 | 动作 | 职责 |
|---|---|---|
| `electron/feeds.js` | 新建 | 纯逻辑：渠道清单、`parseLatestYml()`、`rankFeeds()`（无 electron 依赖，可被 node:test 直接引） |
| `electron/feeds.test.mjs` | 新建 | `node:test` 用例 |
| `electron/update_probe.js` | 新建 | 依赖 electron `net` 的探测：`fetchLatestYml()`、`probeThroughput()`、`rankFeedsBySpeed()` |
| `electron/main.js` | 改 | 窗口选项、菜单 role 模板、窗口 IPC、更新 payload/策略、杀树 |
| `electron/preload.js` | 改 | 新增 3 个窗口方法 + 更新订阅保持不变 |
| `src/global.d.ts` | 改 | `DcaBridge` 增补窗口方法类型；`onUpdateAvailable` payload 加 `releaseNotes` |
| `src/store/workspace.tsx` | 新建 | 导航分区状态（`useWorkspace()`） |
| `src/store/updater.tsx` | 新建 | 更新状态机（常驻订阅 + 启动兜底检查） |
| `src/components/TitleBar.tsx` | 新建 | 标题栏（品牌/工作区名/扫描控件/进度/搜索/日志/更新方块/主题） |
| `src/components/NavRail.tsx` | 新建 | 48px 左侧导航 |
| `src/components/ScanControl.tsx` | 新建 | 盘符选择 + 开始/暂停（从 `DiskCleanupTool.tsx` 抽出） |
| `src/components/UpdateBox.tsx` | 新建 | 28×28 方块 + 进度 + 悬停浮层 |
| `src/components/Shell.tsx` | 重写 | 标题栏 + 导航 + 内容，删状态栏 |
| `src/components/ConfirmDialog.tsx` | 改 | 支持通用确认（标题/正文/确认文案），供更新重启复用 |
| `src/components/DiskCleanupTool.tsx` → `src/tools/disk-cleanup/DiskCleanupTool.tsx` | 改 | 消费 `useWorkspace()`，删出厂检测分支与 `.tool-header`/`.tool-tabs-row` |
| `src/App.tsx` | 改 | Provider 顺序：Theme → Toast → Updater → Scan → Workspace |
| `src/styles/global.css` | 改 | 新增 `--titlebar-h`/`--nav-rail-w`/`--fs-hero`，删 `--topbar-h`/`--statusbar-h`/`--sidebar-*`，删死类 |
| `src/styles/components.css` | 改 | 删 topbar/statusbar/tool-tabs 块，新增 titlebar/nav-rail/update-box 块 |
| `backend/core/watchdog.py` | 新建 | 父进程存活检测 + 看门狗线程 |
| `backend/tests/test_watchdog.py` | 新建 | pytest 用例 |
| `backend_launcher.py` | 改 | 解析 `--parent-pid=` 并启动看门狗 |
| `electron/backend_runner.js` | 改 | spawn 时传 `--parent-pid=<process.pid>` |
| `src/components/FactoryPanel.tsx` | 删 | 出厂检测 |
| `backend/core/factory_check.py` | 删 | 同上 |
| `backend/api/routes_factory.py` | 删 | 同上 |

---

## Task 1: 渠道测速选源（纯逻辑 TDD）

**Files:**
- Create: `electron/feeds.js`
- Create: `electron/feeds.test.mjs`
- Create: `electron/update_probe.js`
- Modify: `electron/main.js`（`UPDATE_FEEDS` 常量与 `checkWithFallback()`）

**Interfaces:**
- Consumes: 无
- Produces:
  - `FEEDS: {name: string, url: string}[]`（顺序即失败回退顺序）
  - `parseLatestYml(text: string): {version: string, asset: string} | null`
  - `rankFeeds(probes: {feed: string, ok: boolean, bytes: number, ms: number}[]): {ranked: string[], fastest: string | null, measured: number}`
  - `rankFeedsBySpeed(): Promise<{ranked: string[], fastest: string | null, measured: number, log: string[]}>`

- [ ] **Step 1: 先写失败测试**

创建 `electron/feeds.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { FEEDS, parseLatestYml, rankFeeds } from "./feeds.js";

const YML = [
  "version: 0.3.0",
  "files:",
  "  - url: DiskCleanup-Setup-0.3.0.exe",
  "    sha512: abc",
  "    size: 93312000",
  "path: DiskCleanup-Setup-0.3.0.exe",
  "sha512: abc",
  "releaseDate: '2026-09-18T12:00:00.000Z'",
].join("\n");

test("parseLatestYml 提取 version 与顶层 path", () => {
  assert.deepEqual(parseLatestYml(YML), { version: "0.3.0", asset: "DiskCleanup-Setup-0.3.0.exe" });
});

test("parseLatestYml 对非 yml 文本返回 null", () => {
  assert.equal(parseLatestYml("<html>404</html>"), null);
});

test("FEEDS 不含已实测不可用的 ghproxy.net，且保留直连", () => {
  const urls = FEEDS.map((f) => f.url).join(" ");
  assert.ok(!urls.includes("ghproxy.net"), "ghproxy.net 应已移除");
  assert.ok(urls.includes("ghfast.top"));
  assert.ok(urls.includes("github.com/liixnglinb/Disk-cleanup-assistant"));
});

test("rankFeeds 按吞吐降序", () => {
  const r = rankFeeds([
    { feed: "a", ok: true, bytes: 262144, ms: 200 },  // 1.31 MB/s
    { feed: "b", ok: true, bytes: 262144, ms: 170 },  // 1.54 MB/s
    { feed: "c", ok: false, bytes: 0, ms: 3000 },
  ]);
  assert.deepEqual(r.ranked, ["b", "a", "c"]);
  assert.equal(r.fastest, "b");
  assert.equal(r.measured, 2);
});

test("rankFeeds 把 bytes=0 的成功响应判为失败（防假报 0 字节）", () => {
  const r = rankFeeds([
    { feed: "a", ok: true, bytes: 0, ms: 50 },
    { feed: "b", ok: true, bytes: 262144, ms: 400 },
  ]);
  assert.equal(r.fastest, "b");
  assert.equal(r.measured, 1);
});

test("rankFeeds 全失败时回退原顺序（= FEEDS 顺序）", () => {
  const probes = FEEDS.map((f) => ({ feed: f.url, ok: false, bytes: 0, ms: 3000 }));
  const r = rankFeeds(probes);
  assert.deepEqual(r.ranked, FEEDS.map((f) => f.url));
  assert.equal(r.fastest, null);
  assert.equal(r.measured, 0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test electron/feeds.test.mjs`
Expected: FAIL —— `Cannot find module './feeds.js'`

- [ ] **Step 3: 实现纯逻辑**

创建 `electron/feeds.js`（**不得 require("electron")**，否则 node:test 引不动）：

```js
// 更新渠道与测速排序的纯逻辑。此文件不能 require("electron")，
// 因为 electron/feeds.test.mjs 用 node --test 直接引它。
const REPO = "github.com/liixnglinb/Disk-cleanup-assistant";

// 顺序 = 测速全部失败时的回退顺序。ghproxy.net 已移除：实测 36 KB/s，
// 基本不可用（见 Voyra 文档 §7.7 实测表）。
const FEEDS = [
  { name: "gh-proxy", url: `https://gh-proxy.com/https://${REPO}/releases/latest/download` },
  { name: "ghfast.top", url: `https://ghfast.top/https://${REPO}/releases/latest/download` },
  { name: "github", url: `https://${REPO}/releases/latest/download` },
];

/** 解析 electron-updater 的 latest.yml，取版本号与顶层 path（资产名）。 */
function parseLatestYml(text) {
  if (typeof text !== "string" || !text) return null;
  const version = text.match(/^version:\s*([^\s]+)\s*$/m);
  const asset = text.match(/^path:\s*([^\s]+)\s*$/m);
  if (!version || !asset) return null;
  return { version: version[1], asset: asset[1] };
}

/**
 * 按实测吞吐排序。吞吐 = bytes / ms。
 * bytes=0 或 ms=0 的"成功"响应用户视角等于没拿到数据，判为失败 —— 本机曾因
 * `curl -o /dev/null` 假报 0 字节而误判三个镜像全瘫。
 */
function rankFeeds(probes) {
  const measured = probes.filter((p) => p.ok && p.bytes > 0 && p.ms > 0);
  const bySpeed = measured
    .slice()
    .sort((a, b) => b.bytes / b.ms - a.bytes / a.ms)
    .map((p) => p.feed);
  const rest = probes.map((p) => p.feed).filter((f) => !bySpeed.includes(f));
  return { ranked: [...bySpeed, ...rest], fastest: bySpeed[0] ?? null, measured: measured.length };
}

module.exports = { FEEDS, parseLatestYml, rankFeeds };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test electron/feeds.test.mjs`
Expected: PASS（6 个用例）

- [ ] **Step 5: 实现 net 探测（两阶段）**

创建 `electron/update_probe.js`：

```js
const { net } = require("electron");
const { FEEDS, parseLatestYml, rankFeeds } = require("./feeds");

const SAMPLE_BYTES = 262144; // 256KB 采样，够区分 1.3MB/s 与 8KB/s
const LATEST_TIMEOUT = 4000;
const SAMPLE_TIMEOUT = 5000;

/** 取文本：累计真实收到的字节长度，不用 Content-Length 推断。 */
function getText(url, { timeoutMs = LATEST_TIMEOUT, rangeEnd = null } = {}) {
  return new Promise((resolve) => {
    let received = 0;
    const chunks = [];
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve({ ok, bytes: received, text: Buffer.concat(chunks).toString("utf8") });
    };
    try {
      const req = net.request({ method: "GET", url });
      if (rangeEnd !== null) req.setHeader("Range", `bytes=0-${rangeEnd}`);
      req.on("response", (res) => {
        const okStatus = res.statusCode >= 200 && res.statusCode < 400;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (chunks.length < 64) chunks.push(chunk);
          if (rangeEnd !== null && received >= rangeEnd + 1) {
            try { req.abort(); } catch { /* ignore */ }
            finish(okStatus);
          }
        });
        res.on("end", () => finish(okStatus));
        res.on("error", () => finish(false));
      });
      req.on("error", () => finish(false));
      setTimeout(() => {
        try { req.abort(); } catch { /* ignore */ }
        finish(received > 0);
      }, timeoutMs);
      req.end();
    } catch {
      finish(false);
    }
  });
}

/** 对某个渠道的安装包做 256KB 采样，返回吞吐样本。 */
async function probeThroughput(feedUrl, asset) {
  const started = Date.now();
  const r = await getText(`${feedUrl}/${asset}`, { rangeEnd: SAMPLE_BYTES - 1, timeoutMs: SAMPLE_TIMEOUT });
  const ms = Date.now() - started;
  return { feed: feedUrl, ok: r.ok && r.bytes > 0, bytes: r.bytes, ms };
}

/**
 * 两阶段：先并发探 latest.yml 拿到真实资产名（小文件只判可达），
 * 再对安装包做 Range 采样测吞吐（大文件才反映真实速度）。
 */
async function rankFeedsBySpeed() {
  const log = [];
  const first = await Promise.all(
    FEEDS.map(async (f) => {
      const r = await getText(`${f.url}/latest.yml`);
      const parsed = r.ok ? parseLatestYml(r.text) : null;
      log.push(`latest.yml ${f.name}: ${parsed ? "ok" : "fail"} (${r.bytes}B)`);
      return { feed: f.url, name: f.name, asset: parsed ? parsed.asset : null };
    }),
  );
  const asset = (first.find((x) => x.asset) || {}).asset;
  if (!asset) {
    log.push("没有渠道能取到 latest.yml，按默认顺序回退");
    return { ...rankFeeds(FEEDS.map((f) => ({ feed: f.url, ok: false, bytes: 0, ms: 1 }))), log };
  }
  const probes = [];
  for (const f of first) {
    if (!f.asset) {
      probes.push({ feed: f.feed, ok: false, bytes: 0, ms: 1 });
      continue;
    }
    const p = await probeThroughput(f.feed, asset);
    log.push(`采样 ${f.name}: ${(p.bytes / 1024).toFixed(0)}KB/${p.ms}ms = ${(p.bytes / 1024 / p.ms).toFixed(0)}KB/ms`);
    probes.push(p);
  }
  const out = rankFeeds(probes);
  log.push(`选定：${out.fastest ?? "无（回退默认顺序）"}`);
  return { ...out, log };
}

module.exports = { rankFeedsBySpeed, getText };
```

- [ ] **Step 6: 接进主进程**

在 `electron/main.js` 中：

1. 在 `const { startBackend } = require("./backend_runner");` 下方加：

```js
const { rankFeedsBySpeed } = require("./update_probe");
```

2. 删除整个 `UPDATE_FEEDS` 常量块（含其上方 3 行注释），保留 `PRIMARY_FEED` 定义与注释（`package.json` 的 `build.publish` 仍需与之保持一致）。

3. 用测速版替换 `checkWithFallback()` 整个函数：

```js
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
```

- [ ] **Step 7: 跑测试与语法校验**

Run: `node --test electron/feeds.test.mjs && node -c electron/update_probe.js 2>/dev/null || node --check electron/update_probe.js`
Expected: 6 passed；`--check` 无输出（语法通过）

- [ ] **Step 8: 提交**

```bash
git add electron/feeds.js electron/feeds.test.mjs electron/update_probe.js electron/main.js
git commit -m "feat(update): 渠道选择改为两阶段真测速，移除 36KB/s 的 ghproxy.net"
```

---

## Task 2: 主进程窗口外壳（hidden 标题栏 + 菜单 + 窗口 IPC）

**Files:**
- Modify: `electron/main.js`（`BrowserWindow` 选项、菜单、IPC、退出杀树）
- Modify: `electron/preload.js`
- Modify: `src/global.d.ts`

**Interfaces:**
- Consumes: 无
- Produces（渲染层可用的 bridge）：
  - `window.dca.toggleMaximize(): Promise<{maximized: boolean}>`
  - `window.dca.setTitleBarOverlay(theme: "light" | "dark"): Promise<{ok: boolean}>`
  - `window.dca.onMaximizedChanged(cb: (m: {maximized: boolean}) => void): () => void`

- [ ] **Step 1: 改窗口选项与菜单**

在 `electron/main.js` 的 `const { app, BrowserWindow, ipcMain, shell, Notification } = require("electron");` 一行改为：

```js
const { app, BrowserWindow, ipcMain, shell, Notification, Menu } = require("electron");
```

在 `createWindow(port, apiToken)` 的 `mainWindow = new BrowserWindow({ ... })` 处，把对象替换为：

```js
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
```

在 `app.whenReady()` 之前（`app.setAppUserModelId(...)` 一行下方）加入菜单与窗口 IPC：

```js
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
```

在 `createWindow` 内、`mainWindow.loadURL/loadFile` 之后加入隐藏菜单栏：

```js
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);
```

- [ ] **Step 2: 退出杀树（bug-6 主进程侧）**

把 `app.on("will-quit", ...)` 整块替换为：

```js
  function killBackendTree() {
    if (!backendHandle || !backendHandle.child) return;
    const pid = backendHandle.child.pid;
    backendHandle = null;
    if (!pid) return;
    try {
      // child.kill() 在 Windows 上不保证杀子树；taskkill /T 连子进程一起收
      require("child_process").execFile("taskkill", ["/PID", String(pid), "/T", "/F"], () => {});
    } catch (_) {
      /* ignore */
    }
  }

  app.on("before-quit", killBackendTree);
  app.on("will-quit", killBackendTree);
  process.on("exit", killBackendTree);
```

- [ ] **Step 3: 补 bridge 与类型**

在 `electron/preload.js` 的 `// ---- 自动更新（electron-updater）----` 区块**上方**插入：

```js
  // ---- 窗口控制（标题栏由渲染层自绘，按钮由系统 overlay 绘制）----
  toggleMaximize: () => ipcRenderer.invoke("win:toggle-maximize"),
  setTitleBarOverlay: (theme) => ipcRenderer.invoke("win:set-titlebar-overlay", theme),
  onMaximizedChanged: (cb) => subscribe("win:maximized-changed", cb),
```

在 `src/global.d.ts` 的 `interface DcaBridge { ... }` 内、`getApiToken` 一行下方插入：

```ts
  toggleMaximize: () => Promise<{ maximized: boolean }>;
  setTitleBarOverlay: (theme: "light" | "dark") => Promise<{ ok: boolean }>;
  onMaximizedChanged: (cb: (m: { maximized: boolean }) => void) => () => void;
```

同时把 `onUpdateAvailable` 的 payload 类型改为：

```ts
  onUpdateAvailable: (
    cb: (i: { latest: string; current: string; releaseDate?: string; releaseNotes?: string }) => void,
  ) => () => void;
```

- [ ] **Step 4: 启动验证（开发模式）**

Run:
```bash
npm run dev:renderer            # 终端 A：常驻
```
另开终端 Run: `ELECTRON_START_URL=http://127.0.0.1:5173 npx electron .`

Expected（逐条目视确认，全部通过才算完成）：
1. 窗口**没有**原生标题栏与菜单栏（应无"文件/编辑/视图/窗口/帮助"，也不再有"Help"）。
2. 窗口右上角有原生最小化/最大化/关闭三个按钮，可点，可拖动窗口边缘缩放。
3. 按 `Ctrl+C`/`Ctrl+V` 在页面任意输入框可用（文本框里粘贴文本成功）。
4. 拖动窗口到屏幕顶端 → 出现贴边最大化预览；`Win+←` 可半屏吸附。
5. 双击顶部拖拽区（尚未自绘，此步先双击原生 overlay 之外的区域）能最大化。

- [ ] **Step 5: 记录 DPI 实测值**

在应用窗口内按 `F12` 打开 DevTools，Console 执行：

```js
const r = document.querySelector(".app")?.getBoundingClientRect();
console.log("app rect", r && { w: r.width, h: r.height }, "dpr", devicePixelRatio, "innerH", innerHeight);
```

把 `dpr` 与 `innerHeight` 抄进 commit message 正文（后续 Task 4 要据此核对标题栏落地像素）。预期 `dpr` 为 1.25 或 1.5（若为 1 说明本机 100% 缩放）。

- [ ] **Step 6: 提交**

```bash
git add electron/main.js electron/preload.js src/global.d.ts
git commit -m "feat(shell): 改用 hidden 标题栏 + 原生 overlay，保留编辑加速器与杀树退出

dpr=<实测>; innerHeight=<实测>"
```

---

## Task 3: 删除出厂检测全链路

**Files:**
- Delete: `src/components/FactoryPanel.tsx`
- Delete: `backend/core/factory_check.py`
- Delete: `backend/api/routes_factory.py`
- Modify: `src/tools/disk-cleanup/DiskCleanupTool.tsx`、`src/api/client.ts`、`src/types.ts`、`backend/tools/disk_cleanup.py`

**Interfaces:**
- Consumes: 无
- Produces: 无（纯删除；`DiskCleanupTool` 的分区列表在 Task 4 会被重写）

- [ ] **Step 1: 确认没有遗漏引用**

Run:
```bash
grep -rn "factory\|Factory" src/ backend/ --include=*.ts --include=*.tsx --include=*.py | grep -v "default_factory"
```
Expected: 输出正好是下面 Step 2-4 要改的那几处（`client.ts` 的 import 与 `factoryCheck`、`types.ts` 的三个接口、`DiskCleanupTool.tsx` 的三处、`backend/tools/disk_cleanup.py` 的两处）。若出现其它文件，先补进本任务的改动清单。

- [ ] **Step 2: 删文件与后端注册**

```bash
git rm src/components/FactoryPanel.tsx backend/core/factory_check.py backend/api/routes_factory.py
```

在 `backend/tools/disk_cleanup.py` 中删除 `routes_factory,`（import 列表内）与 `routes_factory.router,`（`routers` 列表内）两行。

- [ ] **Step 3: 清前端引用**

`src/api/client.ts`：
- import 列表中的 `FactoryCheckResult,` 一行删除
- 删除 `factoryCheck: () => request<FactoryCheckResult>("/api/factory/check"),` 整行

`src/types.ts`：删除 `export interface FactoryDevice {...}`、`export interface FactoryItem {...}`、`export interface FactoryCheckResult {...}` 三个接口。

`src/tools/disk-cleanup/DiskCleanupTool.tsx`：删除 `import FactoryPanel from "../../components/FactoryPanel";`、`TABS` 数组里的 `{ key: "factory", label: "出厂检测", icon: "shield" },` 一行、以及 `{tab === "factory" && <FactoryPanel />}` 一行。

- [ ] **Step 4: 验证测试与类型**

Run:
```bash
.venv/Scripts/python.exe -m pytest backend/tests -q
npm run typecheck
```
Expected: `37 passed`（数量不变，出厂检测无测试）；typecheck 无错误

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor: 删除出厂检测全链路（平台化遗留，与磁盘清理定位无关）"
```

---

## Task 4: 应用外壳重写（TitleBar + NavRail + 删状态栏）

**Files:**
- Create: `src/store/workspace.tsx`
- Create: `src/components/TitleBar.tsx`
- Create: `src/components/NavRail.tsx`
- Create: `src/components/ScanControl.tsx`
- Rewrite: `src/components/Shell.tsx`
- Modify: `src/App.tsx`、`src/tools/disk-cleanup/DiskCleanupTool.tsx`
- Modify: `src/styles/global.css`、`src/styles/components.css`

**Interfaces:**
- Consumes: `useScan()`（`src/store/ScanContext.tsx`：`scanId/status/statistics/error/startScan/pause/resume/cancel`）、`useTheme()`（`src/hooks/useTheme.tsx`：`theme/toggleTheme`）、`useToasts()`（`src/store/ToastContext.tsx`）
- Produces:
  - `SectionKey = "overview" | "files" | "cache" | "kb" | "software" | "duplicates" | "logs" | "settings"`
  - `useWorkspace(): { section: SectionKey, setSection: (s: SectionKey) => void }`
  - `<TitleBar />`、`<NavRail />`（由 `Shell` 内部渲染）

> **注意**：本任务的分区仍是 P1 的**临时**入口（8 项，沿用现有面板）。P3 会把 文件/缓存/重复/百科 收敛为「清理」工作区、把 日志 改为抽屉，届时只需改 `SECTIONS` 数组与渲染分支。

- [ ] **Step 1: 建 workspace store**

创建 `src/store/workspace.tsx`：

```tsx
import React, { createContext, useContext, useMemo, useState } from "react";

export type SectionKey =
  | "overview" | "files" | "cache" | "kb" | "software" | "duplicates" | "logs" | "settings";

interface WorkspaceCtx {
  section: SectionKey;
  setSection: (s: SectionKey) => void;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export const SECTIONS: { key: SectionKey; label: string; icon: string }[] = [
  { key: "overview", label: "概览", icon: "chart" },
  { key: "files", label: "文件清理", icon: "file" },
  { key: "cache", label: "缓存清理", icon: "eraser" },
  { key: "kb", label: "目录百科", icon: "book" },
  { key: "software", label: "软件管理", icon: "package" },
  { key: "duplicates", label: "重复文件", icon: "copy" },
  { key: "logs", label: "删除日志", icon: "log" },
  { key: "settings", label: "设置", icon: "settings" },
];

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [section, setSection] = useState<SectionKey>("overview");
  const value = useMemo(() => ({ section, setSection }), [section]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace 必须在 WorkspaceProvider 内使用");
  return v;
}
```

- [ ] **Step 2: 抽扫描控件**

创建 `src/components/ScanControl.tsx`（从 `DiskCleanupTool.tsx:34-82` 的 `HeaderScanControl` 迁移，改为标题栏内联样式 + 显示真实 percent）：

```tsx
import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import Icon from "./icons";
import { useScan } from "../store/ScanContext";
import { loadSettings } from "./SettingsPanel";
import type { DriveInfo } from "../types";
import { formatBytes } from "../utils/format";

export default function ScanControl() {
  const { status, startScan, pause, resume } = useScan();
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDrive, setSelectedDrive] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api.drives()
      .then((r) => {
        setDrives(r.items);
        if (r.items.length) setSelectedDrive((p) => p || r.items[0].drive);
      })
      .catch(() => {});
  }, []);

  const running = status?.status === "running" || status?.status === "starting";
  const paused = status?.status === "paused";

  const onStart = async () => {
    if (!selectedDrive || starting || running) return;
    setStarting(true);
    try {
      await startScan(selectedDrive, loadSettings().largeFileMb);
    } finally {
      setStarting(false);
    }
  };

  const pct = typeof status?.percent === "number" ? status.percent : null;

  return (
    <div className="titlebar-scan no-drag">
      <select
        className="drive-select"
        value={selectedDrive}
        onChange={(e) => setSelectedDrive(e.target.value)}
        disabled={running || paused || starting}
      >
        {drives.map((d) => (
          <option key={d.drive} value={d.drive}>
            {d.drive}（可用 {formatBytes(d.free)}）
          </option>
        ))}
      </select>
      {!running && !paused && (
        <button className="btn primary small" onClick={onStart} disabled={!selectedDrive || starting}>
          <Icon name="play" size={13} /> 开始扫描
        </button>
      )}
      {running && (
        <>
          <span className="titlebar-progress" title={status?.current_path || ""}>
            <i style={{ width: `${pct ?? 0}%` }} />
          </span>
          <span className="num dim">{pct === null ? "…" : `${pct}%`}</span>
          <button className="btn small" onClick={pause}>
            <Icon name="pause" size={13} /> 暂停
          </button>
        </>
      )}
      {paused && (
        <button className="btn small" onClick={resume}>
          <Icon name="play" size={13} /> 继续
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 建导航栏**

创建 `src/components/NavRail.tsx`：

```tsx
import React from "react";
import Icon from "./icons";
import { SECTIONS, useWorkspace } from "../store/workspace";

export default function NavRail() {
  const { section, setSection } = useWorkspace();
  return (
    <nav className="nav-rail" aria-label="主导航">
      {SECTIONS.map((s) => (
        <button
          key={s.key}
          className={`rail-item ${section === s.key ? "active" : ""}`}
          onClick={() => setSection(s.key)}
          title={s.label}
          aria-current={section === s.key ? "page" : undefined}
        >
          <Icon name={s.icon} size={20} />
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: 建标题栏**

创建 `src/components/TitleBar.tsx`：

```tsx
import React, { useEffect, useState } from "react";
import Icon from "./icons";
import ScanControl from "./ScanControl";
import UpdateBox from "./UpdateBox";
import { SECTIONS, useWorkspace } from "../store/workspace";
import { useTheme } from "../hooks/useTheme";

export default function TitleBar() {
  const { section, setSection } = useWorkspace();
  const { theme, toggleTheme } = useTheme();
  const [maximized, setMaximized] = useState(false);
  const label = SECTIONS.find((s) => s.key === section)?.label ?? "";

  useEffect(() => {
    window.dca?.setTitleBarOverlay?.(theme);
  }, [theme]);

  useEffect(() => window.dca?.onMaximizedChanged?.((m) => setMaximized(m.maximized)), []);

  const onDoubleClick = () => {
    window.dca?.toggleMaximize?.().then((r) => setMaximized(r.maximized));
  };

  return (
    <header className="titlebar" onDoubleClick={onDoubleClick}>
      <div className="titlebar-brand">
        <span className="titlebar-logo"><Icon name="eraser" size={16} /></span>
        <span className="titlebar-title">磁盘清理助手</span>
        <span className="titlebar-sep" />
        <span className="titlebar-section">{label}</span>
      </div>
      <ScanControl />
      <div className="titlebar-drag" />
      <div className="titlebar-actions no-drag">
        <button className="icon-btn" title="目录百科搜索" onClick={() => setSection("kb")}>
          <Icon name="search" size={16} />
        </button>
        <button className="icon-btn" title="删除日志" onClick={() => setSection("logs")}>
          <Icon name="log" size={16} />
        </button>
        <button
          className="icon-btn"
          title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          onClick={toggleTheme}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
        </button>
      </div>
      <div className="titlebar-overlay-gap" />
    </header>
  );
}
```

> `UpdateBox` 由 Task 5 创建；本任务先用占位：在同目录建 `src/components/UpdateBox.tsx`，内容为 `export default function UpdateBox() { return null; }`，Task 5 再替换为真实实现。

- [ ] **Step 5: 重写 Shell**

把 `src/components/Shell.tsx` 整体替换为：

```tsx
import React from "react";
import TitleBar from "./TitleBar";
import NavRail from "./NavRail";
import { useScan } from "../store/ScanContext";

export default function Shell({ children }: { children: React.ReactNode }) {
  const { status } = useScan();
  const running = status?.status === "running" || status?.status === "starting";

  return (
    <div className={`app ${running ? "is-scanning" : ""}`}>
      <TitleBar />
      <div className="workspace">
        <NavRail />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
```

要点：**删除** `.statusbar` 整块、`TopbarDrives` 组件、`deriveStatusInfo`、`StatusInfo` 导出、以及 `window.addEventListener("ltb-scan-status")`（扫描状态改为直接消费 `useScan()`）。

- [ ] **Step 6: 改 App 与工具面板**

`src/App.tsx` 替换为：

```tsx
import React from "react";
import DiskCleanupTool from "./tools/disk-cleanup/DiskCleanupTool";
import Shell from "./components/Shell";
import { ToastProvider } from "./store/ToastContext";
import { ThemeProvider } from "./hooks/useTheme";
import { ScanProvider } from "./store/ScanContext";
import { WorkspaceProvider } from "./store/workspace";
import { UpdaterProvider } from "./store/updater";

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <UpdaterProvider>
          <ScanProvider>
            <WorkspaceProvider>
              <Shell>
                <DiskCleanupTool />
              </Shell>
            </WorkspaceProvider>
          </ScanProvider>
        </UpdaterProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
```

> `UpdaterProvider` 由 Task 5 创建；本任务先建 `src/store/updater.tsx`，内容为 `export function UpdaterProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }`，Task 5 再替换。

`src/tools/disk-cleanup/DiskCleanupTool.tsx` 改为消费 `useWorkspace()`：
- 删除 `TABS`、`TabKey`、`HeaderScanControl`、`.tool-header` 整块、`.tool-tabs-row` 整块
- `function ToolScreen()` 内 `const [tab, setTab] = useState<TabKey>("overview")` 改为 `const { section: tab, setSection: setTab } = useWorkspace()`
- 删除 `import FactoryPanel`（Task 3 已删）
- `export default function DiskCleanupTool()` 不再包 `ScanProvider`（已上提到 App）：

```tsx
export default function DiskCleanupTool() {
  return <ToolScreen />;
}
```

- [ ] **Step 7: 改样式**

`src/styles/global.css`：
- `--topbar-h: 48px;` 与 `--statusbar-h: 30px;` 两行替换为 `--titlebar-h: 34px;` 与 `--nav-rail-w: 48px;`
- 删除 `--sidebar-w: 204px;` 与 `--sidebar-bg` 两处（`:root` 与 `[data-theme="dark"]` 各一处）
- 字号刻度区新增一行：`--fs-hero: 40px;   /* 概览英雄位数字 */`
- 新增主题色声明：`:root { color-scheme: light; }`（加在 `:root` 块内）与 `[data-theme="dark"] { color-scheme: dark; }`（加在该块内）
- 删除 `.side-item:active` / `.side-item` 相关规则（`components.css` 内）与 `.mtool-card` 相关规则

`src/styles/components.css`：
- 删除 `.topbar` 块（第 6-29 行）与 `.statusbar`/`.workspace`/`.main`/`.content` 中的 `.statusbar` 定义，替换为：

```css
/* ---------------- 标题栏（自绘，与系统 overlay 同高） ---------------- */
.titlebar {
  height: var(--titlebar-h);
  display: flex; align-items: center; gap: var(--space-2);
  padding-left: var(--space-3);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  user-select: none;
  flex: none;
}
.titlebar .no-drag,
.titlebar button,
.titlebar select,
.titlebar input { -webkit-app-region: no-drag; }
.titlebar-brand { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.titlebar-logo {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: var(--radius-sm);
  background: var(--primary-soft); color: var(--primary);
}
.titlebar-title { font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: var(--text); }
.titlebar-sep { width: 1px; height: 14px; background: var(--border-strong); }
.titlebar-section { font-size: var(--fs-sm); color: var(--text-muted); }
.titlebar-drag { flex: 1 1 auto; height: 100%; }
.titlebar-actions { display: flex; align-items: center; gap: 2px; }
/* 给系统 overlay 按钮区留位：Windows 上约 138px / 缩放比，用 env() 兜底 */
.titlebar-overlay-gap { width: env(titlebar-area-width, 138px); flex: none; }
.titlebar-scan { display: flex; align-items: center; gap: var(--space-2); }
.titlebar-progress {
  position: relative; width: 90px; height: 4px; border-radius: var(--radius-full);
  background: var(--surface-hover); overflow: hidden;
}
.titlebar-progress > i {
  position: absolute; inset: 0 auto 0 0; background: var(--primary);
  transition: width 0.3s var(--ease-out);
}

/* ---------------- 左侧导航栏 ---------------- */
.nav-rail {
  width: var(--nav-rail-w); flex: none;
  display: flex; flex-direction: column; align-items: center;
  gap: 2px; padding: var(--space-2) 0;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border);
}
.rail-item {
  position: relative;
  width: 36px; height: 36px; border: 0; border-radius: var(--radius-sm);
  background: transparent; color: var(--text-muted); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.rail-item:hover { background: var(--surface-hover); color: var(--text); }
.rail-item.active { background: var(--primary-soft); color: var(--primary); }
.rail-item.active::before {
  content: ""; position: absolute; left: -6px; top: 8px; bottom: 8px;
  width: 2px; border-radius: var(--radius-full); background: var(--primary);
}
```

- 删除 `.tool-tabs-row` / `.tool-tabs` / `.tool-tab` 相关的全部规则
- `.content` 的 `padding: var(--content-pad)` 保留，但把 `overflow: auto` 之外多余的 `.main` 中间层去掉（`.workspace` 直接是 `display:flex`，内容是唯一滚动容器）

- [ ] **Step 8: 类型检查与构建**

Run: `npm run typecheck && npm run build:renderer`
Expected: 均无错误

- [ ] **Step 9: 真实渲染验证（CDP 断言）**

启动后端与前端：
```bash
.venv/Scripts/python.exe scripts/run_dev.py --port=17801   # 另开终端常驻
npm run dev:renderer                                        # 另开终端常驻
```
用 chrome-devtools MCP 打开 `http://127.0.0.1:5173/?backend=17801`，`resize_page` 成 1280×820，然后在 Console 执行：

```js
(() => {
  const q = (s) => document.querySelector(s);
  const r = (s) => { const e = q(s); return e ? e.getBoundingClientRect() : null; };
  const out = {
    titlebar: r(".titlebar")?.height,
    rail: r(".nav-rail")?.width,
    statusbarGone: q(".statusbar") === null,
    bandsAboveContent: [".titlebar"].length,
    dpr: devicePixelRatio,
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
})()
```

Expected（逐条断言）：
- `titlebar === 34`（若 `dpr` 为 1.25/1.5 时读数不等于 34，说明本机缩放影响了落地像素 → 记录实测值并改用 `env(titlebar-area-height)`）
- `rail === 48`
- `statusbarGone === true`

再截图确认：**内容区上方只有两条横带**（标题栏 + 尚未重做的工作区头）；浅色与深色各截一张（切主题用标题栏的月亮/太阳按钮），深色下确认搜索框不再是纯白底、复选框不是纯白块。

- [ ] **Step 10: 三档宽度回归**

依次把页面宽度改为 1280 / 980 / 760，各截一张图。
Expected: 标题栏内品牌与动作按钮不重叠、不溢出裁切；`980` 为窗口 `minWidth`，是必须成立的档位。

- [ ] **Step 11: 提交**

```bash
git add -A
git commit -m "feat(shell): 自绘标题栏 + 48px 左侧导航栏，删除状态栏与 9 页签行"
```

---

## Task 5: 更新状态上提 + 标题栏下载框 + 悬停内容 + 确认重启

**Files:**
- Create: `src/store/updater.tsx`
- Create: `src/components/UpdateBox.tsx`
- Modify: `src/App.tsx`（把占位 Provider 换成真实实现）
- Modify: `src/components/SettingsPanel.tsx`（删除局部更新状态机，改消费 store）
- Modify: `src/components/ConfirmDialog.tsx`（支持通用确认）
- Modify: `electron/main.js`（启动推送补 releaseNotes、显式下载 + 去重闸门、退出静默安装改 false）
- Modify: `scripts/check_versions.py`（移除 SettingsPanel 落点，8 → 7 处）
- Modify: `README.md:154`（"10 处" → "7 处"）

**Interfaces:**
- Consumes: `window.dca.checkUpdate/downloadUpdate/installUpdate/onUpdateAvailable/onUpdateProgress/onUpdateDownloaded/onUpdateError`
- Produces:
  - `type UpdateState = { phase: "idle" | "checking" | "latest" | "available" | "downloading" | "ready" | "error"; latest?: string; current?: string; releaseDate?: string; releaseNotes?: string; percent?: number; error?: string }`
  - `useUpdater(): { state: UpdateState, check: () => Promise<void>, install: () => Promise<void> }`

- [ ] **Step 1: 建更新 store**

创建 `src/store/updater.tsx`：

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface UpdateState {
  phase: "idle" | "checking" | "latest" | "available" | "downloading" | "ready" | "error";
  latest?: string;
  current?: string;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  error?: string;
}

interface UpdaterCtx {
  state: UpdateState;
  check: () => Promise<void>;
  install: () => Promise<void>;
}

const Ctx = createContext<UpdaterCtx | null>(null);

export function UpdaterProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });

  const check = useCallback(async () => {
    if (!window.dca) {
      setState({ phase: "error", error: "当前环境不支持自动更新（仅桌面版可用）" });
      return;
    }
    setState((p) => ({ ...p, phase: "checking" }));
    try {
      const r = await window.dca.checkUpdate();
      if (!r.ok) {
        setState({ phase: "error", error: r.error || "检查更新失败" });
        return;
      }
      setState(
        r.hasUpdate
          ? { phase: "available", latest: r.latest, current: r.current, releaseDate: r.releaseDate, releaseNotes: r.releaseNotes }
          : { phase: "latest", latest: r.latest, current: r.current },
      );
    } catch (e) {
      setState({ phase: "error", error: String(e instanceof Error ? e.message : e) });
    }
  }, []);

  // 常驻订阅：挂载即生效，不再随设置页卸载而丢失事件
  useEffect(() => {
    if (!window.dca) return;
    const offs = [
      window.dca.onUpdateAvailable((i) =>
        setState({ phase: "available", latest: i.latest, current: i.current, releaseDate: i.releaseDate, releaseNotes: i.releaseNotes }),
      ),
      window.dca.onUpdateProgress((p) => setState((s) => ({ ...s, phase: "downloading", percent: p.percent }))),
      window.dca.onUpdateDownloaded((i) => setState((s) => ({ ...s, phase: "ready", latest: i.version || s.latest, percent: 100 }))),
      window.dca.onUpdateError((e) => setState((s) => ({ ...s, phase: "error", error: e.message }))),
    ];
    // 兜底：主进程 5s 静默检查若早于本订阅，事件会丢，这里主动补一次
    const t = setTimeout(() => { void check(); }, 1500);
    return () => {
      offs.forEach((off) => off());
      clearTimeout(t);
    };
  }, [check]);

  const install = useCallback(async () => {
    await window.dca?.installUpdate();
  }, []);

  const value = useMemo(() => ({ state, check, install }), [state, check, install]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUpdater(): UpdaterCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUpdater 必须在 UpdaterProvider 内使用");
  return v;
}
```

- [ ] **Step 2: 建下载框（无箭头、有进度、悬停显示内容）**

创建 `src/components/UpdateBox.tsx`：

```tsx
import React, { useState } from "react";
import Icon from "./icons";
import ConfirmDialog from "./ConfirmDialog";
import { useUpdater } from "../store/updater";

export default function UpdateBox() {
  const { state, install } = useUpdater();
  const [hover, setHover] = useState(false);
  const [asking, setAsking] = useState(false);

  if (state.phase === "idle" || state.phase === "checking" || state.phase === "latest" || state.phase === "error") {
    return null;
  }

  const pct = Math.max(0, Math.min(100, Math.round(state.percent ?? 0)));
  const downloading = state.phase === "downloading";
  const ready = state.phase === "ready";

  return (
    <div
      className="update-box-wrap no-drag"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        className={`update-box ${downloading ? "is-downloading" : ""} ${ready ? "is-ready" : ""}`}
        style={downloading ? { background: `conic-gradient(var(--primary) ${pct * 3.6}deg, var(--surface-hover) 0deg)` } : undefined}
        onClick={() => { if (ready) setAsking(true); }}
        aria-label={ready ? "更新已下载，点击安装" : downloading ? `正在下载更新 ${pct}%` : "发现新版本"}
      >
        <span className="update-box-inner">
          {ready ? <Icon name="check" size={14} /> : downloading ? `${pct}` : `v${state.latest ?? ""}`}
        </span>
      </button>

      {hover && (
        <div className="update-pop" role="tooltip">
          <div className="update-pop-head">
            <strong>v{state.latest}</strong>
            {state.releaseDate ? <span className="dim">{state.releaseDate.slice(0, 10)}</span> : null}
          </div>
          {state.releaseNotes ? <div className="update-pop-body">{state.releaseNotes}</div> : <div className="update-pop-body dim">发布说明未提供。</div>}
          <div className="update-pop-foot">
            {downloading ? `正在下载 ${pct}%` : ready ? "点击安装并重启" : "正在准备下载…"}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={asking}
        title="是否现在更新并重启？"
        body={`将安装 v${state.latest} 并立即重启软件。当前未保存的操作会丢失。`}
        confirmText="更新并重启"
        onCancel={() => setAsking(false)}
        onConfirm={async () => { setAsking(false); await install(); }}
      />
    </div>
  );
}
```

- [ ] **Step 3: 让 ConfirmDialog 支持通用确认**

`src/components/ConfirmDialog.tsx` 现有 props 是删除专用（读设置里的永久删除/还原点）。新增一组可选 props，**当传入 `open` + `title` + `onConfirm` 时走通用模式**，不传时保持原删除行为：

```tsx
export interface GenericConfirmProps {
  open?: boolean;
  title?: string;
  body?: string;
  confirmText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}
```

在组件签名里接收这些可选 props；渲染时若 `title` 存在则以通用文案渲染，且**不渲染**永久删除勾选、还原点提示、安全提示段落。删除路径的调用方（`CachePanel.tsx:206`、`ConfirmModal` 的使用点）不改行为。

- [ ] **Step 4: 设置页改消费 store**

`src/components/SettingsPanel.tsx`：
- 删除组件内 `update` 局部状态、`useEffect` 里的四处订阅（`:197-202`）、`checkUpdate`/`startDownload`/`installUpdate` 三个局部函数（`:205-243`）
- 顶部改为 `const { state: update, check: checkUpdate, install: installUpdate } = useUpdater();`
- 「关于」区块的状态文案映射改为消费 `update.phase`：
  - `idle` → "发现新版本后会自动下载，点击标题栏的更新方块即可重启安装。"
  - `checking` → "正在检查最新版本…"
  - `latest` → `已是最新版本 v${update.current}。`
  - `available` → `发现新版本 v${update.latest}，正在准备下载…`
  - `downloading` → `正在下载 v${update.latest} … ${(update.percent ?? 0).toFixed(1)}%`
  - `ready` → `v${update.latest} 已下载完成，点击标题栏的更新方块完成安装。`
  - `error` → `update.error`
- 版本号显示改用 `__APP_VERSION__`，删除硬编码回退串 `"0.3.0"`（`:387`）

- [ ] **Step 5: 主进程策略与 payload**

`electron/main.js`：

1. `autoUpdater.autoDownload = false;` 一行上方注释改为：
```js
// 保持 false，由 update-available 处理器显式下载：这样测速可插在检查与下载之间
autoUpdater.autoDownload = false;
```
2. `autoUpdater.autoInstallOnAppQuit = true;` 改为 `false`，注释改为：
```js
autoUpdater.autoInstallOnAppQuit = false; // 必须由用户点「更新并重启」确认，退出时不静默安装
```
3. 新增显式自动下载（放在 `autoUpdater.on("update-downloaded", ...)` 之后）。**必须带去重闸门**：渲染层 1.5s 会主动补一次 `checkUpdate()`，主进程 5s 再查一次，两次都会触发 `update-available`，不加闸门可能对 89MB 安装包发起重复下载：

```js
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
```

并在 `autoUpdater.on("update-downloaded", ...)` 内、`send("update:downloaded", ...)` 上方加入两行：

```js
  downloadedVersion = downloadingVersion;
  downloadingVersion = null;
```
4. `scheduleStartupCheck()` 内的 payload 补 releaseNotes（`const payload = { latest, current, releaseDate }` 处）：
```js
      const notes = typeof info.releaseNotes === "string" ? info.releaseNotes : "";
      const payload = {
        latest,
        current: app.getVersion(),
        releaseDate: info.releaseDate || "",
        releaseNotes: notes.slice(0, 2000),
      };
```
5. `ipcMain.handle("update:check")` 返回值里 `releaseNotes: notes.slice(0, 800)` 改为 `notes.slice(0, 2000)`。

- [ ] **Step 5b: 收尾版本落点（否则校验必失败）**

`SettingsPanel.tsx` 不再含字面版本号后，`scripts/check_versions.py` 里针对它的正则必然"未匹配"，而该脚本被设计成"落点读不到即返回 1"（防假通过），会让后续 `npm run check:versions` 直接失败。

1. 删除 `scripts/check_versions.py` 中 `TEXT_TARGETS` 的最后一项：

```python
    # 前端只保留这一处：Shell 的版本号已改为 vite define 注入（__APP_VERSION__，源即
    # package.json），registry.tsx 已随多工具平台机制移除——两者都不再是独立落点。
    ("src/components/SettingsPanel.tsx", r'"(\d+\.\d+\.\d+)"'),
```

替换为：

```python
    # 前端已无独立版本落点：Shell 与 SettingsPanel 的版本号都由 vite define 注入
    # （__APP_VERSION__，源即 package.json），registry.tsx 随多工具平台机制移除。
```

2. `README.md:154` 把"校验 10 处版本号是否一致"改为"校验 7 处版本号是否一致"。

3. 验证：

Run: `./.venv/Scripts/python.exe scripts/check_versions.py; echo "exit=$?"`
Expected: 打印 `全部 7 处版本号一致: 0.3.0`，`exit=0`

- [ ] **Step 5c: 类型检查与构建**

Run: `npm run typecheck && npm run build:renderer`
Expected: 均无错误

- [ ] **Step 6: 样式**

在 `src/styles/components.css` 末尾追加：

```css
/* ---------------- 更新方块（固定位置：标题栏右端） ---------------- */
.update-box-wrap { position: relative; display: inline-flex; align-items: center; }
.update-box {
  width: 28px; height: 28px; padding: 0; border: 1px solid var(--border-strong);
  border-radius: 8px; background: var(--surface); color: var(--text);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: default; font-size: var(--fs-xs); font-weight: var(--fw-semibold);
}
.update-box.is-downloading { border-color: transparent; }
.update-box-inner {
  width: 22px; height: 22px; border-radius: 6px; background: var(--surface);
  display: inline-flex; align-items: center; justify-content: center;
}
.update-box.is-ready { border-color: var(--ok); background: var(--ok-soft); color: var(--ok); cursor: pointer; }
.update-pop {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 90;
  width: 360px; max-width: 70vw; padding: var(--space-3);
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  background: var(--surface); box-shadow: var(--shadow);
}
.update-pop-head { display: flex; align-items: baseline; gap: var(--space-2); margin-bottom: var(--space-2); }
.update-pop-body {
  max-height: 12em; overflow: auto; white-space: pre-wrap;
  font-size: var(--fs-sm); color: var(--text-body);
}
.update-pop-foot { margin-top: var(--space-2); font-size: var(--fs-xs); color: var(--text-muted); }
```

- [ ] **Step 7: 更新链路端到端验证（本地假 feed）**

1. 造一个本地更新源目录 `D:\tmp\dca-feed`，放入：
   - `latest.yml`：把已发布的 `release/latest.yml` 复制过来，**只把 `version:` 改成比当前高的值**（如 `0.4.0`），`path:`/`files[0].url` 改成 `DiskCleanup-Setup-0.3.0.exe` 保持与真实文件同名
   - 复制真实的 `DiskCleanup-Setup-0.3.0.exe` 进来（真包才能过 sha512 校验与进度采样；若本地无该文件，从 GitHub Release 下载：`gh release download v0.3.0 --repo liixnglinb/Disk-cleanup-assistant --pattern "DiskCleanup-Setup-0.3.0.exe"`）
2. 起静态服务：`cd /d/tmp/dca-feed && python -m http.server 17800`
3. 仓库根建 `dev-app-update.yml`：
```yaml
provider: generic
url: http://127.0.0.1:17800
```
4. 在 `electron/main.js` 的 `autoUpdater.autoDownload = false;` 之前加：
```js
if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;
```
5. 开发模式启动（`npm run dev:renderer` + `ELECTRON_START_URL=... npx electron .`），逐条断言：

| # | 断言 | 预期 |
|---|---|---|
| 1 | 主进程控制台出现渠道测速日志 | 三行采样 + "选定：…" |
| 2 | 标题栏右端出现 28×28 方块 | 初始显示 `v0.4.0` |
| 3 | 无需任何点击，方块自动进入进度态 | 中心百分比递增 |
| 4 | 鼠标悬停 | 浮层显示版本号、发布日期、发布说明，底部"正在下载 x%" |
| 4b | **下载中点击方块** | **无任何反应**：不弹窗、不进入任何过渡态（交互闸门，2026-09-27 与用户逐字确认） |
| 5 | 下载完成 | 方块变绿、显示对勾，光标变手型 |
| 6 | 点击方块 | 弹出「是否现在更新并重启？」，有"更新并重启"与取消 |
| 7 | 点取消 | 弹窗关闭，方块仍为绿色，可再次点击 |
| 8 | 设置 → 关于 | 状态文案与方块一致（同一状态源） |

> **不要点"更新并重启"**（会真的安装 0.3.0 覆盖当前开发环境）。

6. 反例：把 `dev-app-update.yml` 的 url 改成 `http://127.0.0.1:9`（必然失败），重启应用。
Expected: 方块**不出现**；设置 → 关于显示可读错误；软件其余功能正常可用。

- [ ] **Step 8: 回归与提交**

Run: `npm run typecheck && npm run build:renderer && .venv/Scripts/python.exe -m pytest backend/tests -q`
Expected: 全部通过，`37 passed`

```bash
git add -A
git commit -m "feat(update): 常驻下载框 + 悬停发布说明 + 确认后重启安装，修事件丢失

autoInstallOnAppQuit 改 false 以满足「确认后才更新并重启」；启动推送补
releaseNotes；更新状态上提到 UpdaterProvider，不再随设置页卸载丢失。"
```

---

## Task 6: 后端父进程看门狗（bug-6 根本修复）

**Files:**
- Create: `backend/core/watchdog.py`
- Create: `backend/tests/test_watchdog.py`
- Modify: `backend_launcher.py`
- Modify: `electron/backend_runner.js`

**Interfaces:**
- Consumes: 无
- Produces: `parent_gone(parent_pid: int) -> bool`、`start_parent_watchdog(parent_pid: int, interval: float = 3.0) -> None`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_watchdog.py`：

```python
"""父进程看门狗：主进程被强杀时后端必须自行退出，否则会留下孤儿进程。"""
import os

from backend.core.watchdog import parent_gone, start_parent_watchdog


def test_own_pid_is_alive():
    assert parent_gone(os.getpid()) is False


def test_missing_pid_is_gone():
    # 用一个几乎不可能存在的 pid；若真被占用则跳过，避免偶发失败
    pid = 999999
    try:
        os.kill(pid, 0)
    except OSError:
        assert parent_gone(pid) is True
    else:  # pragma: no cover
        import pytest
        pytest.skip("pid 999999 意外存在")


def test_zero_means_no_watchdog():
    assert parent_gone(0) is False


def test_watchdog_thread_starts_daemon():
    start_parent_watchdog(os.getpid(), interval=0.1)
    import threading
    assert any(t.daemon and t.name == "dca-parent-watchdog" for t in threading.enumerate())
```

- [ ] **Step 2: 跑测试确认失败**

Run: `.venv/Scripts/python.exe -m pytest backend/tests/test_watchdog.py -q`
Expected: FAIL —— `ModuleNotFoundError: No module named 'backend.core.watchdog'`

- [ ] **Step 3: 实现看门狗**

创建 `backend/core/watchdog.py`：

```python
"""父进程存活看门狗。

Windows 下主进程被强杀（任务管理器结束进程 / 崩溃）时，Electron 的
will-quit 不会执行，后端 exe 会变成孤儿进程继续占端口与内存（实测见过
一个 1.1GB 的孤儿 disk_cleanup_backend.exe）。这里由子进程自己定期检查
父进程是否还在，不在就退出——这是唯一能覆盖"父进程被强杀"的手段。
"""
import os
import threading
import time

_WATCHDOG_NAME = "dca-parent-watchdog"


def _alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name != "nt":
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

    import ctypes
    from ctypes import wintypes

    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    STILL_ACTIVE = 259
    kernel32 = ctypes.windll.kernel32
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    kernel32.GetExitCodeProcess.restype = wintypes.BOOL

    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        return False
    try:
        code = wintypes.DWORD()
        if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
            return False
        return code.value == STILL_ACTIVE
    finally:
        kernel32.CloseHandle(handle)


def parent_gone(parent_pid: int) -> bool:
    """父进程已退出或不存在 → True；parent_pid<=0 表示不启用看门狗，恒 False。"""
    if parent_pid <= 0:
        return False
    return not _alive(parent_pid)


def start_parent_watchdog(parent_pid: int, interval: float = 3.0) -> None:
    """启动守护线程：父进程消失即 os._exit(0)（不走 atexit，避免卡住关闭流程）。"""
    if parent_pid <= 0:
        return

    def loop() -> None:
        while True:
            time.sleep(interval)
            if parent_gone(parent_pid):
                os._exit(0)

    threading.Thread(target=loop, name=_WATCHDOG_NAME, daemon=True).start()
```

- [ ] **Step 4: 跑测试确认通过**

Run: `.venv/Scripts/python.exe -m pytest backend/tests/test_watchdog.py -q`
Expected: `4 passed`

- [ ] **Step 5: 接线（launcher + spawn）**

`backend_launcher.py`：把 `_pick_port()` 下方加入解析函数，并在 `main()` 里启动看门狗：

```python
def _pick_parent_pid():
    for arg in sys.argv[1:]:
        if arg.startswith("--parent-pid="):
            try:
                return int(arg.split("=", 1)[1])
            except ValueError:
                return 0
    return 0


def main():
    # make sure our package can be found when running from source
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    from backend.core.config import find_free_port
    from backend.core.watchdog import start_parent_watchdog
    from backend.main import app
    import uvicorn

    start_parent_watchdog(_pick_parent_pid())

    port = _pick_port()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
```

`electron/backend_runner.js` 的 `spawn` 调用改为：

```js
  const child = spawn(exe, [...args, `--port=${port}`, `--parent-pid=${process.pid}`], {
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, ...(apiToken ? { DCA_API_TOKEN: apiToken } : {}) },
  });
```

- [ ] **Step 6: 全量测试与真机验证**

Run:
```bash
.venv/Scripts/python.exe -m pytest backend/tests -q
npm run check:versions
```
Expected: `41 passed`（37 + 新增 4）；版本号 8 处一致退出 0

真机验证（**必做，这是本 bug 的唯一结论性证据**）：
1. `npm run dev` 起完整应用（Electron 会拉起带 `--parent-pid` 的后端）
2. 记下后端端口与 PID：`netstat -ano | grep -E "127.0.0.1:176[0-9][0-9] .*LISTENING"`
3. 在任务管理器里**强杀 Electron 主进程**（不要用关闭窗口）
4. 等待 ≤ 10 秒，再跑一次 `netstat -ano | grep -E "176[0-9][0-9] .*LISTENING"`
   Expected: **该端口已无 LISTENING**（看门狗在 3s 周期内自退）

- [ ] **Step 7: 提交**

```bash
git add backend/core/watchdog.py backend/tests/test_watchdog.py backend_launcher.py electron/backend_runner.js
git commit -m "fix(backend): 新增父进程看门狗，根治主进程被强杀后的孤儿后端进程"
```

---

## Self-Review（对照 spec 的检查结果）

**1. Spec 覆盖**

| spec 条目 | 落在哪个任务 |
|---|---|
| §2.1 窗口选项 / overlay / 主题同步 | Task 2 Step 1、Task 4 Step 4（`setTitleBarOverlay` 随主题） |
| §2.2 菜单 role 模板 | Task 2 Step 1 |
| §2.3 三个 IPC + `DcaBridge` | Task 2 Step 3 |
| §2.4 标题栏一行排布 + 删状态栏 | Task 4 Step 4/5 |
| §2.5 48px 导航栏 + 2px 指示条 | Task 4 Step 3/7 |
| §9 bug-1、bug-3～bug-5 | 不在 P1（P2/P4/P5 的计划里做），P1 只做 bug-2 的 `color-scheme` 部分与 bug-6、bug-7 |
| §9 bug-2 | Task 4 Step 7（`color-scheme`）；输入选择器改类选择器在 P2/P3 |
| §9 bug-6 | Task 2 Step 2（杀树）+ Task 6（看门狗） |
| §9 bug-7 | Task 5 Step 1 |
| §10 删出厂检测 | Task 3 |
| §16.1 真测速 + 移除 ghproxy.net | Task 1 |
| §16.2 常驻下载框 | Task 5 Step 2/6 |
| §16.3 悬停内容 + payload 补 releaseNotes | Task 5 Step 2/5 |
| §16.4 确认后重启 + `autoInstallOnAppQuit=false` | Task 5 Step 2/3/5 |
| §16.5 状态上提 | Task 5 Step 1/4 |
| §16.6 验证方式 | Task 5 Step 7 |

**未在 P1 覆盖、留给后续计划的**：§3 信息架构收敛（P3）、§4 焦点层级（P4）、§5 语义色系统全量落地（P2）、§6 材质（P2）、§7 密度基线全量（P2/P3）、§8 组件抽取（P2/P3）、§9 的 bug-1/3/4/5（P4/P5）、§10 死代码清理（P2/P5）。

**2. 占位符扫描**：无 TBD/TODO；两个占位文件（`UpdateBox` 空实现、`updater.tsx` 空 Provider）是为让 Task 4 可独立通过类型检查、Task 5 立即替换，已在步骤里写明内容与替换时机。

**3. 类型一致性**：`SectionKey`/`useWorkspace`（Task 4）与 `UpdateState`/`useUpdater`（Task 5）在被消费处（`TitleBar`、`SettingsPanel`、`UpdateBox`）签名一致；`FEEDS/parseLatestYml/rankFeeds`（Task 1 的 `feeds.js`）与 `update_probe.js` 的引用一致；`parent_gone/start_parent_watchdog`（Task 6）在测试与 launcher 中名称一致。

**4. 已知未验证项（诚实记录）**：标题栏 34px 在 125%/150% DPI 下的落地像素需 Task 4 Step 9 实测；`titleBarOverlay` 下的吸附/双击/最大值行为需 Task 2 Step 4 目视确认，若不符则回退 `frame:false` + 自补 3px 缩放命中区（spec §14 风险 1）。
