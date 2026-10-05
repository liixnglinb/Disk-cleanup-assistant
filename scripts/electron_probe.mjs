import { _electron as electron } from "playwright-core";

const errors = [];
const target = process.argv[2];
const app = await electron.launch({
  args: target ? ["--enable-logging=file", "--log-file=installed-probe.log"] : ["."],
  cwd: process.cwd(),
  executablePath: target || undefined,
});
const win = await app.firstWindow();

const proc = app.process();
proc.stdout?.on("data", (d) => errors.push(`[stdout] ${d}`));
proc.stderr?.on("data", (d) => errors.push(`[stderr] ${d}`));
win.on("crash", () => errors.push("[page-crash] renderer crashed"));

if (process.env.BLOCK_AI) {
  await win.route(/\/api\/ai\/(config|presets)/, (route) => route.abort());
}

win.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`[console] ${msg.text()}`);
});
win.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
app.process().on("exit", (code) => errors.push(`[electron-exit] code=${code}`));

await win.waitForLoadState("domcontentloaded");
await win.waitForTimeout(3000);

try {
  try {
  const seq = (process.env.SECTION_SEQ || "设置").split(",");
  for (const name of seq) {
    try {
      // 标签常驻后按钮不再有 title 属性，按可见文本定位
      await win.locator(`nav[aria-label="主导航"] button:has-text("${name}")`).click({ timeout: 15000 });
      errors.push(`[click-ok] ${name}`);
      await win.waitForTimeout(2500);
    } catch (e) {
      errors.push(`[click] ${name}: ${e.message.split("\n")[0]}`);
      break;
    }
  }
  } catch (e) {
    errors.push(`[click] ${e.message.split("\n")[0]}`);
  }
  await win.waitForTimeout(4000);
} catch (e) {
  errors.push(`[after-click] ${e.message.split("\n")[0]}`);
} finally {
  try {
    // 验证默认深色：清掉已保存的主题后刷新
    await win.evaluate(() => localStorage.removeItem("ltb-theme"));
    await win.reload();
    await win.waitForTimeout(1500);
    console.log("data-theme:", await win.evaluate(() => document.documentElement.getAttribute("data-theme")));
    await win.screenshot({ path: "settings-final.png" });
  } catch (e) {
    errors.push(`[final-check] ${e.message.split("\n")[0]}`);
  }
  await app.close().catch(() => {});
  console.log("errors:", JSON.stringify(errors, null, 2));
}
