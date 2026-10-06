/**
 * 端到端冒烟测试：启动真实 Electron 应用，所有后端接口用桩数据满足，
 * 然后按用户真实操作路径断言界面行为。
 *
 *   node scripts/e2e-smoke.mjs              # 正常路径
 *   node scripts/e2e-smoke.mjs --block-ai   # AI 配置读取失败路径
 *
 * 为什么值得存在：单元测试能保证函数逻辑，但"点了没反应""加载完显示假空态"
 * "键盘 Tab 到不了输入框"这类问题只有在真渲染的窗口里才看得见。本脚本抓到过
 * 软件图标缺字段时拼出 `data:image/png;base64,undefined` 的坏图。
 *
 * 安全：全部 /api/** 都被 route 拦截打桩，不会真的扫描、删除或卸载任何东西。
 * 未纳入 CI 与发版门禁：CI 的 Windows runner 上跑 Electron 需要会话环境，
 * 目前没有验证过它的稳定性，不要把它加进必须全绿的链路。
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { _electron: electron } = require("playwright-core");

const ROOT = path.resolve(import.meta.dirname, "..");
const SHOT = path.join(ROOT, "shots");
const BLOCK_AI = process.argv.includes("--block-ai");

const results = [];
const noise = [];
const check = (name, ok, detail) =>
  results.push({ name, ok, detail: detail === undefined ? "" : String(detail) });

const app = await electron.launch({ args: ["."], cwd: ROOT });
const win = await app.firstWindow();
win.on("pageerror", (e) => noise.push("[pageerror] " + e.message));
win.on("console", (m) => {
  if (m.type() === "error") noise.push("[console] " + m.text() + " @" + (m.location()?.url || "?"));
});

const ROWS = [
  { path: "C:\\mock\\a.bin", size: 1048576, mtime: 1700000000, ctime: 1700000000, category: "cache",
    is_locked: 0, is_dir: 0, recommendation: "recommend", risk: 1, reason: "缓存", purpose: "测试", owner: "Mock", needs_ai: 0, ext: "bin" },
  { path: "C:\\mock\\b.bin", size: 2048, mtime: 1700000001, ctime: 1700000001, category: "system",
    is_locked: 1, is_dir: 0, recommendation: "keep", risk: 3, reason: "系统", purpose: "测试", owner: "Mock", needs_ai: 0, ext: "bin" },
];

const PRESETS = [
  { id: "openai", name: "OpenAI 官方", endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  { id: "custom", name: "自定义", endpoint: "", model: "" },
];

await win.route("**/api/**", async (route) => {
  const p = new URL(route.request().url()).pathname;
  const json = (obj, status) => route.fulfill({
    status: status || 200, contentType: "application/json", body: JSON.stringify(obj),
  });
  if (BLOCK_AI && (p === "/api/ai/config" || p === "/api/ai/presets")) {
    return json({ detail: "桩：后端挂了" }, 500);
  }
  switch (p) {
    case "/api/health":
      return json({ ok: true, version: "0.5.6", app: "local-toolbox", tools: 1, routers: 29, load_errors: 0 });
    case "/api/drives":
      return json({ items: [{ drive: "C:", total: 500e9, free: 120e9, used: 380e9 }] });
    case "/api/config":
      return json({});
    case "/api/scan/recent":
      return json({ scan_id: null, exists: false });
    case "/api/scan/start":
      // 故意慢 1.5 秒，用来验证"请求在途时按钮必须禁用"
      await new Promise((r) => setTimeout(r, 1500));
      return json({ scan_id: "mockscan0001" });
    case "/api/scan/status/mockscan0001":
      return json({ scan_id: "mockscan0001", drive: "C:", status: "running", percent: 3, files_count: 10,
        dirs_seen: 1, bytes_scanned: 1, errors: 0, current_path: "C:\\mock", start_ms: Date.now(),
        end_ms: 0, elapsed_ms: 0, message: "", total_bytes: 100 });
    case "/api/kb/folders":
      return json({ items: [
        { id: 1, name: "Windows", path: "C:\\Windows", category: "system_core", app: "系统", app_attached: true, recommendation: "keep", description: "系统核心目录", size: 12345 },
        { id: 2, name: "Temp", path: "C:\\Temp", category: "system_temp", app: "", app_attached: false, recommendation: "recommend", description: "临时文件", size: 999 },
      ], total: 2, page: 0, page_size: 50 });
    case "/api/kb/categories":
    case "/api/kb/cache-candidates":
      return json({ items: [] });
    case "/api/logs/":
      return json({ items: [], total: 0 });
    case "/api/software/installed":
      return json({ items: [
        { name: "MockApp", version: "1.0", install_location: "C:\\Mock", publisher: "P",
          uninstall_string: "C:\\Mock\\unins000.exe", size: 1000, last_used: null },
      ], total: 1 });
    case "/api/software/icon":
      // 故意返回缺字段的 200：界面必须放弃拼 data URL，而不是渲染一张坏图
      return json({ name: "MockApp" });
    case "/api/ai/config":
      return json({ configured: true, endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini", has_api_key: true, api_key_hint: "sk-t****abcd", key_storage: "dpapi" });
    case "/api/ai/presets":
      return json({ items: PRESETS });
    case "/api/files/query":
      return json({ items: ROWS, total: ROWS.length, page: 0, page_size: 100 });
    case "/api/files/statistics/mockscan0001":
      return json({ total_files: 2, total_bytes: 2000, categories: {}, recommendations: {} });
    case "/api/cache/overview":
      return json({ items: [], total_bytes: 0 });
    default:
      return json({ detail: "未打桩的接口: " + p }, 500);
  }
});

await win.waitForLoadState("domcontentloaded");
await win.waitForTimeout(2500);
const nav = (label) =>
  win.locator('nav[aria-label="主导航"] button:has-text("' + label + '")').click({ timeout: 15000 });

try {
  // ---- 1. 键盘焦点：表单控件必须能被 Tab 看出来 ----
  await nav("设置");
  await win.waitForTimeout(1600);
  const ring = await win.evaluate(() => {
    const el = document.querySelector("select");
    if (!el) return "no-select";
    el.focus();
    const cs = getComputedStyle(el);
    return cs.outlineStyle + " " + cs.outlineWidth;
  });
  check("select 聚焦后有可见 outline", ring.startsWith("solid"), ring);

  // ---- 2. AI 配置区：加载态 / 失败原因 / 存储方式 ----
  const notices = await win.locator(".notice.error").count();
  if (BLOCK_AI) {
    check("AI 读取失败显示错误条", notices > 0, "notices=" + notices);
    check("AI 失败条带重试按钮", (await win.locator('button:has-text("重试")').count()) > 0);
  } else {
    check("正常时设置页不误报错误", notices === 0, "notices=" + notices);
    check("Key 加密方式对用户可见",
      (await win.locator(".setting-desc", { hasText: "Windows 用户级加密" }).count()) > 0);
  }

  // ---- 3. 目录百科：图标位必须是真 SVG，不能是空格子 ----
  await nav("清理");
  await win.waitForTimeout(1600);
  const kbBtn = win.locator('button:has-text("目录百科")').first();
  check("清理页能打开目录百科入口", (await kbBtn.count()) > 0);
  await kbBtn.click({ timeout: 8000 });
  await win.waitForTimeout(1800);
  const kb = await win.evaluate(() => {
    const box = document.querySelector(".kb-item-icon");
    if (!box) return "no-kb-box";
    const svg = box.querySelector("svg");
    return svg ? "svg" + Math.round(svg.getBoundingClientRect().width) : "empty:" + JSON.stringify(box.textContent);
  });
  check("百科卡片图标位渲染真 SVG", kb.startsWith("svg"), kb);
  await win.keyboard.press("Escape");
  await win.waitForTimeout(600);

  // ---- 4. 软件页：首屏有骨架；坏图标不渲染成坏图 ----
  await nav("软件");
  const soft = await win.evaluate(() => ({
    skeleton: document.querySelectorAll(".sw-skeleton").length,
    cards: document.querySelectorAll(".sw-card").length,
    brokenImg: [...document.querySelectorAll("img")].filter(
      (i) => (i.currentSrc || i.src).includes("base64,undefined")).length,
  }));
  check("软件页有骨架或卡片（首屏不空白）", soft.skeleton > 0 || soft.cards > 0, JSON.stringify(soft));
  check("缺字段的图标不会拼成坏 data URL", soft.brokenImg === 0, "broken=" + soft.brokenImg);

  // ---- 5. 开始扫描在途时按钮必须禁用（防连点起两个扫描） ----
  const before = await win.evaluate(() =>
    [...document.querySelectorAll(".titlebar-scan button")].map((b) => b.textContent.trim()).join(" / "));
  check("初始状态是「开始扫描」", before.includes("开始扫描"), before);
  await win.evaluate(() => {
    const b = [...document.querySelectorAll(".titlebar-scan button")]
      .find((x) => x.textContent.includes("开始扫描"));
    if (b) b.click();
  });
  await win.waitForTimeout(400);
  const during = await win.evaluate(() => {
    const b = [...document.querySelectorAll(".titlebar-scan button")]
      .find((x) => /正在开始|开始扫描/.test(x.textContent));
    return b ? "disabled=" + b.disabled + " text=" + b.textContent.trim() : "gone";
  });
  check("开始扫描在途时被禁用", during.startsWith("disabled=true"), during);
  await win.waitForTimeout(2600);

  // ---- 6. 文件列表表头勾选：作用域标注 + 可用态 ----
  await nav("清理");
  await win.waitForTimeout(1500);
  const fileTab = win.locator('button:has-text("文件")').first();
  if (await fileTab.count()) await fileTab.click({ timeout: 5000 }).catch(() => {});
  await win.waitForTimeout(2500);
  const head = await win.evaluate(() => {
    const el = document.querySelector(".data-grid-head input[type=checkbox]");
    if (!el) return "no-checkbox";
    return JSON.stringify({
      disabled: el.disabled,
      scope: document.querySelector(".check-scope")?.textContent || "",
      rows: document.querySelectorAll(".file-row, .data-grid-row").length,
    });
  });
  check("表头复选框可用且写明作用域", head !== "no-checkbox" && /"disabled":false/.test(head) && /本页/.test(head), head);
} catch (e) {
  check("冒烟流程未抛异常", false, e.message.split("\n")[0]);
}

await app.close();

const fails = results.filter((r) => !r.ok);
// console 错误默认计入失败。--block-ai 模式下 500 是桩自己造的，属于被测的
// 错误路径，不该算噪声；其余情况一条 console error 都不能有。
const expected = BLOCK_AI ? /\/api\/ai\// : null;
const realNoise = noise.filter((n) => !/update:|DevTools/.test(n)
  && !(expected && expected.test(n)));
console.log(results.map((r) => (r.ok ? "PASS " : "FAIL ") + r.name + (r.detail ? " :: " + r.detail : "")).join("\n"));
if (realNoise.length) console.log("--- 页面错误 ---\n" + realNoise.slice(0, 10).join("\n"));
mkdirSync(SHOT, { recursive: true });
console.log(fails.length || realNoise.length
  ? "\n结果: FAIL（断言 " + fails.length + " 项，页面错误 " + realNoise.length + " 条）"
  : "\n结果: 全部 " + results.length + " 项断言通过，页面无 console/pageerror");
process.exitCode = fails.length || realNoise.length ? 1 : 0;
