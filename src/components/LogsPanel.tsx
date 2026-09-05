import Icon from "./icons";
import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import type { LogEntry } from "../types";
import { formatBytes } from "../utils/format";
import { useToast } from "../store/ToastContext";

export default function LogsPanel() {
  const [items, setItems] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = async () => {
    try {
      const r = await api.logs();
      setItems(r.items);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };
  useEffect(() => { load(); }, []);

  const exportCsv = () => {
    window.open(`${api.base()}/api/logs/export`, "_blank");
    toast.push({ kind: "info", message: "已开始导出 CSV…", });
  };

  return (
    <div className="panel animate-in">
      <div className="tool-heading">
        <h2><span className="tool-icon"><Icon name="log" size={22} /></span> 删除日志</h2>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>记录每次删除的文件名 / 路径 / 大小 / 时间，可导出 CSV。</p>
      <div className="toolbar">
        <button className="btn" onClick={load}>刷新</button>
        <button className="btn primary" onClick={exportCsv}>导出 CSV</button>
        <div className="toolbar-spacer" />
        <span className="toolbar-total">{items.length} 条记录</span>
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>时间</th><th>文件名</th><th>路径</th><th>大小</th><th>方式</th></tr>
          </thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={i}>
                <td className="num">{r.time}</td>
                <td title={r.path}>{r.name}</td>
                <td title={r.path}>{r.path}</td>
                <td className="num">{formatBytes(r.size)}</td>
                <td>{r.permanent ? <span className="badge badge-danger">永久删除</span> : <span className="badge badge-ok">回收站</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty">暂无删除记录</div>}
      </div>
    </div>
  );
}