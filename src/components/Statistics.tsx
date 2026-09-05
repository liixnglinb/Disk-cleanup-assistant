import React from "react";
import { useScan } from "../store/ScanContext";
import { formatBytes } from "../utils/format";

const LABELS: Record<string, string> = {
  system: "系统文件",
  cache: "软件缓存",
  docs: "用户文档",
  residue: "残留文件",
  large: "大文件",
};

const COLORS: Record<string, string> = {
  system: "#9A9A94",
  cache: "#9A6700",
  docs: "#0550AE",
  residue: "#C1341B",
  large: "#111111",
};

export default function Statistics() {
  const { statistics } = useScan();
  if (!statistics) {
    return <div className="empty">完成扫描后显示分类统计</div>;
  }
  const total = {
    count: statistics.total_files,
    bytes: statistics.total_bytes,
  };
  const cats = Object.entries(statistics.categories ?? {});
  return (
    <div className="stats">
      <div className="stat-hero">
        <div className="stat-card hero">
          <div className="stat-num">{total.count.toLocaleString()}</div>
          <div className="stat-label">文件数</div>
        </div>
        <div className="stat-card hero">
          <div className="stat-num">{formatBytes(total.bytes)}</div>
          <div className="stat-label">合计占用</div>
        </div>
      </div>
      <div className="stat-list">
        {cats.map(([k, v]) => (
          <div className="stat-card" key={k}>
            <span className="dot" style={{ background: COLORS[k] || "#888" }} />
            <div className="stat-row">
              <span className="stat-name">{LABELS[k] || k}</span>
              <span className="stat-meta">
                {v.count.toLocaleString()} 个 · {formatBytes(v.bytes)}
              </span>
            </div>
            <div className="bar">
              <div
                className="bar-fill"
                style={{
                  width: `${Math.max(2, (v.bytes / Math.max(1, total.bytes)) * 100)}%`,
                  background: COLORS[k] || "#888",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}