import Icon from "./icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { CacheCandidate, CacheOverview } from "../types";
import { formatBytes } from "../utils/format";
import { useToast } from "../store/ToastContext";
import { KB_RECOMMENDATION_META, kbRiskLabel } from "../utils/format";
import { loadSettings } from "./SettingsPanel";
import ConfirmModal from "./ConfirmModal";

type RecFilter = "all" | "recommend" | "caution";

interface Props {
  onOpenKb?: () => void;
}

export default function CachePanel({ onOpenKb }: Props) {
  const [overview, setOverview] = useState<CacheOverview | null>(null);
  const [items, setItems] = useState<CacheCandidate[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [recFilter, setRecFilter] = useState<RecFilter>("all");
  const [onlyAttached, setOnlyAttached] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const ov = await api.cacheOverview();
      setOverview(ov);
      setItems(ov.items);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    let arr = items;
    if (recFilter !== "all") arr = arr.filter((c) => c.recommendation === recFilter);
    if (onlyAttached) arr = arr.filter((c) => c.app_attached);
    if (keyword) {
      const k = keyword.toLowerCase();
      arr = arr.filter((c) =>
        (c.label || "").toLowerCase().includes(k) ||
        (c.app || "").toLowerCase().includes(k) ||
        (c.description || "").toLowerCase().includes(k)
      );
    }
    return arr;
  }, [items, recFilter, onlyAttached, keyword]);

  const toggle = (p: string, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(p); else next.delete(p);
      return next;
    });
  };

  const toggleExpand = (p: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  };

  const clean = async () => {
    const paths = Array.from(checked);
    if (paths.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.cleanCache(paths, false, loadSettings().restorePointOnDelete);
      toast.push({ kind: "ok", message: `缓存清理完成，释放 ${formatBytes(res.freed_bytes)}` });
      setChecked(new Set());
      setExpanded(new Set());
      setConfirmOpen(false);
      await load();
      // 清理后强制刷新大小统计（跳过 TTL 缓存）
      const ov = await api.cacheOverview(true);
      setOverview(ov);
      setItems(ov.items);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const totalBytes = overview?.total_bytes ?? 0;
  const attachedBytes = overview?.attached_bytes ?? 0;
  const recommendBytes = overview?.by_recommendation?.recommend ?? 0;

  const activeFilters = (keyword ? 1 : 0) + (recFilter !== "all" ? 1 : 0) + (onlyAttached ? 1 : 0);

  return (
    <div className="panel animate-in">
      <div className="tool-heading">
        <h2><span className="tool-icon"><Icon name="eraser" size={22} /></span> 缓存一键清理</h2>
        {onOpenKb && (
          <button className="btn small ghost" onClick={onOpenKb} title="查看每个缓存目录的用途与删除影响">
            <Icon name="book" size={13} /> 目录百科
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        自动识别<b>浏览器、聊天软件、开发工具、系统更新</b>等缓存目录。每项标注<b>所属软件</b>与<b>清理建议</b>，勾选后一键移入回收站（受保护路径后端仍会拒绝）。想知道「这个文件夹是干嘛的、删了会怎样」，可到<b>目录百科</b>查看详细说明。
      </p>

      {/* 概览统计 */}
      <div className="kb-stats">
        <div className="kb-stat"><b>{items.length}</b><span>识别位置</span></div>
        <div className="kb-stat"><b>{formatBytes(totalBytes)}</b><span>可释放合计</span></div>
        <div className="kb-stat tone-rec"><b>{formatBytes(recommendBytes)}</b><span>推荐清理</span></div>
        <div className="kb-stat"><b>{formatBytes(attachedBytes)}</b><span>依附应用({overview?.attached_count ?? 0}项)</span></div>
      </div>

      <div className="toolbar">
        <button className="btn danger" onClick={() => setConfirmOpen(true)} disabled={checked.size === 0 || busy}>
          {busy ? "清理中…" : `清理所选 (${checked.size})`}
        </button>
        <button className="btn" onClick={load} disabled={busy}>刷新</button>
        <input className="search" placeholder="搜索缓存名 / 所属软件…" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <select value={recFilter} onChange={(e) => setRecFilter(e.target.value as RecFilter)}>
          <option value="all">全部建议</option>
          <option value="recommend">仅推荐清理</option>
          <option value="caution">仅谨慎清理</option>
        </select>
        <label className="option-line kb-option">
          <input type="checkbox" checked={onlyAttached} onChange={(e) => setOnlyAttached(e.target.checked)} />
          <span className="muted" style={{ fontSize: 12 }}>仅依附应用</span>
        </label>
        {activeFilters > 0 && (
          <button className="btn small ghost" onClick={() => { setKeyword(""); setRecFilter("all"); setOnlyAttached(false); }}>
            清除筛选
          </button>
        )}
        <div className="toolbar-spacer" />
        <span className="toolbar-total">显示 {shown.length} / {items.length} 个位置 · 共 {formatBytes(totalBytes)}</span>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="cache-list">
        {items.length === 0 && !error && overview === null && (
          <div className="cache-skeleton">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton cache-skel-row" />
            ))}
          </div>
        )}
        {items.length === 0 && !error && overview !== null && <div className="empty">未识别到可清理的缓存目录</div>}
        {shown.map((c) => {
          const rec = KB_RECOMMENDATION_META[c.recommendation ?? "caution"] ?? { label: "谨慎清理", cls: "badge-caution" };
          const open = expanded.has(c.path);
          return (
            <div className={`cache-item ${open ? "open" : ""}`} key={c.path}>
              <div className="cache-row" onClick={() => toggleExpand(c.path)}>
                <input
                  type="checkbox"
                  checked={checked.has(c.path)}
                  onChange={(e) => { e.stopPropagation(); toggle(c.path, e.target.checked); }}
                />
                <div className="cache-main">
                  <div className="cache-label">
                    {c.label}
                    {c.app && <span className="cache-app">{c.app}</span>}
                  </div>
                  <div className="cache-path">{c.path}</div>
                </div>
                <span className={`badge ${rec.cls}`}>{rec.label}</span>
                <span className={`badge badge-risk-${c.risk ?? "medium"}`}>{kbRiskLabel(c.risk ?? "medium")}</span>
                <span className="cache-size">{formatBytes(c.bytes)}</span>
                <button
                  className="btn-mini-icon"
                  title="在资源管理器中打开该位置"
                  onClick={(e) => { e.stopPropagation(); api.reveal(c.path).catch(() => toast.push({ kind: "error", message: "无法打开位置" })); }}
                >
                  <Icon name="folder" size={13} />
                </button>
                <span className="cache-arrow">{open ? "收起" : "详情"}</span>
              </div>
              {open && (
                <div className="cache-detail">
                  {c.description && <div className="cd-row"><b>是什么：</b><span>{c.description}</span></div>}
                  {c.delete_impact && <div className="cd-row"><b>删除影响：</b><span>{c.delete_impact}</span></div>}
                  {c.app_attached && <div className="cd-row"><b>依附关系：</b><span>属于 {c.app}，卸载该软件后通常随之一并清理</span></div>}
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && <div className="empty">正在识别可清理的缓存目录…</div>}
        {items.length > 0 && shown.length === 0 && <div className="empty">没有匹配的缓存位置，试试清除筛选</div>}
      </div>

      <div className="kb-tip" style={{ marginTop: 14 }}>
        清理默认移入回收站（可恢复）。每一项都来自「目录百科」的缓存类条目，系统核心、用户文件、聊天记录等不会出现在这里。
      </div>

      <ConfirmModal
        open={confirmOpen}
        danger
        title={`清理 ${checked.size} 个缓存位置？`}
        desc={<>这些缓存将移入回收站，可在 <b>30 天内恢复</b>。受系统保护的位置后端会始终拒绝。</>}
        confirmText={`移入回收站 (${checked.size})`}
        busy={busy}
        onConfirm={clean}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
