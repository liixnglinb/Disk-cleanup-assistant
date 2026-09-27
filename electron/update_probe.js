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
