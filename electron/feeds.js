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
 * bytes 小于 minBytes、或 ms=0 的"成功"响应用户视角等于没拿到完整数据，判为失败 ——
 * 本机曾因 `curl -o /dev/null` 假报 0 字节而误判三个镜像全瘫；反过来，镜像对不存在
 * 的资产返回的短错误页（约 40KB、边缘缓存 ~100ms）会靠"小字节 ÷ 小耗时"伪装成最快，
 * 故需要 minBytes 完整性下限（默认 1，即只堵 0 字节那一侧）。
 */
function rankFeeds(probes, { minBytes = 1 } = {}) {
  const measured = probes.filter((p) => p.ok && p.bytes >= minBytes && p.ms > 0);
  const bySpeed = measured
    .slice()
    .sort((a, b) => b.bytes / b.ms - a.bytes / a.ms)
    .map((p) => p.feed);
  const rest = probes.map((p) => p.feed).filter((f) => !bySpeed.includes(f));
  return { ranked: [...bySpeed, ...rest], fastest: bySpeed[0] ?? null, measured: measured.length };
}

module.exports = { FEEDS, parseLatestYml, rankFeeds };
