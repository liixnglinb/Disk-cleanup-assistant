import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { useScan } from "../store/ScanContext";
import Icon from "./icons";
import type { DriveInfo, FileRecord } from "../types";
import { CATEGORY_META, formatBytes, RECOMMENDATION_META, baseName } from "../utils/format";
import { loadSettings } from "./SettingsPanel";

interface Props {
  onOpenFiles: (filter?: { category?: string; recommendation?: string; keyword?: string }) => void;
}

export default function OverviewPanel({ onOpenFiles }: Props) {
  const { scanId, statistics, startScan, status } = useScan();
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDrive, setSelectedDrive] = useState("");
  const [recs, setRecs] = useState<FileRecord[]>([]);

  useEffect(() => {
    api.drives().then((r) => {
      setDrives(r.items);
      if (r.items.length) setSelectedDrive((p) => p || r.items[0].drive);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!scanId) return;
    api.queryFiles({ scan_id: scanId, recommendation: "recommend", sort: "size_desc", page: 0, page_size: 8 }).then((r) => setRecs(r.items)).catch(() => {});
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
          {/* 唯一的英雄位：其余指标一律降为次级元数据 */}
          <section className="home-section animate-in">
            <div className="hero">
              <div className="hero-glow" aria-hidden="true" />
              <div className="hero-main">
                <span className="hero-label">可释放空间</span>
                <span className="hero-num num">{formatBytes(cleanable)}</span>
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
                <div><b className="num">{largeCount.toLocaleString()}</b><span>大文件 &gt;{loadSettings().largeFileMb}MB · {formatBytes(largeBytes)}</span></div>
                <div><b className="num">{residueCount.toLocaleString()}</b><span>残留/临时 · {formatBytes(residueBytes)}</span></div>
              </div>
            </div>
          </section>

          <section className="home-section animate-in">
            <div className="home-section-title"><h3>磁盘占用</h3></div>
            {driveGrid}
          </section>

          <section className="home-section animate-in">
            <div className="home-section-title">
              <h3>文件分类</h3>
              <span className="link" onClick={() => onOpenFiles({})}>查看全部文件 →</span>
            </div>
            <div className="cat-list">
              {cats.map(([k, v]) => {
                const meta = CATEGORY_META[k] ?? { label: k, color: "#888" };
                const pct = totalBytes > 0 ? Math.max(2, Math.round((v.bytes / totalBytes) * 100)) : 0;
                return (
                  <div className="cat-row" key={k} onClick={() => onOpenFiles({ category: k })}>
                    <span className="cat-dot" style={{ background: meta.color }} />
                    <span className="cat-name">{meta.label}</span>
                    <span className="cat-meta">{v.count.toLocaleString()} 个 · {formatBytes(v.bytes)}</span>
                    <span className="cat-spacer" />
                    <span className="cat-bar"><i style={{ width: `${pct}%`, background: meta.color }} /></span>
                    <span className="cat-actions">
                      {k === "cache" && <button className="btn small primary" onClick={(e) => { e.stopPropagation(); onOpenFiles({ category: k }); }}>一键清理</button>}
                      <button className="btn small" onClick={(e) => { e.stopPropagation(); onOpenFiles({ category: k }); }}>查看详情</button>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="home-section animate-in">
            <div className="home-section-title">
              <h3>推荐清理（深度解析）</h3>
              <span className="link" onClick={() => onOpenFiles({ recommendation: "recommend" })}>更多 →</span>
            </div>
            {recs.length === 0 ? (
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