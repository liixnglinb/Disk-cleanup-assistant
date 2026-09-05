import Icon from "./icons";
import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useScan } from "../store/ScanContext";
import type { DuplicateGroup } from "../types";
import { baseName, formatBytes, formatTime } from "../utils/format";
import { useToast } from "../store/ToastContext";

export default function DuplicatesPanel() {
  const { scanId } = useScan();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    if (!scanId) return;
    setError(null);
    setBusy(true);
    try {
      const r = await api.duplicates(scanId);
      setGroups(r.groups);
      const keep: Record<string, string> = {};
      for (const g of r.groups) keep[g.hash] = g.files[0].path;
      setKeepByGroup(keep);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [scanId]);

  useEffect(() => { load(); }, [scanId, load]);

  const keepAction = (hash: string, path: string) => setKeepByGroup((prev) => ({ ...prev, [hash]: path }));

  const clean = async () => {
    const toDelete: string[] = [];
    for (const g of groups) {
      const keep = keepByGroup[g.hash];
      for (const f of g.files) if (f.path !== keep) toDelete.push(f.path);
    }
    if (toDelete.length === 0) return;
    if (!window.confirm(`将 ${toDelete.length} 个重复文件移入回收站？（每个重复组保留你选择的一份）`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.deleteFiles(toDelete, false);
      toast.push({ kind: "ok", message: `已清理 ${res.ok.length} 个重复副本，释放 ${formatBytes(res.freed_bytes)}` });
      await load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-in">
      <div className="panel">
        <div className="tool-heading">
          <h2><span className="tool-icon"><Icon name="copy" size={22} /></span> 重复文件检测</h2>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>先按大小分组，再对同大小文件计算 MD5 确认内容完全相同。每组「保留」哪一份由你选择。</p>
        {!scanId && <div className="notice info">请先完成一次扫描。</div>}
        <div className="toolbar">
          <button className="btn danger" onClick={clean} disabled={!scanId || busy || groups.length === 0}>清理多余副本</button>
          <button className="btn" onClick={load} disabled={!scanId}>重新检测</button>
          <span className="toolbar-total">{groups.length} 组重复</span>
        </div>
        {error && <div className="notice error">{error}</div>}
        {busy && <div className="notice info">正在计算文件指纹（MD5），文件较多时可能需要一段时间…</div>}
      </div>
      {groups.map((g, gi) => (
        <div className="dup-group" key={g.hash} style={{ animation: `fadeIn 0.2s ease ${gi * 0.03}s both` }}>
          <div className="dup-title">组 · 大小 {formatBytes(g.size)} × {g.files.length} 份（可释放 {formatBytes(g.size * (g.files.length - 1))}）</div>
          {g.files.map((f) => (
            <label className={`dup-file ${keepByGroup[g.hash] === f.path ? "dup-keep" : "dup-del"}`} key={f.path}>
              <input type="radio" name={g.hash} checked={keepByGroup[g.hash] === f.path} onChange={() => keepAction(g.hash, f.path)} />
              <span className="dup-path" title={f.path}>{baseName(f.path)}</span>
              <span className="dup-meta">{formatTime(f.mtime)} · {f.path}</span>
            </label>
          ))}
        </div>
      ))}
      {groups.length === 0 && scanId && <div className="empty">未发现重复文件</div>}
    </div>
  );
}