import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { formatBytes } from "../utils/format";
import { useTheme } from "../hooks/useTheme";
import Icon from "./icons";
import type { DriveInfo } from "../types";

export interface NavItem {
  key: string;
  label: string;
  icon?: string;
  badge?: string;
}

export interface StatusInfo {
  kind: "idle" | "running" | "paused" | "ok" | "warn";
  label: string;
  right?: string;
}

interface Props {
  nav: NavItem[];
  active: string;
  onNavigate: (key: string) => void;
  statusInfo: StatusInfo;
  children: React.ReactNode;
}

function deriveStatusInfo(st: any): StatusInfo {
  const files = st?.files_count ?? 0;
  const cur = st?.current_path || "";
  switch (st?.status) {
    case "running":
    case "starting":
      return { kind: "running", label: `正在扫描：${files.toLocaleString()} 个文件`, right: cur };
    case "paused":
      return { kind: "warn", label: `扫描已暂停（已扫描 ${files.toLocaleString()} 个文件）`, right: "已暂停" };
    case "completed":
      return { kind: "ok", label: `扫描完成 · 共 ${files.toLocaleString()} 个文件`, right: "" };
    case "cancelled":
      return { kind: "warn", label: "扫描已取消，可重新开始", right: "" };
    case "error":
      return { kind: "warn", label: "扫描出错：" + (st?.message || "未知错误"), right: "" };
    default:
      return { kind: "idle", label: "就绪", right: "" };
  }
}

function TopbarDrives() {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  useEffect(() => {
    api.drives().then((r) => setDrives(r.items)).catch(() => {});
  }, []);
  if (drives.length === 0) return null;
  return (
    <div className="topbar-drives">
      {drives.map((d) => {
        const used = Math.max(0, d.total - d.free);
        const pct = d.total > 0 ? Math.min(100, Math.round((used / d.total) * 100)) : 0;
        const tone = pct >= 90 ? "full" : pct >= 75 ? "high" : "";
        return (
          <div className="topbar-drive" key={d.drive} title={`${d.label || d.drive} 已用 ${formatBytes(used)} / ${formatBytes(d.total)}`}>
            <span className="num">{d.drive.replace(":", "")}</span>
            <span className={`db ${tone}`}><i style={{ width: `${pct}%` }} /></span>
            <span className="num dim">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Shell({ nav, active, onNavigate, statusInfo, children }: Props) {
  const { theme, toggleTheme } = useTheme();
  const [liveScan, setLiveScan] = useState<any>(null);
  useEffect(() => {
    const h = (e: any) => setLiveScan(e.detail);
    window.addEventListener("ltb-scan-status", h);
    return () => window.removeEventListener("ltb-scan-status", h);
  }, []);
  const resolved: StatusInfo = liveScan ? deriveStatusInfo(liveScan) : statusInfo;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-logo"><Icon name="disk" size={16} /></div>
          <div className="topbar-brand-text">
            <span className="topbar-title">本地工具箱</span>
          </div>
        </div>
        <TopbarDrives />
        <div className="topbar-spacer" />
        <div className="topbar-actions">
          <button className="icon-btn" title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} onClick={toggleTheme}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <nav>
            {nav.map((item) => (
              <button
                key={item.key}
                className={`side-item ${active === item.key ? "active" : ""}`}
                onClick={() => onNavigate(item.key)}
                title={item.label}
              >
                <span className="side-icon">
                  {item.icon ? <Icon name={item.icon as any} size={17} /> : <Icon name="file" size={17} />}
                </span>
                <span className="side-label">{item.label}</span>
                {item.badge && <span className="badge badge-muted nav-badge">{item.badge}</span>}
              </button>
            ))}
          </nav>
          <div className="side-spacer" />
          <div className="side-footer">本地工具箱 v0.1.3 · 本地运行</div>
        </aside>

        <div className="main">
          <div className="statusbar">
            <span className="sb-left">
              <span className={`sb-dot ${resolved.kind}`} />
              <span>{resolved.label}</span>
            </span>
            {resolved.right && <span className="sb-right" title={resolved.right}>{resolved.right}</span>}
          </div>
          <div className="content">{children}</div>
        </div>
      </div>
    </div>
  );
}
