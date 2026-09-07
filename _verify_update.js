// 临时验证脚本：在真实 Electron 主进程环境里测试 check-update 与 smart-download 逻辑
const { app, net } = require("electron");

const REPO = "liixnglinb/disk-cleanup-assistant";
const GITHUB_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const GH_BASE = `https://github.com/${REPO}/releases/download`;
const SOURCES = [
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
  } catch (e) {
    return { __err: String(e && e.message ? e.message : e) };
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

app.whenReady().then(async () => {
  const results = {};
  // 1) 检查更新
  const d = await fetchJson(GITHUB_API);
  if (!d) {
    results.checkUpdate = "FAIL: API 不可达";
  } else if (d.__err) {
    results.checkUpdate = "FAIL: " + d.__err;
  } else {
    results.checkUpdate = JSON.stringify({
      latest: d.tag_name,
      asset: (d.assets || []).find((a) => a.name.indexOf("LocalToolbox-Setup-") === 0 && a.name.indexOf(".exe") > 0)?.name || "none",
    });
  }
  // 2) 三通道测速（模拟 smart-download 前半段）
  const tag = "v0.1.2";
  const asset = "LocalToolbox-Setup-0.1.2.exe";
  const targets = SOURCES.map((s) => ({ name: s.name, url: s.prefix + `${GH_BASE}/${tag}/${asset}` }));
  const speeds = await Promise.all(targets.map(async (t) => ({ name: t.name, ...(await probeUrl(t.url)) })));
  speeds.sort((a, b) => (a.ok === b.ok ? a.ms - b.ms : a.ok ? -1 : 1));
  results.speedTest = speeds.map((s) => `${s.name}:${s.ok ? s.ms + "ms" : "FAIL"}`).join(" | ");
  results.best = speeds[0] && speeds[0].ok ? speeds[0].name : "全部不可达";
  console.log("==== 验证结果 ====");
  console.log(JSON.stringify(results, null, 2));
  app.quit();
}).catch((e) => {
  console.log("验证脚本异常:", e);
  app.quit();
});
