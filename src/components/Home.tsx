import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { TOOL_ENTRIES } from "../tools/registry";
import Icon from "./icons";
import type { DriveInfo } from "../types";
import { formatBytes } from "../utils/format";

interface Props {
  onOpenTool: (id: string) => void;
}

export default function Home({ onOpenTool }: Props) {
  const [backendTools, setBackendTools] = useState<string[] | null>(null);
  const [drives, setDrives] = useState<DriveInfo[] | null>(null);

  useEffect(() => {
    api.tools()
      .then((r) => setBackendTools(r.items.map((t) => t.id)))
      .catch(() => setBackendTools(null));
    api.drives().then((r) => setDrives(r.items)).catch(() => setDrives([]));
  }, []);

  const tools = TOOL_ENTRIES;

  const total = (drives ?? []).reduce((a, d) => a + d.total, 0);
  const free = (drives ?? []).reduce((a, d) => a + d.free, 0);
  const used = Math.max(0, total - free);
  const usedPct = total > 0 ? Math.round((used / total) * 100) : 0;

  return (
    <div className="mhome">
      {/* 顶部主视觉：克制的欢迎条（非大横幅） */}
      <section className="home-hero">
        <div className="home-hero-text">
          <h1>本地工具箱</h1>
          <p>一站式本地工具集 · 扫描、分析、清理，所有数据安全留在本机</p>
        </div>
        <button className="home-hero-cta" onClick={() => tools[0] && onOpenTool(tools[0].meta.id)}>
          <Icon name={tools[0]?.meta.icon as any} size={16} /> 开始使用
        </button>
      </section>

      {/* 概览统计：真实数据 */}
      <section className="home-stats">
        {drives === null ? (
          <>
            <div className="skeleton home-stat-skel" />
            <div className="skeleton home-stat-skel" />
            <div className="skeleton home-stat-skel" />
            <div className="skeleton home-stat-skel" />
          </>
        ) : (
          <>
            <div className="home-stat">
              <span className="home-stat-num num">{drives.length}</span>
              <span className="home-stat-label">磁盘分区</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-num num">{formatBytes(total)}</span>
              <span className="home-stat-label">总容量</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-num num">{formatBytes(used)}</span>
              <span className="home-stat-label">已用 · {usedPct}%</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-num num home-stat-accent">{formatBytes(free)}</span>
              <span className="home-stat-label">可用空间</span>
            </div>
          </>
        )}
      </section>

      {/* 工具汇总：点击进入对应工具 */}
      <section className="msection">
        <div className="msection-head">
          <h3>我的工具</h3>
          <span className="muted dim">{tools.length} 个已安装</span>
        </div>
        <div className="mtool-grid">
          {tools.map((t, i) => {
            const enabled = !backendTools || backendTools.includes(t.meta.id);
            return (
              <button
                key={t.meta.id}
                className={`mtool-card ${enabled ? "" : "disabled"}`}
                style={{ animationDelay: `${0.05 + i * 0.06}s` }}
                onClick={() => enabled && onOpenTool(t.meta.id)}
                disabled={!enabled}
              >
                <span className="mtool-icon"><Icon name={t.meta.icon as any} size={22} /></span>
                <span className="mtool-name">{t.meta.name}</span>
                <span className="mtool-desc">{t.meta.description}</span>
                <span className="mtool-foot">
                  <span className="mtool-ver">v{t.meta.version}</span>
                  <span className="mtool-enter">进入 →</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 磁盘概览 */}
      <section className="msection">
        <div className="msection-head"><h3>磁盘概览</h3></div>
        {drives === null ? (
          <div className="skeleton home-drive-skel" />
        ) : drives.length === 0 ? (
          <div className="empty-state">
            <span className="es-icon"><Icon name="disk" size={26} /></span>
            <h3>未检测到磁盘</h3>
            <p>后端服务可能未启动，请确认本地服务正常运行后刷新。</p>
          </div>
        ) : (
          <div className="drive-grid">
            {drives.map((d) => {
              const used = Math.max(0, d.total - d.free);
              const pct = d.total > 0 ? Math.round((used / d.total) * 100) : 0;
              const tone = pct >= 90 ? "danger" : pct >= 75 ? "warn" : "";
              return (
                <button className={`drive-card ${tone}`} key={d.drive} style={{ textAlign: "left", cursor: "default" }}>
                  <div className="drive-head">
                    <span className="drive-name">{d.label || d.drive}</span>
                    <span className="drive-usage num">{pct}%</span>
                  </div>
                  <div className="drive-bar"><i style={{ width: `${pct}%` }} /></div>
                  <div className="drive-usage">已用 {formatBytes(used)} / 共 {formatBytes(d.total)}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
