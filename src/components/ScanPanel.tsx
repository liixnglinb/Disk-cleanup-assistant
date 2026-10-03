import React, { useState } from "react";
import { useScan } from "../store/ScanContext";
import { formatBytes, formatClock } from "../utils/format";
import ConfirmModal from './ConfirmModal';

export default function ScanPanel() {
  const { status, error, pause, resume, cancel } = useScan();
  const running = status?.status === "running" || status?.status === "starting";
  const paused = status?.status === "paused";
  const [pending, setPending] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const act = async (name: string, action: () => Promise<void>) => {
    if (pending) return;
    setPending(name);
    try { await action(); } finally { setPending(null); }
  };

  // 进度百分比：直接使用后端真实进度（已统计字节/盘已用空间）
  const known = typeof status?.percent === 'number' && Number.isFinite(status.percent);
  const pct = known ? Math.max(0, Math.min(100, status!.percent!)) : 0;

  // 空闲状态：头部已有「开始扫描」，这里不再重复展示控制区
  if (!running && !paused) return null;

  return (
    <div className="panel scan-overlay animate-in">
      <div className="scan-ring-wrap" role="progressbar" aria-label={paused ? '扫描已暂停' : '磁盘扫描'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? pct : undefined} aria-valuetext={known ? pct + '%' : '正在枚举文件，暂时无法计算进度'} style={{ ["--pct" as any]: pct } as React.CSSProperties}>
        <div className="scan-ring" />
        <div className="scan-ring-center">
          <span className="pct">{known ? pct.toFixed(0) + '%' : '—'}</span>
          <span className="pct-label">{paused ? "已暂停" : "正在扫描"}</span>
        </div>
      </div>
      <div className="scan-path" title={status?.current_path}>{status?.current_path}</div>
      <div className="scan-numbers">
        <div className="sn"><b>{(status?.files_count ?? 0).toLocaleString()}</b><span>已扫描文件</span></div>
        <div className="sn"><b>{formatBytes(status?.bytes_scanned ?? 0)}</b><span>已统计大小</span></div>
        <div className="sn"><b>{formatClock(status?.elapsed_ms ?? 0)}</b><span>耗时</span></div>
        <div className="sn"><b>{status?.errors ?? 0}</b><span>跳过 / 读取失败</span></div>
      </div>
      <div className="scan-actions">
        {paused
          ? <button type="button" className="btn primary" disabled={Boolean(pending)} aria-busy={pending === 'resume'} onClick={() => void act('resume', resume)}>继续扫描</button>
          : <button type="button" className="btn" disabled={Boolean(pending)} aria-busy={pending === 'pause'} onClick={() => void act('pause', pause)}>暂停</button>}
        <button type="button" className="btn danger" disabled={Boolean(pending)} onClick={() => setConfirmCancel(true)}>取消扫描</button>
      </div>
      {error && <div className="notice error">{error}</div>}
      <ConfirmModal open={confirmCancel} title="取消当前扫描？" desc="只停止扫描，不删除文件。已经读取的结果会保留，但不能视为全盘扫描完成。" confirmText="确认取消扫描" busy={pending === 'cancel'} onClose={() => setConfirmCancel(false)} onConfirm={() => void act('cancel', async () => { await cancel(); setConfirmCancel(false); })} />
    </div>
  );
}
