import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import Icon from "./icons";
import type { FactoryCheckResult, FactoryItem } from "../types";

function categoryLabel(c: string): string {
  const map: Record<string, string> = {
    system_core: "系统核心",
    boot: "启动引导",
    drivers: "驱动程序",
    oem: "厂商预装",
  };
  return map[c] || c;
}

function ItemRow({ item }: { item: FactoryItem }) {
  const ok = item.exists;
  return (
    <div className={`fc-item ${ok ? "ok" : "missing"}`}>
      <span className="fc-status">
        {ok ? <Icon name="check" size={14} /> : <Icon name="alert" size={14} />}
      </span>
      <div className="fc-main">
        <div className="fc-name">
          {item.name}
          <span className="fc-cat">{categoryLabel(item.category)}</span>
          {!ok && item.severity === "high" && <span className="badge badge-system">必备</span>}
        </div>
        <div className="fc-path" title={item.path}>{item.path}</div>
        <div className="fc-desc">{item.description}</div>
      </div>
      <span className={`fc-badge ${ok ? "ok" : "miss"}`}>{ok ? "齐全" : "缺失"}</span>
    </div>
  );
}

export default function FactoryPanel() {
  const [data, setData] = useState<FactoryCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.factoryCheck());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const dev = data?.device;
  const sum = data?.summary;

  return (
    <div className="panel animate-in">
      <div className="tool-heading">
        <h2><span className="tool-icon"><Icon name="shield" size={22} /></span> 出厂必备文件检测</h2>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        扫描 C 盘系统核心与启动必备文件，按设备类型（品牌 / 机型 / 笔记本或台式机）执行差异化检测。结果仅作参考，不执行任何修复。
      </p>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className="btn" onClick={load} disabled={loading}>重新检测</button>
        <span className="muted" style={{ fontSize: 12 }}>只读检测 · 不修改任何系统文件</span>
      </div>

      {error && <div className="notice error">{error}</div>}

      {loading && <div className="empty">正在检测…</div>}

      {!loading && data && (
        <>
          {/* 设备信息 */}
          <div className="fc-device">
            <div className="fc-device-row">
              <span className="fc-device-label">设备</span>
              <span className="fc-device-value">
                {dev?.brand || "未知品牌"} {dev?.product || ""}
                {dev?.is_laptop ? " · 笔记本" : dev?.chassis === "desktop" ? " · 台式机" : ""}
              </span>
              <span className="fc-device-value dim">{dev?.arch}</span>
            </div>
          </div>

          {/* 汇总 */}
          <div className="fc-summary">
            <div className={`fc-summary-card ${sum?.healthy ? "healthy" : "warn"}`}>
              <span className="fc-summary-num">{sum?.missing_high ?? 0}</span>
              <span className="fc-summary-label">必备文件缺失</span>
            </div>
            <div className="fc-summary-card">
              <span className="fc-summary-num">{sum?.present ?? 0}</span>
              <span className="fc-summary-label">已齐全</span>
            </div>
            <div className="fc-summary-card">
              <span className="fc-summary-num">{sum?.total ?? 0}</span>
              <span className="fc-summary-label">检测项总数</span>
            </div>
          </div>

          {sum?.healthy && <div className="notice ok">系统核心与启动必备文件齐全，未发现缺失。</div>}

          {/* 检测项列表 */}
          <div className="fc-list">
            {data.items.map((it) => <ItemRow key={it.path} item={it} />)}
          </div>
        </>
      )}
    </div>
  );
}
