import Icon from "./icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { FolderKbItem, KbCategories } from "../types";
import {
  KB_CATEGORY_META,
  KB_RECOMMENDATION_META,
  kbRecommendationColor,
  kbRiskLabel,
} from "../utils/format";

type RecFilter = "all" | "recommend" | "caution" | "keep" | "system";
type CatFilter = "all" | FolderKbItem["category"];

export default function KnowledgePanel() {
  const [items, setItems] = useState<FolderKbItem[]>([]);
  const [meta, setMeta] = useState<KbCategories | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [recFilter, setRecFilter] = useState<RecFilter>("all");
  const [catFilter, setCatFilter] = useState<CatFilter>("all");
  const [onlyExisting, setOnlyExisting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [folders, cats] = await Promise.all([api.kbFolders(), api.kbCategories()]);
      setItems(folders.items);
      setMeta(cats);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    let arr = items;
    if (onlyExisting) arr = arr.filter((i) => i.exists);
    if (recFilter !== "all") arr = arr.filter((i) => i.recommendation === recFilter);
    if (catFilter !== "all") arr = arr.filter((i) => i.category === catFilter);
    if (keyword) {
      const k = keyword.toLowerCase();
      arr = arr.filter((i) =>
        i.name.toLowerCase().includes(k) ||
        (i.app || "").toLowerCase().includes(k) ||
        i.description.toLowerCase().includes(k)
      );
    }
    return arr;
  }, [items, onlyExisting, recFilter, catFilter, keyword]);

  const stats = useMemo(() => {
    const exists = items.filter((i) => i.exists).length;
    const attached = items.filter((i) => i.app_attached).length;
    const recCount = items.filter((i) => i.recommendation === "recommend").length;
    return { total: items.length, exists, attached, recCount };
  }, [items]);

  const activeFilters = (onlyExisting ? 1 : 0) + (recFilter !== "all" ? 1 : 0) + (catFilter !== "all" ? 1 : 0) + (keyword ? 1 : 0);

  return (
    <div className="panel kb-panel animate-in">
      <div className="tool-heading">
        <h2><span className="tool-icon"><Icon name="book" size={22} /></span> 目录百科</h2>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        常见 Windows 系统/软件目录的「用途说明 + 是否依附应用 + 清理建议」。帮你判断<b>这个文件夹是干嘛的、能不能删、删了会怎样</b>。
      </p>

      {/* 统计条 */}
      <div className="kb-stats">
        <div className="kb-stat"><b>{stats.total}</b><span>收录目录</span></div>
        <div className="kb-stat"><b>{stats.exists}</b><span>本机存在</span></div>
        <div className="kb-stat"><b>{stats.attached}</b><span>依附应用</span></div>
        <div className="kb-stat tone-rec"><b>{stats.recCount}</b><span>推荐清理</span></div>
      </div>

      {/* 筛选工具栏 */}
      <div className="toolbar kb-toolbar">
        <input
          className="search"
          placeholder="搜索目录名 / 所属软件 / 用途…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <select value={recFilter} onChange={(e) => setRecFilter(e.target.value as RecFilter)}>
          <option value="all">全部建议</option>
          <option value="recommend">推荐清理</option>
          <option value="caution">谨慎清理</option>
          <option value="keep">建议保留</option>
          <option value="system">系统必留</option>
        </select>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value as CatFilter)}>
          <option value="all">全部分类</option>
          {Object.entries(KB_CATEGORY_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <label className="option-line kb-option">
          <input type="checkbox" checked={onlyExisting} onChange={(e) => setOnlyExisting(e.target.checked)} />
          <span className="muted" style={{ fontSize: 12 }}>仅看本机存在</span>
        </label>
        <div className="toolbar-spacer" />
        <span className="toolbar-total">显示 {shown.length} / {items.length} 条</span>
        {activeFilters > 0 && (
          <button
            className="btn small ghost"
            onClick={() => { setKeyword(""); setRecFilter("all"); setCatFilter("all"); setOnlyExisting(false); }}
          >
            清除筛选
          </button>
        )}
        <button className="btn small" onClick={load} disabled={loading}>刷新</button>
      </div>

      {error && <div className="notice error">{error}</div>}
      {loading && (
        <div className="kb-skeleton">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton kb-skel-card" />
          ))}
        </div>
      )}
      {!loading && shown.length === 0 && (
        <div className="empty">{activeFilters ? "没有匹配的目录，试试清除筛选" : "目录百科暂无数据"}</div>
      )}

      {/* 条目卡片 */}
      <div className="kb-list">
        {shown.map((it) => {
          const cat = KB_CATEGORY_META[it.category] ?? { label: it.category, color: "#888", icon: "" };
          const rec = KB_RECOMMENDATION_META[it.recommendation] ?? { label: it.recommendation, cls: "badge-muted" };
          return (
            <div className={`kb-item kb-${it.recommendation}`} key={it.id}>
              <div className="kb-item-head">
                <span className="kb-item-icon" style={{ color: cat.color }}>{cat.icon}</span>
                <div className="kb-item-title">
                  <div className="kb-name">{it.name}</div>
                  <div className="kb-app">
                    {it.app ? (
                      <>
                        <span className="kb-app-name">{it.app}</span>
                        {it.app_attached && <span className="badge badge-muted kb-attached">依附于应用</span>}
                      </>
                    ) : (
                      <span className="muted">系统级目录（不依附于具体应用）</span>
                    )}
                  </div>
                </div>
                <div className="kb-item-tags">
                  <span className={`badge ${rec.cls}`}>{rec.label}</span>
                  <span className={`badge badge-risk-${it.risk}`}>{kbRiskLabel(it.risk)}</span>
                  {it.exists
                    ? <span className="badge badge-rec">本机存在</span>
                    : <span className="badge badge-muted">本机未装</span>}
                </div>
              </div>

              <div className="kb-desc">
                <span className="kb-desc-label">是什么</span>
                <span className="kb-desc-text">{it.description}</span>
              </div>
              <div className="kb-desc">
                <span className="kb-desc-label">删除影响</span>
                <span className="kb-desc-text">{it.delete_impact}</span>
              </div>
              <div className="kb-path">
                <span className="kb-desc-label">路径</span>
                <code className="kb-path-code">{it.resolved_path || it.path}</code>
                {it.exists && (it.resolved_path || it.path) && (
                  <button
                    className="btn-mini-icon"
                    title="在资源管理器中打开该位置"
                    onClick={() => api.reveal(it.resolved_path || it.path).catch(() => {})}
                  >
                    <Icon name="folder" size={13} />
                  </button>
                )}
                {!it.exists && it.resolved_path && <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>（本机未检测到）</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* 图例说明 */}
      <div className="kb-legend">
        <div className="kb-legend-title">建议含义</div>
        <div className="kb-legend-row">
          {Object.entries(KB_RECOMMENDATION_META).map(([k, v]) => (
            <span className="kb-legend-item" key={k}>
              <i style={{ background: kbRecommendationColor(k) }} />
              <span className={`badge ${v.cls}`}>{v.label}</span>
              <span className="kb-legend-desc">
                {k === "recommend" ? "缓存/临时，删了会自动重建" :
                 k === "caution" ? "可能含数据，先确认再删" :
                 k === "keep" ? "你的文件/配置，建议保留" : "系统核心，绝不删除"}
              </span>
            </span>
          ))}
        </div>
        <div className="kb-tip">
          一键清理只处理「推荐/谨慎」的缓存类目录；「系统必留」「用户文件」「软件数据」仅展示说明，绝不会被一键清理。
        </div>
      </div>
    </div>
  );
}
