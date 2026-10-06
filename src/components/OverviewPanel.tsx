import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { useScan } from "../store/ScanContext";
import Icon from "./icons";
import type { DriveInfo, FileRecord } from "../types";
import { CATEGORY_META, formatBytes, RECOMMENDATION_META, baseName } from "../utils/format";
import { useSettings } from "../store/settings";
import { useFluidNumber } from "../hooks/useFluidNumber";

interface Props {
  onOpenFiles: (filter?: { category?: string; recommendation?: string; keyword?: string }) => void;
}

export default function OverviewPanel({ onOpenFiles }: Props) {
  const { scanId, statistics, startScan, status } = useScan();
  const settings = useSettings();
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDrive, setSelectedDrive] = useState("");
  const [recs, setRecs] = useState<FileRecord[]>([]);
  // 读取失败必须与"真的没有推荐项"区分：后者是好消息，前者不能谎报成健康
  const [recsError, setRecsError] = useState<string | null>(null);

  useEffect(() => {
    api.drives().then((r) => {
      setDrives(r.items);
      if (r.items.length) setSelectedDrive((p) => p || r.items[0].drive);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!scanId) return;
    setRecsError(null);
    api.queryFiles({ scan_id: scanId, recommendation: "recommend", sort: "size_desc", page: 0, page_size: 8 })
      .then((r) => setRecs(r.items))
      .catch((e) => { setRecs([]); setRecsError(String(e instanceof Error ? e.message : e)); });
  }, [scanId]);

  const running = status?.status === "running" || status?.status === "starting";

  const cats = Object.entries(statistics?.categories ?? {})
    .sort((a, b) => (b[1].bytes || 0) - (a[1].bytes || 0))
    .filter(([, v]) => (v.count || 0) > 0);

  const rec = statistics?.recommendations;
  const cleanable = rec?.recommend?.bytes ?? 0;
  const cleanableCount = rec?.recommend?.count ?? 0;
  const largeBytes = statistics?.categories.large?.bytes ?? 0;
  const largeCount = statistics?.categories.large?.count ?? 0;
  const residueBytes = statistics?.categories.residue?.bytes ?? 0;
  const residueCount = statistics?.categories.residue?.count ?? 0;
  const totalBytes = statistics?.total_bytes ?? 0;

  // 流体计数器：扫描完成时统计一次性到达，数字从 0 滚到目标值。
  // 放在这里而不是组件顶层 return 之后 —— hooks 不能在条件 return 之后调用。
  const fluidCleanable = useFluidNumber(cleanable);

  const driveGrid = (
    <div className="drive-grid">
      {drives.map((d) => {
        const used = Math.max(0, d.total - d.free);
        const pct = d.total > 0 ? Math.round((used / d.total) * 100) : 0;
        return (
          <button className="drive-card" key={d.drive} style={{ textAlign: "left" }} onClick={() => setSelectedDrive(d.drive)}>
            <div className="drive-head">
              <span className="drive-name">{d.label || d.drive}</span>
              <span className="drive-usage num">{pct}%</span>
            </div>
            <div className="drive-bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="drive-usage">已用 <span className="num">{formatBytes(used)}</span> / <span className="num">{formatBytes(d.total)}</span></div>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="home">
      {!statistics && (
        <section className="home-section">
          <div className="home-section-title"><h3>磁盘概览</h3></div>
          {driveGrid}
        </section>
      )}

      {!scanId && !statistics && (
        <section className="home-section">
          <div className="empty-state animate-in">
            <div className="es-icon"><Icon name="disk" size={28} /></div>
            <h3>还没有扫描过磁盘</h3>
            <p>扫描后会在这里展示可释放空间、分类统计与推荐清理的文件。</p>
            <button className="btn primary" disabled={!selectedDrive || running} onClick={() => startScan(selectedDrive)}>
              {running ? "正在扫描…" : "开始扫描"}
            </button>
          </div>
        </section>
      )}

      {/* 有扫描但统计还没回来：2.4M 文件时这个请求很慢，此前这里会误报"还没有扫描过磁盘" */}
      {scanId && !statistics && (
        <section className="home-section">
          <div className="hero">
            <div className="hero-skel">
              <div className="skeleton" style={{ width: 132, height: 40 }} />
              <div className="skeleton" style={{ width: 300, height: 12, marginTop: 10 }} />
              <div className="skeleton" style={{ width: 210, height: 12, marginTop: 8 }} />
            </div>
            <div className="hero-meta">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="skeleton" style={{ width: 72, height: 16 }} />
                  <div className="skeleton" style={{ width: 56, height: 10 }} />
                </div>
              ))}
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            正在汇总上次扫描的分类统计…
          </div>
        </section>
      )}

      {statistics && (
        <>
          {/* Bento：Hero 占左侧 2/3，分类刻度线占右侧 1/3 纵列。
              非对称是刻意的 —— 概览只有一个"该做什么"的答案（清理推荐项），
              分类占比是辅助信息，不该与主行动争夺同等的视觉权重。 */}
          <section className="bento">
            <div className="bento-hero animate-in">
              {/* 巨大半透明水印：直接用可释放容量做底纹，不额外引入装饰图形。
                  数字本身会动，水印同步缩放会产生"内容在长大"的错觉。 */}
              <div className="bento-hero-watermark" aria-hidden="true">
                {formatBytes(cleanable)}
              </div>
              <div className="hero-main">
                <span className="hero-label">可释放空间</span>
                <span className="hero-num num">{formatBytes(fluidCleanable)}</span>
                <span className="hero-sub">
                  {cleanableCount.toLocaleString()} 个文件被判定为可安全清理
                  {residueCount > 0 ? ` · 含 ${residueCount.toLocaleString()} 个残留/临时文件` : ""}
                </span>
                <div className="hero-cta">
                  <button className="btn primary" onClick={() => onOpenFiles({ recommendation: "recommend" })}>
                    <Icon name="eraser" size={14} /> 清理推荐项
                  </button>
                  <button className="btn ghost" onClick={() => onOpenFiles({})}>浏览全部文件</button>
                </div>
                <span className="hero-note">
                  <Icon name="shield" size={12} /> 不会自动删除：这里只把「推荐删除」的文件筛出来给你逐个勾选
                </span>
              </div>
              <div className="hero-meta">
                <div><b className="num">{statistics.total_files.toLocaleString()}</b><span>已扫描文件</span></div>
                <div><b className="num">{formatBytes(totalBytes)}</b><span>占用空间</span></div>
                <div><b className="num">{largeCount.toLocaleString()}</b><span>大文件 &gt;{settings.largeFileMb}MB · {formatBytes(largeBytes)}</span></div>
                <div><b className="num">{residueCount.toLocaleString()}</b><span>残留/临时 · {formatBytes(residueBytes)}</span></div>
              </div>
            </div>

            {/* 右列：Scan & Breakdown。垂直错落排版，分类占比转为彩色刻度线。
                这里不用卡片边框——刻度线本身已经表达了"占多少"，再加边框是双重编码。 */}
            <div className="bento-scan animate-in">
              <div className="bento-scan-title">
                <h3>分类占比</h3>
                <span className="link" onClick={() => onOpenFiles({})}>全部 →</span>
              </div>
              <div className="cat-scale">
                {cats.map(([k, v], i) => {
                  const meta = CATEGORY_META[k] ?? { label: k, color: "var(--cat-unknown)" };
                  const pct = totalBytes > 0 ? Math.max(1.5, (v.bytes / totalBytes) * 100) : 0;
                  return (
                    <button
                      className="cat-scale-row"
                      key={k}
                      onClick={() => onOpenFiles({ category: k })}
                      // Stagger entrance：按索引依次淡入上移，形成"逐条落位"的节奏
                      style={{ animationDelay: `${i * 45}ms` }}
                    >
                      <span className="cat-scale-name">
                        <i className="cat-dot" style={{ background: meta.color }} />
                        {meta.label}
                      </span>
                      <span className="cat-scale-track">
                        <i style={{ width: `${pct}%`, background: meta.color }} />
                      </span>
                      <span className="cat-scale-val num">
                        <b>{formatBytes(v.bytes)}</b>
                        <em>{pct.toFixed(1)}%</em>
                      </span>
                    </button>
                  );
                })}
                {cats.length === 0 && <div className="dim" style={{ fontSize: "var(--fs-sm)" }}>暂无分类数据</div>}
              </div>
            </div>
          </section>

          <section className="home-section animate-in">
            <div className="home-section-title"><h3>磁盘占用</h3></div>
            {driveGrid}
          </section>

          <section className="home-section animate-in">
            <div className="home-section-title">
              <h3>推荐清理（深度解析）</h3>
              <span className="link" onClick={() => onOpenFiles({ recommendation: "recommend" })}>更多 →</span>
            </div>
            {recsError ? (
              <div className="notice error" role="alert">推荐项读取失败：{recsError}</div>
            ) : recs.length === 0 ? (
              <div className="empty">暂无强烈建议清理的文件，磁盘状态很健康</div>
            ) : (
              <div className="rec-list">
                {recs.map((r) => (
                  <button className="rec-row" key={r.id} onClick={() => onOpenFiles({ recommendation: "recommend" })} style={{ textAlign: "left" }}>
                    <span className="rec-size num">{formatBytes(r.size)}</span>
                    <div style={{ minWidth: 160, maxWidth: 280 }}>
                      <div className="rec-name">{baseName(r.path)}</div>
                      <div className="rec-meta">{r.owner} · {r.purpose}</div>
                    </div>
                    <span className="rec-reason">{r.recommendation_reason || "可安全清理，通常不会影响使用"}</span>
                    <span className="rec-spacer" />
                    <span className={`badge ${RECOMMENDATION_META[r.recommendation]?.cls ?? "badge-muted"}`}>{RECOMMENDATION_META[r.recommendation]?.label ?? r.recommendation}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}