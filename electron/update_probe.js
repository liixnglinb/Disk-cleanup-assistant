const { net } = require("electron");
const { FEEDS, parseLatestYml, rankFeeds } = require("./feeds");

const SAMPLE_BYTES = 262144; // 256KB 采样，够区分 1.3MB/s 与 8KB/s
const LATEST_TIMEOUT = 4000;
// 3s 内交付不了 256KB 的源视为不可用（约 <85KB/s），顺带压掉首检延迟。
// 阶段二保持串行：并发采样会互相抢带宽，把三个源同时测低，串行是有意的测量选择。
const SAMPLE_TIMEOUT = 3000;

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
      // 禁用 HTTP 缓存：GitHub 资产带长 max-age，Chromium 可能用磁盘缓存满足后续
      // 同范围请求，测出几毫秒级的"极快"并自我强化。
      req.setHeader("Cache-Control", "no-cache");
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
  // 完整性下限：拿不满 SAMPLE_BYTES 的（短错误页、被截断的 206）不算有效样本。
  return { feed: feedUrl, ok: r.ok && r.bytes >= SAMPLE_BYTES, bytes: r.bytes, ms };
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
    const failed = FEEDS.map((f) => ({ feed: f.url, ok: false, bytes: 0, ms: 1 }));
    return { ...rankFeeds(failed, { minBytes: SAMPLE_BYTES }), log };
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
  const out = rankFeeds(probes, { minBytes: SAMPLE_BYTES });
  log.push(`选定：${out.fastest ?? "无（回退默认顺序）"}`);
  return { ...out, log };
}

module.exports = { rankFeedsBySpeed, getText };
