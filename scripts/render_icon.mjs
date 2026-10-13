// 用 Playwright 把 build/icons/icon.svg 渲染成 1024px PNG。
// 为什么走浏览器而不是 PIL 直接画：SVG 的 squircle 圆角、发丝内边缘、
// stroke-linecap 都要矢量渲染器才对；PIL 从零画等于把 SVG 重抄一遍。
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVG = path.join(ROOT, "build", "icons", "icon.svg");
const OUT = path.join(ROOT, "build", "icons", "icon-1024.png");

const svg = readFileSync(SVG, "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(
  `<body style="margin:0"><div style="width:1024px;height:1024px">${svg}</div></body>`,
);
await page.waitForTimeout(300);
const buf = await page.locator("svg").screenshot({ omitBackground: true });
writeFileSync(OUT, buf);
await browser.close();
console.log("OK", OUT, buf.length, "bytes");
