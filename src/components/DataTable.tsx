import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * 通用数据网格外壳（方案二阶段二）。
 *
 * 抽出来的理由：文件列表此前把「虚拟滚动 + Sticky 表头」两件事写死在
 * FileTable.tsx 里，清理工作区的三个维度都要用到。这里只抽**与业务无关的网格
 * 机制**；列内容与行内容仍由调用方 render —— 缓存是「目录聚合」、重复是
 * 「组内单选保留」、文件是「平铺多选」，三者的行模型差异大于共同点，
 * 强行统一成一套数据结构得不偿失。
 *
 * 性能约束（240 万文件量级，改动时必须守住）：
 *   1. 只渲染可视区 ± OVERS 行，其余用上下两块 spacer 撑高度；
 *   2. 行高固定（rowHeight），可视行数可由 scrollTop 直接算出，无需测量 DOM。
 *
 * 分页由调用方决定（FileTable 用定长分页窗口，items 只有一页），本组件不再
 * 关心触底加载 —— 追加式无限滚动会让 spacer 高度随页数无限增长，用户滚不到头。
 */

const OVERS = 8;

export interface DataTableColumn {
  /** 与调用方 grid 模板顺序一一对应；同时作为 col-xxx 的类名后缀 */
  key: string;
  label: React.ReactNode;
  /** 表头额外属性（排序按钮、aria-sort 等） */
  headExtra?: React.HTMLAttributes<HTMLSpanElement>;
}

export interface DataTableRenderContext {
  /** 当前切片首行在完整 items 中的下标，用于 aria-rowindex */
  startIndex: number;
  /** 可视区高度，未挂载时回退 540 */
  viewportHeight: number;
}

interface Props<T> {
  items: T[];
  /** 稳定行 key */
  rowKey: (item: T, index: number) => string;
  columns: DataTableColumn[];
  /** 变体类名（如 no-preview），用于切换列模板 */
  variant?: string;
  rowHeight?: number;
  /** 表头最左侧的勾选槽；不传则不渲染该列 */
  headCheckbox?: React.ReactNode;
  loading?: boolean;
  /** 首屏加载骨架 */
  skeleton?: React.ReactNode;
  /** 空态 */
  empty?: React.ReactNode;
  /**
   * 变化时把滚动位置复位到顶部并清空可视切片。
   * 传筛选条件的组合串即可（调用方已有这些 state）。
   * 不做这件事的话，换筛选后用户会停在新结果的中间位置，
   * 且 offsetY 还是旧列表算出来的，spacer 高度会把行推到视口外。
   */
  resetKey?: string;
  /** 行渲染。调用方需自行铺 role="row" / role="cell" 与行容器样式 */
  renderRow: (item: T, absoluteIndex: number, ctx: DataTableRenderContext) => React.ReactNode;
  ariaLabel: string;
  /** 完整行数，写入 aria-rowcount 让读屏器能播报规模（可能远大于已加载数） */
  totalCount?: number;
}

export default function DataTable<T>({
  items,
  rowKey,
  columns,
  variant,
  rowHeight = 44,
  headCheckbox,
  loading,
  skeleton,
  empty,
  resetKey,
  renderRow,
  ariaLabel,
  totalCount,
}: Props<T>) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  // 表头高度放进 state：ref 读取不会触发重渲染，首帧拿不到值会导致
  // 上方 spacer 少算一截表头高度（表现为第一行被表头压住）。
  const [headH, setHeadH] = useState(0);
  useEffect(() => {
    if (headRef.current) setHeadH(headRef.current.offsetHeight);
  }, []);
  const onScroll = useCallback(() => {
    const el = bodyRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, []);

  // 筛选变化 → 回到顶部。必须同步清 scrollTop，否则 spacer 高度与实际滚动位置不匹配。
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [resetKey]);

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERS);
  // 视口高度取自真实容器：容器高度随窗口自适应，不能写死
  const viewportHeight = bodyRef.current?.clientHeight || 540;
  const endIndex = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERS);
  const slice = items.slice(startIndex, endIndex);
  // 表头在滚动容器内且 sticky，占据 scrollTop 的前 headH。
  // spacer 高度必须扣掉它，否则行会被表头盖住一截。
  const offsetY = Math.max(0, startIndex * rowHeight - headH);
  const tailHeight = Math.max(0, items.length * rowHeight - (startIndex * rowHeight) - slice.length * rowHeight);

  const ctx: DataTableRenderContext = { startIndex, viewportHeight };

  return (
    <div className="data-table-shell" role="table" aria-label={ariaLabel} aria-rowcount={(totalCount ?? items.length) + 1}>
      <div className="data-grid-body" ref={bodyRef} onScroll={onScroll}>
        {/* Sticky 表头：必须在滚动容器内，position:sticky 才会相对该容器吸附 */}
        <div ref={headRef} className={`data-grid data-grid-head${variant ? " " + variant : ""}`} role="row">
          {headCheckbox && <span role="columnheader" className="col-check">{headCheckbox}</span>}
          {columns.map((c) => (
            <span key={c.key} role="columnheader" {...c.headExtra}>
              {c.label}
            </span>
          ))}
        </div>
        <div style={{ height: offsetY }} aria-hidden="true" />
        {slice.map((item, i) => renderRow(item, startIndex + i, ctx))}
        <div style={{ height: tailHeight }} aria-hidden="true" />
        {loading && items.length === 0 && skeleton}
        {loading && items.length > 0 && <div className="loading-row">正在加载更多…</div>}
        {!loading && items.length === 0 && (empty ?? <div className="empty-row">暂无数据</div>)}
      </div>
    </div>
  );
}
