import React from "react";
import { useScan } from "../store/ScanContext";
import { formatBytes, formatClock } from "../utils/format";

export default function ScanPanel() {
  const { status, error, pause, resume, cancel } = useScan();
  const running = status?.status === "running" || status?.status === "starting";
  const paused = status?.status === "paused";

  // 进度百分比：直接使用后端真实进度（已统计字节/盘已用空间）
  const pct = Math.max(1, Math.min(100, status?.percent ?? 0));

  // 空闲状态：头部已有「开始扫描」，这里不再重复展示控制区
  if (!running && !paused) return null;

  return (
    <div className="panel scan-overlay animate-in">
      <div className="scan-ring-wrap" style={{ ["--pct" as any]: pct } as React.CSSProperties}>
        <div className="scan-ring" />
        <div className="scan-ring-center">
          <span className="pct">{pct}%</span>
          <span className="pct-label">{paused ? "已暂停" : "正在扫描"}</span>
        </div>
      </div>
      <div className="scan-path" title={status?.current_path}>{status?.current_path}</div>
      <div className="scan-numbers">
        <div className="sn"><b>{(status?.files_count ?? 0).toLocaleString()}</b><span>已扫描文件</span></div>
        <div className="sn"><b>{formatBytes(status?.bytes_scanned ?? 0)}</b><span>已统计大小</span></div>
        <div className="sn"><b>{formatClock(status?.elapsed_ms ?? 0)}</b><span>耗时</span></div>
        <div className="sn"><b>{status?.errors ?? 0}</b><span>跳过（无权限）</span></div>
      </div>
      <div className="scan-actions">
        {paused
          ? <button className="btn primary" onClick={resume}>继续扫描</button>
          : <button className="btn" onClick={pause}>暂停</button>}
        <button className="btn danger" onClick={cancel}>取消扫描</button>
      </div>
      {error && <div className="notice error">{error}</div>}
    </div>
  );
}
