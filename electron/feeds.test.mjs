import test from "node:test";
import assert from "node:assert/strict";
import { FEEDS, parseLatestYml, rankFeeds, releaseNotesToPlainText } from "./feeds.js";

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

test("rankFeeds 短响应不得因字节少÷耗时少而胜出", () => {
  const r = rankFeeds(
    [
      { feed: "a", ok: true, bytes: 40960, ms: 100 },   // 假高速：短错误页
      { feed: "b", ok: true, bytes: 262144, ms: 1739 }, // 真实样本
    ],
    { minBytes: 262144 },
  );
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

// ---- releaseNotesToPlainText：应用内面板是纯文本容器，markdown 标记会原样露出 ----

test("去掉标题井号、加粗与行内代码标记", () => {
  const out = releaseNotesToPlainText("## 标题\n\n**加粗词**：改为 `rgba(0,0,0,0)` 底色");
  assert.equal(out, "标题\n\n加粗词：改为 rgba(0,0,0,0) 底色");
});

test("列表符号转 · ，链接只留锚文本", () => {
  const out = releaseNotesToPlainText("- 第一项\n* 第二项\n\n详见 [发布页](https://example.com/a)");
  assert.equal(out, "· 第一项\n· 第二项\n\n详见 发布页");
});

test("丢掉 GitHub 自动追加的 Full Changelog 行", () => {
  const out = releaseNotesToPlainText("真实说明\n\n**Full Changelog**: https://github.com/a/b/compare/v1...v2");
  assert.equal(out, "真实说明");
});

test("连续空行压成一个，首尾空白去掉", () => {
  assert.equal(releaseNotesToPlainText("\n\n第一段\n\n\n\n第二段\n\n  "), "第一段\n\n第二段");
});

test("超长时按行边界截断并加省略号", () => {
  const src = ["甲", "乙", "丙"].map((s) => s + " ".repeat(600)).join("\n");
  const out = releaseNotesToPlainText(src, 1200);
  assert.ok(out.endsWith("…"), "应以省略号结尾");
  assert.ok(out.length <= 1200, "不应超过上限");
  assert.ok(!out.includes("丙"), "第三段应被整段截掉，不从行中间切");
});

test("空值与非字符串返回空串", () => {
  assert.equal(releaseNotesToPlainText(""), "");
  assert.equal(releaseNotesToPlainText("   \n "), "");
  assert.equal(releaseNotesToPlainText(undefined), "");
  assert.equal(releaseNotesToPlainText(null), "");
});
