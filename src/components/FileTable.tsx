import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, FileQueryPayload } from "../api/client";
import { useScan } from "../store/ScanContext";
import Icon from "./icons";
import type { AiFileResult, FileRecord } from "../types";
import { baseName, CATEGORY_META, dirName, formatBytes, formatTime, RECOMMENDATION_META, RISK_META } from "../utils/format";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "../store/ToastContext";
import { useSettings } from "../store/settings";

const ROW = 44;
const PAGE = 500;
const OVERS = 8;

/**
 * 行内状态一律"图标着色 + 中性文字"，彩色胶囊只留给聚合计数。
 * cls 沿用 utils/format.ts 的既有映射，避免改动被多个面板共用的元数据表。
 */
const TONE_BY_CLS: Record<string, { tone: "ok" | "warn" | "danger" | "muted"; icon: "check" | "alert" | "lock" | "info" | "shield" | "disk" }> = {
  "badge-rec": { tone: "ok", icon: "check" },
  "badge-caution": { tone: "warn", icon: "alert" },
  "badge-keep": { tone: "muted", icon: "info" },
  "badge-system": { tone: "danger", icon: "lock" },
  "badge-large": { tone: "warn", icon: "disk" },
  "badge-risk-low": { tone: "ok", icon: "shield" },
  "badge-risk-medium": { tone: "warn", icon: "alert" },
  "badge-risk-high": { tone: "danger", icon: "alert" },
  "badge-muted": { tone: "muted", icon: "info" },
};
const toneOf = (cls: string) => TONE_BY_CLS[cls] || TONE_BY_CLS["badge-muted"];

export interface FileFilter {
  category?: string;
  recommendation?: string;
  keyword?: string;
  sort?: string;
}

interface Props {
  initialFilter?: FileFilter;
  onFilterChange?: (f: FileFilter) => void;
}

export default function FileTable({ initialFilter, onFilterChange }: Props) {
  const { scanId, selected, setSelected, setSelectedMany, clearSelection, refreshStatistics, status } = useScan();
  const [category, setCategory] = useState(initialFilter?.category ?? "");
  const [recommendation, setRecommendation] = useState(initialFilter?.recommendation ?? "");
  const [largeOnly, setLargeOnly] = useState(false);
  const [needsAiOnly, setNeedsAiOnly] = useState(false);
  const [sort, setSort] = useState(initialFilter?.sort ?? "size_desc");
  const [keyword, setKeyword] = useState(initialFilter?.keyword ?? "");
  const [items, setItems] = useState<FileRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const lastQuery = useRef({ page: 0, append: false });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const toast = useToast();
  // 设置：大文件阈值 / 自动预览 / 已 AI 分析标记（会话内避免重复标“存疑”）
  const settings = useSettings();
  const largeBytes = settings.largeFileMb * 1024 * 1024;
  const aiHandled = useRef<Set<string>>(new Set());

  // AI 分析状态：单文件（C 类）+ 存疑批量（B 类）
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResults, setAiResults] = useState<Record<string, AiFileResult>>({});
  const [aiError, setAiError] = useState<string | null>(null);
  // F7：存疑文件总数角标
  const [needsAiCount, setNeedsAiCount] = useState(0);
  // F3：全选/快捷勾选请求中
  const [selectBusy, setSelectBusy] = useState(false);
  // F6：避免用 key 重挂载，改为扫描完成后自动刷新
  const prevStatusRef = useRef<string | null>(null);

  // F8：筛选变化上报给工具会话，切页签再回来保留
  useEffect(() => {
    onFilterChange?.({ category: category || undefined, recommendation: recommendation || undefined, keyword: keyword || undefined, sort });
  }, [category, recommendation, keyword, sort, onFilterChange]);

  // F7：存疑文件数量
  useEffect(() => {
    if (!scanId) return;
    api.queryFiles({ scan_id: scanId, needs_ai: true, page: 0, page_size: 1 })
      .then((r) => setNeedsAiCount(r.total))
      .catch(() => {});
  }, [scanId]);

  // F6：扫描完成后自动刷新列表（替代旧版 key={status.status} 整表重挂载）
  const st = status?.status ?? null;
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = st;
    if (prev === "running" && st === "completed" && scanId) load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, scanId]);

  const load = useCallback(async (pageToLoad: number, append: boolean) => {
    if (!scanId) return;
    const version = ++requestVersion.current;
    lastQuery.current = { page: pageToLoad, append };
    setLoading(true);
    setLoadError(null);
    try {
      const r = await api.queryFiles({
        scan_id: scanId,
        category: category || undefined,
        keyword: keyword || undefined,
        sort,
        recommendation: recommendation || undefined,
        min_size: largeOnly ? largeBytes : 0,
        needs_ai: needsAiOnly ? true : undefined,
        page: pageToLoad,
        page_size: PAGE,
      });
      if (version !== requestVersion.current) return;
      if (append) setItems((p) => [...p, ...r.items]);
      else setItems(r.items);
      setTotal(r.total);
      setPage(pageToLoad);
    } catch (e) {
      if (version === requestVersion.current) setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [scanId, category, keyword, sort, recommendation, largeOnly, needsAiOnly]);

  useEffect(() => {
    setItems([]);
    setTotal(0);
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
    if (scanId) load(0, false);
  }, [scanId, category, sort, keyword, recommendation, largeOnly, needsAiOnly, load]);

  // 单文件 AI 分析（C 类）
  const analyzeSingle = async (rec: FileRecord) => {
    setAiBusy(true);
    setAiError(null);
    try {
      const r = await api.aiAnalyze([rec.path], false);
      if (r.ok && r.items.length) {
        setAiResults((prev) => ({ ...prev, [rec.path]: r.items[0] }));
        aiHandled.current.add(rec.path);
        toast.push({ kind: "ok", message: "AI 分析完成（仅参考）" });
      } else {
        setAiError(r.message || "AI 分析失败");
      }
    } catch (e) {
      setAiError(String(e instanceof Error ? e.message : e));
    } finally {
      setAiBusy(false);
    }
  };

  // 批量分析当前筛选下的存疑文件（B 类，最多 50 个，避免一次传太多）
  const analyzeBatch = async () => {
    if (!scanId) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const r = await api.queryFiles({
        scan_id: scanId,
        needs_ai: true,
        sort: "size_desc",
        page: 0,
        page_size: 50,
      });
      if (r.items.length === 0) {
        setAiError("没有存疑文件需要分析");
        setAiBusy(false);
        return;
      }
      const res = await api.aiAnalyze(r.items.map((f) => f.path), false);
      if (res.ok) {
        const map: Record<string, AiFileResult> = {};
        for (const it of res.items) {
          map[it.path] = it;
          aiHandled.current.add(it.path);
        }
        setAiResults((prev) => ({ ...prev, ...map }));
        setNeedsAiCount((c) => Math.max(0, c - res.items.length));
        toast.push({ kind: "ok", message: `AI 已分析 ${res.items.length} 个存疑文件` });
      } else {
        setAiError(res.message || "AI 分析失败");
      }
    } catch (e) {
      setAiError(String(e instanceof Error ? e.message : e));
    } finally {
      setAiBusy(false);
    }
  };

  // F3：全选当前筛选下的全部文件（后端按相同筛选返回全部 path）
  const selectAllFiltered = async () => {
    if (!scanId || selectBusy) return;
    setSelectBusy(true);
    setAiError(null);
    try {
      const r = await api.selectAllPaths({
        scan_id: scanId,
        category: category || undefined,
        keyword: keyword || undefined,
        recommendation: recommendation || undefined,
        min_size: largeOnly ? largeBytes : 0,
        needs_ai: needsAiOnly ? true : undefined,
        sort: sort,
      });
      setSelectedMany(r.paths, true);
      toast.push({ kind: "ok", message: `已全选 ${r.count} 个文件` });
    } catch (e) {
      setAiError(String(e instanceof Error ? e.message : e));
    } finally {
      setSelectBusy(false);
    }
  };

  // F3：快捷勾选（追加到现有选择）
  const quickSelect = async (filter: Partial<FileQueryPayload>) => {
    if (!scanId || selectBusy) return;
    setSelectBusy(true);
    setAiError(null);
    try {
      const r = await api.selectAllPaths({
        scan_id: scanId,
        category: category || undefined,
        keyword: keyword || undefined,
        recommendation: (filter.recommendation ?? recommendation) || undefined,
        min_size: filter.min_size ?? (largeOnly ? largeBytes : 0),
        needs_ai: (filter.needs_ai ?? (needsAiOnly ? true : undefined)),
        sort: sort,
      });
      setSelectedMany(r.paths, true);
      toast.push({ kind: "ok", message: `已勾选 ${r.count} 个文件` });
    } catch (e) {
      setAiError(String(e instanceof Error ? e.message : e));
    } finally {
      setSelectBusy(false);
    }
  };

  // F4：单行移到回收站
  const deleteSingle = (path: string) => {
    clearSelection();
    setSelected(path, true);
    setConfirmOpen(true);
  };

  // F1：表头全选（已全部选中→清空可视；否则全选当前筛选全部）
  const onHeaderToggle = () => {
    if (allVisible) {
      clearSelection();
    } else {
      selectAllFiltered();
    }
  };

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - ROW * 4;
    if (nearBottom && items.length < total && !loading) {
      load(page + 1, true);
    }
  }, [items.length, total, loading, page, load]);

  const startIdx = Math.max(0, Math.floor(scrollTop / ROW) - OVERS);
  // 视口高度取自真实容器，不再写死 560：容器高度会随窗口自适应（CSS 里是 min(540px, 100vh-…)）
  const viewH = listRef.current?.clientHeight || 540;
  const endIdx = Math.min(items.length, Math.ceil((scrollTop + viewH) / ROW) + OVERS);
  const slice = items.slice(startIdx, endIdx);
  const offsetY = startIdx * ROW;

  const selectedPaths = Array.from(selected);
  const selectedBytes = items.filter((f) => selected.has(f.path)).reduce((s, f) => s + f.size, 0);
  const someSelected = selected.size > 0;
  const selectedCount = selected.size;
  const loadedSelected = items.filter((f) => selected.has(f.path)).length;

  // F1：表头全选三态（全选当前筛选全部 / 清空）
  const allVisible = slice.length > 0 && slice.every((r) => r.is_locked === 1 || selected.has(r.path));
  const someVisible = slice.some((r) => selected.has(r.path));
  const headerIndeterminate = someVisible && !allVisible;
  const headerRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = headerIndeterminate;
  }, [headerIndeterminate, slice.length]);

  const activeFiltersCount = (category ? 1 : 0) + (recommendation ? 1 : 0) + (largeOnly ? 1 : 0) + (needsAiOnly ? 1 : 0) + (keyword ? 1 : 0);

  return (
    <div className="panel file-panel animate-in">
      <div className="file-toolbar">
        <div className="toolbar">
          <select aria-label="文件分类" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">全部分类</option>
            {Object.entries(CATEGORY_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select aria-label="删除建议" value={recommendation} onChange={(e) => setRecommendation(e.target.value)}>
            <option value="">全部建议</option>
            <option value="recommend">推荐删除</option>
            <option value="caution">谨慎删除</option>
            <option value="keep">建议保留</option>
            <option value="system">系统必留</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="size_desc">大小 ↓</option>
            <option value="size_asc">大小 ↑</option>
            <option value="recommend_desc">删除建议优先</option>
            <option value="mtime_desc">修改时间 ↓</option>
            <option value="path_asc">路径</option>
          </select>
          <input className="search" placeholder="搜索路径 / 用途 / 软件…" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <label className="option-line" style={{ margin: 0, minWidth: 110 }}>
            <input type="checkbox" checked={largeOnly} onChange={(e) => setLargeOnly(e.target.checked)} />
            <span className="muted" style={{ fontSize: 12 }}>仅看 &gt;{settings.largeFileMb}MiB</span>
          </label>
          <label className="option-line" style={{ margin: 0, minWidth: 110 }}>
            <input type="checkbox" checked={needsAiOnly} onChange={(e) => setNeedsAiOnly(e.target.checked)} />
            <span className="muted" style={{ fontSize: 12 }}>仅看存疑文件</span>
          </label>
          <span className="toolbar-sep" />
          <button className="btn small" onClick={() => quickSelect({ recommendation: "recommend" })} disabled={selectBusy || !scanId} title="勾选当前筛选下所有「推荐删除」文件">
            勾选推荐
          </button>
          <button className="btn small" onClick={selectAllFiltered} disabled={selectBusy || !scanId} title="全选当前筛选结果的全部文件（不区分大小页）">
            {selectBusy ? "选取中…" : "全选筛选结果"}
          </button>
          <button className="btn small ghost" onClick={clearSelection} disabled={!someSelected}>清空</button>
          <span className="toolbar-total">{total.toLocaleString()} 个文件</span>
          <div className="toolbar-spacer" />
          <button className="btn small" onClick={analyzeBatch} disabled={aiBusy || !scanId} title="对扫描出的存疑文件批量调用 AI 分析（只传元信息）">
            <Icon name="info" size={13} /> {aiBusy ? "AI 分析中…" : `AI 分析存疑文件`}
            {needsAiCount > 0 && <span className="badge badge-warn ai-count-badge">{needsAiCount}</span>}
          </button>
          <button className="btn small" onClick={() => load(0, false)} disabled={loading}>刷新</button>
          {activeFiltersCount > 0 && (
            <button className="btn small ghost" onClick={() => { setCategory(""); setRecommendation(""); setLargeOnly(false); setNeedsAiOnly(false); setKeyword(""); }}>
              清除筛选
            </button>
          )}
        </div>
        {aiBusy && <div className="ai-progress"><i /></div>}
        {aiError && <div className="notice error" style={{ margin: "8px 0 0" }}>{aiError}</div>}
      </div>

<div className="file-table-scroll" role="table" aria-label="扫描文件明细" aria-rowcount={total + 1}><div className={`file-list-head ${settings.autoPreview ? "" : "no-preview"}`} role="row">
        <span role="columnheader" className="col-check"><input ref={headerRef} aria-busy={selectBusy || undefined} type="checkbox" disabled={loading || selectBusy || !items.length} aria-label="全选当前筛选下可清理文件；已全选时清空全部选择" aria-checked={headerIndeterminate ? "mixed" : allVisible && someVisible} checked={allVisible && someVisible} onChange={onHeaderToggle} title="全选当前筛选全部；再次点击清空全部选择" /></span>
        <span role="columnheader" className="col-name">文件</span>
        <span role="columnheader" className="col-size">大小</span>
        {settings.autoPreview && <><span role="columnheader" className="col-purpose">用途（深度解析）</span><span role="columnheader" className="col-owner">所属软件</span></>}
        <span role="columnheader" className="col-rec">删除建议</span>
        <span role="columnheader" className="col-mtime">最后修改</span>
        <span role="columnheader" className="col-path">路径</span>
        <span role="columnheader" className="col-actions" />
      </div>

<div className="file-list-body" ref={listRef} onScroll={onScroll}>
        <div className="virtual-spacer" style={{ height: offsetY }} />
        {slice.map((rec, rowIndex) => {
          const locked = rec.is_locked === 1;
          const isSelected = selected.has(rec.path);
          const isLarge = rec.size >= largeBytes;
          const needsAi = rec.needs_ai === 1 && !aiHandled.current.has(rec.path);
          const aiRes = aiResults[rec.path];
          const aiDone = Boolean(aiRes) || aiHandled.current.has(rec.path);
          const cat = CATEGORY_META[rec.category] ?? { label: rec.category, color: "var(--cat-unknown)" };
          const recMeta = RECOMMENDATION_META[rec.recommendation] ?? { label: rec.recommendation, cls: "badge-muted" };
          const riskMeta = RISK_META[rec.risk] ?? { label: rec.risk, cls: "badge-muted" };
          const rowClass = [
            "file-row",
            settings.autoPreview ? "" : "no-preview",
            locked ? "row-locked" : "",
            isLarge ? "row-large" : "",
            isSelected ? "row-selected" : "",
          ].join(" ");
          return (
            <div className={rowClass} role="row" aria-rowindex={startIdx + rowIndex + 2} key={rec.id} style={{ height: ROW }}>
              <span role="cell" className="col-check">
                <input type="checkbox" aria-label={(locked ? "系统保护，无法选择：" : "选择文件：") + baseName(rec.path)} checked={isSelected} disabled={locked} onChange={(e) => setSelected(rec.path, e.target.checked)} />
              </span>
              <span role="cell" className="col-name" title={rec.path}>
                {baseName(rec.path)}
                <span className="file-tags">
                  {locked && <span className="tag danger" title="系统保护路径，不可删除"><Icon name="lock" size={12} />系统</span>}
                  {isLarge && <span className="tag warn" title={`大于 ${settings.largeFileMb}MiB`}><Icon name="disk" size={12} />大</span>}
                  {needsAi && <span className="tag muted" title="用途未识别，待 AI 解析"><Icon name="info" size={12} />存疑</span>}
                  {aiDone && <span className="tag ok" title="已完成深度解析"><Icon name="check" size={12} />已解析</span>}
                </span>
              </span>
              <span className="col-size num">{formatBytes(rec.size)}</span>
              {settings.autoPreview && (
                <span role="cell" className="col-purpose" title={aiRes ? (aiRes.detail || aiRes.purpose) : (rec.recommendation_reason || rec.purpose)}>
                  {aiRes ? aiRes.purpose : rec.purpose}
                  <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>({cat.label})</span>
                  {!locked && !aiRes && !aiHandled.current.has(rec.path) && (
                    <button
                      className="ai-mini"
                      onClick={(e) => { e.stopPropagation(); analyzeSingle(rec); }}
                      disabled={aiBusy}
                      title="AI 分析此文件（只传元信息，不上传内容）"
                    >
                      <Icon name="info" size={11} />
                    </button>
                  )}
                </span>
              )}
              {settings.autoPreview && (
                <span role="cell" className="col-owner" title={aiRes ? (aiRes.source || rec.owner) : rec.owner}>
                  {aiRes ? (aiRes.source || rec.owner) : rec.owner}
                </span>
              )}
              <span role="cell" className="col-rec">
                <span className={`tag ${toneOf(recMeta.cls).tone}`} title={rec.recommendation_reason}>
                  <Icon name={toneOf(recMeta.cls).icon} size={13} />{recMeta.label}
                </span>
                <span className={`tag ${toneOf(riskMeta.cls).tone}`} style={{ marginLeft: 10 }}>
                  <Icon name={toneOf(riskMeta.cls).icon} size={13} />{riskMeta.label}
                </span>
              </span>
              <span role="cell" className="col-mtime">{formatTime(rec.mtime)}</span>
              <span role="cell" className="col-path" title={rec.path}>{dirName(rec.path)}</span>
              <span role="cell" className="col-actions">
                {!locked && (
                  <>
                    <button className="row-act" title="在资源管理器中打开所在位置" onClick={() => api.reveal(rec.path).catch(() => toast.push({ kind: "error", message: "无法打开位置" }))}>
                      <Icon name="folder" size={13} />
                    </button>
                    <button className="row-act danger" title="单行移到回收站" onClick={() => deleteSingle(rec.path)}>
                      <Icon name="trash" size={13} />
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
        <div style={{ height: Math.max(0, items.length * ROW - offsetY - slice.length * ROW) }} />
        {loading && items.length === 0 && (
          <div className="file-skeleton">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton file-skel-row" />
            ))}
          </div>
        )}
        {loading && items.length > 0 && <div className="loading-row">正在加载更多…</div>}
        {!loading && !loadError && items.length === 0 && (
          <div className="empty-row">
            {activeFiltersCount > 0 ? "没有匹配的文件，试试清除筛选条件" : "该盘符暂无文件记录，请先完成扫描"}
          </div>
        )}
      </div>

      </div>
      {loadError && <div className="notice error" role="alert">文件列表读取失败：{loadError}<button type="button" className="btn small" onClick={() => void load(lastQuery.current.page, lastQuery.current.append)}>重试读取</button></div>}

      <div className="file-bottom-bar">
        <span className="fbb-summary">
          已选 <b>{selectedCount}</b> 个 · {loadedSelected === selectedCount ? "合计" : "已加载 " + loadedSelected + " 项大小"} <b>{formatBytes(selectedBytes)}</b>{loadedSelected !== selectedCount && <span className="selection-note">其余选项大小未读取；确认框列出全部路径。</span>}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>筛选共 {total.toLocaleString()} 个 · 系统文件已自动排除</span>
        <div className="fbb-spacer" />
        <button className="btn ghost" disabled={!someSelected} onClick={clearSelection}>取消选择</button>
        <button className="btn danger" disabled={!someSelected} onClick={() => setConfirmOpen(true)}>
          移到回收站 ({selectedCount})
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        paths={selectedPaths}
        onClose={() => setConfirmOpen(false)}
        onDone={async () => {
          clearSelection();
          await refreshStatistics();
          await load(0, false);
        }}
      />
    </div>
  );
}
