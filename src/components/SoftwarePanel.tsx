import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import Icon from "./icons";
import type { ResidueResult, SoftwareItem } from "../types";
import { useToast } from "../store/ToastContext";

function isIdle(it: SoftwareItem): boolean {
  if (it.last_used) {
    const d = new Date(it.last_used).getTime();
    return Number.isFinite(d) && Date.now() - d > 180 * 24 * 3600 * 1000;
  }
  if (it.install_date) {
    const d = new Date(it.install_date).getTime();
    return Number.isFinite(d) && Date.now() - d > 180 * 24 * 3600 * 1000;
  }
  return false;
}

const AVATAR_COLORS = [
  "#8B5CF6", "#7C8FF8", "#5B8DEF", "#A78BFA", "#6366F1",
  "#0EA5E9", "#14B8A6", "#8B5CF6", "#4F46E5", "#22D3EE",
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

type SortOrder = "size_desc" | "size_asc";

export default function SoftwarePanel() {
  const [items, setItems] = useState<SoftwareItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [drive, setDrive] = useState<"all" | "C:" | "D:">("all");
  const [idleOnly, setIdleOnly] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("size_desc");
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // 卸载中 / 残留扫描状态
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [residueFor, setResidueFor] = useState<string | null>(null);
  const [residueResult, setResidueResult] = useState<ResidueResult | null>(null);
  const [residueBusy, setResidueBusy] = useState(false);

  const toast = useToast();
  const loadedIcons = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.software();
      setItems(r.items);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // 加载图标（逐个异步，失败则回退头像）
  useEffect(() => {
    for (const it of items) {
      if (loadedIcons.current.has(it.name)) continue;
      loadedIcons.current.add(it.name);
      api.softwareIcon(it.name)
        .then((r) => {
          setIcons((prev) => ({ ...prev, [it.name]: `data:image/png;base64,${r.icon}` }));
        })
        .catch(() => {});
    }
  }, [items]);

  const drives = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of items) {
      const d = it.drive || "C:";
      map[d] = (map[d] || 0) + 1;
    }
    return Object.keys(map).sort();
  }, [items]);

  const shown = useMemo(() => {
    let arr = items;
    if (drive !== "all") arr = arr.filter((i) => (i.drive || "C:") === drive);
    if (idleOnly) arr = arr.filter(isIdle);
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      arr = arr.filter((i) => (i.name || "").toLowerCase().includes(k) || (i.publisher || "").toLowerCase().includes(k));
    }
    const mul = sortOrder === "size_desc" ? -1 : 1;
    return [...arr].sort((a, b) => mul * ((a.installed_size_mb ?? 0) - (b.installed_size_mb ?? 0)));
  }, [items, drive, idleOnly, keyword, sortOrder]);

  const doUninstall = async (it: SoftwareItem) => {
    if (!it.uninstall_string) return;
    if (!window.confirm(`将启动「${it.name}」的官方卸载程序。\n\n请在随后弹出的卸载向导中完成操作。`)) return;
    setUninstalling(it.name);
    setError(null);
    try {
      const r = await api.softwareUninstall(it.uninstall_string);
      if (r.ok) {
        toast.push({ kind: "ok", message: r.message });
        // 卸载后允许扫描残留
        setResidueFor(it.name);
      } else {
        toast.push({ kind: "error", message: r.message });
      }
    } catch (e) {
      toast.push({ kind: "error", message: String(e instanceof Error ? e.message : e) });
    } finally {
      setUninstalling(null);
    }
  };

  const doResidue = async (it: SoftwareItem) => {
    setResidueBusy(true);
    setResidueResult(null);
    try {
      const r = await api.softwareResidue(it.name, it.install_location || "");
      setResidueResult(r);
      setResidueFor(it.name);
      toast.push({ kind: "info", message: `发现 ${r.count} 处残留` });
    } catch (e) {
      toast.push({ kind: "error", message: String(e instanceof Error ? e.message : e) });
    } finally {
      setResidueBusy(false);
    }
  };

  const closeResidue = () => {
    setResidueResult(null);
    setResidueFor(null);
  };

  const idleCount = items.filter(isIdle).length;

  return (
    <div className="animate-in">
      <div className="panel">
        <div className="tool-heading">
          <h2><span className="tool-icon"><Icon name="package" size={22} /></span> 软件管理</h2>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          读取注册表 Uninstall 列表，系统组件已自动排除；可直接启动官方卸载，卸载后可扫描残留。
        </p>

        {/* 搜索与筛选区 */}
        <div className="sw-toolbar">
          <div className="sw-search">
            <Icon name="search" size={15} />
            <input
              type="text"
              placeholder="搜索软件名 / 发布者…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            {keyword && (
              <button className="sw-search-clear" onClick={() => setKeyword("")} title="清空">
                <Icon name="x" size={13} />
              </button>
            )}
          </div>

          <div className="sw-drive-tabs">
            <button className={`sw-drive-tab ${drive === "all" ? "active" : ""}`} onClick={() => setDrive("all")}>
              全部 <span className="sw-count">{items.length}</span>
            </button>
            {drives.map((d) => (
              <button key={d} className={`sw-drive-tab ${drive === d ? "active" : ""}`} onClick={() => setDrive(d as any)}>
                {d}盘 <span className="sw-count">{items.filter((i) => (i.drive || "C:") === d).length}</span>
              </button>
            ))}
          </div>

          <div className="sw-actions">
            <label className="sw-idle-toggle">
              <input type="checkbox" checked={idleOnly} onChange={(e) => setIdleOnly(e.target.checked)} />
              只看闲置
            </label>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)} style={{ height: 30 }}>
              <option value="size_desc">大小 ↓（大到小）</option>
              <option value="size_asc">大小 ↑（小到大）</option>
            </select>
            <button className="btn small" onClick={load} disabled={loading}>刷新</button>
          </div>
        </div>

        <div className="sw-summary">
          共 <b>{shown.length}</b> 个软件{idleCount > 0 ? ` · 闲置 ${idleCount} 个` : ""}
        </div>
        {error && <div className="notice error">{error}</div>}
      </div>

      <div className="sw-grid">
        {shown.map((it) => {
          const idle = isIdle(it);
          const iconUrl = icons[it.name];
          const isResidue = residueFor === it.name && residueResult;
          return (
            <div className={`sw-card ${idle ? "idle" : ""}`} key={it.name + it.install_location}>
              {idle && <span className="badge badge-caution sw-idle-badge">闲置</span>}
              <div className="sw-card-head">
                {iconUrl ? (
                  <img className="sw-icon-img" src={iconUrl} alt="" />
                ) : (
                  <div className="sw-icon" style={{ background: avatarColor(it.name || "?") }}>
                    {(it.name || "?").trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="sw-card-head-text">
                  <div className="sw-name" title={it.name}>{it.name}</div>
                  <div className="sw-pub">{it.publisher || "未知发布者"}</div>
                </div>
                <span className="sw-drive-badge" title={`安装位置：${it.install_location || "未知"}`}>
                  {it.drive || "C:"}
                </span>
              </div>
              <div className="sw-meta">
                <span>大小 {it.installed_size_mb != null ? `${it.installed_size_mb} MB` : "未知"}</span>
                <span>安装 {it.install_date || "未知"}</span>
              </div>
              {it.install_location && (
                <div className="sw-location" title={it.install_location}>{it.install_location}</div>
              )}
              <div className="sw-actions">
                {it.uninstall_string ? (
                  <>
                    <button
                      className="btn small danger"
                      onClick={() => doUninstall(it)}
                      disabled={uninstalling === it.name}
                    >
                      {uninstalling === it.name ? "启动中…" : "卸载"}
                    </button>
                    <button
                      className="btn small"
                      onClick={() => doResidue(it)}
                      disabled={residueBusy}
                    >
                      扫描残留
                    </button>
                  </>
                ) : (
                  <span className="dim" style={{ fontSize: 12 }}>无卸载入口</span>
                )}
              </div>

              {isResidue && (
                <div className="sw-residue">
                  <div className="sw-residue-head">
                    <span>残留（{residueResult!.count} 处 · 共 {formatBytes(residueResult!.total_bytes)}）</span>
                    <button className="sw-search-clear" onClick={closeResidue}><Icon name="x" size={13} /></button>
                  </div>
                  <div className="sw-residue-list">
                    {residueResult!.items.length === 0 && <div className="dim">未发现残留</div>}
                    {residueResult!.items.map((r) => (
                      <div className="sw-residue-item" key={r.path} title={r.path}>
                        <Icon name={r.is_dir ? "archive" : "file"} size={12} />
                        <span className="sw-residue-path">{r.path}</span>
                        <span className="sw-residue-size">{formatBytes(r.size)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {shown.length === 0 && <div className="empty">未找到匹配的软件</div>}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const n = Math.abs(bytes);
  if (n < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i += 1;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}
