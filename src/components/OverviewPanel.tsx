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

  return (
    <div className="home">
      <section className="home-section animate-in">
        <div className="home-section-title"><h3>磁盘概览</h3></div>
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
      </section>

      {!statistics && (
        <section className="home-section">
          <div className="empty-state animate-in">
            <div className="es-icon"><Icon name="disk" size={28} /></div>
            <h3>还没有扫描过磁盘</h3>
            <p>扫描后会在这里展示分类统计、可清理空间和推荐清理的文件。</p>
            <button className="btn primary" disabled={!selectedDrive || running} onClick={() => startScan(selectedDrive)}>
              {running ? "正在扫描…" : "开始扫描"}
            </button>
          </div>
        </section>
      )}

      {statistics && (
        <>
          <section className="home-section animate-in">
            <div className="stat-grid">
              <div className="stat-card tone-primary">
                <span className="stat-icon"><Icon name="file" size={18} /></span>
                <span className="stat-num">{statistics.total_files.toLocaleString()}</span>
                <span className="stat-label">扫描文件数</span>
                <span className="stat-sub">共占用 {formatBytes(totalBytes)}</span>
              </div>
              <div className="stat-card tone-ok">
                <span className="stat-icon"><Icon name="eraser" size={18} /></span>
                <span className="stat-num">{formatBytes(cleanable)}</span>
                <span className="stat-label">可清理空间</span>
                <span className="stat-sub">{cleanableCount.toLocaleString()} 个文件建议清理</span>
              </div>
              <div className="stat-card tone-warn">
                <span className="stat-icon"><Icon name="alert" size={18} /></span>
                <span className="stat-num">{largeCount}</span>
                <span className="stat-label">大文件 (&gt;{loadSettings().largeFileMb}MB)</span>
                <span className="stat-sub">共 {formatBytes(largeBytes)}</span>
              </div>
              <div className="stat-card tone-danger">
                <span className="stat-icon"><Icon name="trash" size={18} /></span>
                <span className="stat-num">{residueCount}</span>
                <span className="stat-label">残留/临时文件</span>
                <span className="stat-sub">共 {formatBytes(residueBytes)}</span>
              </div>
            </div>
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