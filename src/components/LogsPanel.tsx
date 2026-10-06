import Icon from "./icons";
import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import type { LogEntry } from "../types";
import { formatBytes } from "../utils/format";
import { useToast } from "../store/ToastContext";

export default function LogsPanel() {
  const [items, setItems] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.logs();
      setItems(r.items);
      setTotal(r.total ?? r.items.length);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // 必须走带 X-DCA-Token 的请求：window.open 裸 GET 在打包版会被后端 401 挡掉，
      // 而旧代码仍然先弹"已开始导出"，等于谎报成功。
      await api.exportLogs();
      toast.push({ kind: "ok", message: "已导出 CSV" });
    } catch (e) {
      toast.push({ kind: "error", message: "导出失败：" + String(e instanceof Error ? e.message : e) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="panel animate-in">
      <div className="tool-heading">
        <h2><span className="tool-icon"><Icon name="log" size={22} /></span> 删除日志</h2>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>记录每次删除的文件名 / 路径 / 大小 / 时间，可导出 CSV。</p>
      <div className="toolbar">
        <button className="btn" onClick={load} disabled={loading}>刷新</button>
        <button className="btn primary" onClick={exportCsv} disabled={exporting || loading}>{exporting ? "导出中…" : "导出 CSV"}</button>
        <div className="toolbar-spacer" />
        <span className="toolbar-total">{total} 条记录</span>
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>时间</th><th>文件名</th><th>路径</th><th>大小</th><th>方式</th></tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={`${r.time}|${r.path}`}>
                <td className="num">{r.time}</td>
                <td title={r.path}>{r.name}</td>
                <td title={r.path}>{r.path}</td>
                <td className="num">{formatBytes(r.size)}</td>
                <td>{r.permanent ? <span className="badge badge-danger">永久删除</span> : <span className="badge badge-ok">回收站</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="empty-row">正在读取删除记录…</div>}
        {!loading && !error && items.length === 0 && <div className="empty">暂无删除记录</div>}
      </div>
    </div>
  );
}