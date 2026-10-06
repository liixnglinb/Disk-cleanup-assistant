import React, { useEffect, useRef, useState } from "react";
import Icon from "./icons";
import ConfirmDialog from "./ConfirmDialog";
import { useUpdater } from "../store/updater";
import { useToast } from "../store/ToastContext";
import { errMsg } from "../utils/errMsg";

/**
 * 浮动更新胶囊（方案二阶段三）。
 *
 * 为什么从标题栏搬到右下角：
 * 标题栏是窗口拖拽区 + 系统按钮避让区，在那里放一个会变的方块，
 * 既与"品牌 + 当前工作区名"的静态信息抢注意力，又容易在用户拖窗口时误点。
 * 右下角是全局但低干扰的位置，且天然与 Toast 同层，语义一致（都是"系统级通知"）。
 *
 * 保留 updater store 的全部状态机语义（keepRunningPhase / canClobberError），
 * 本组件只负责呈现：idle / checking / latest / error 四态不渲染任何东西，
 * 避免一个"没有更新"的胶囊长期占着屏幕右下角。
 */
export default function UpdateBox() {
  const { state, install } = useUpdater();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // 展开状态下点击别处 / Esc 收起。胶囊在角落，不做这个的话
  // 它会盖住右下角内容（软件卡网格的最后一行正好在那儿）。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (state.phase === "idle" || state.phase === "checking" || state.phase === "latest" || state.phase === "error") {
    return null;
  }

  const pct = Math.max(0, Math.min(100, Math.round(state.percent ?? 0)));
  const downloading = state.phase === "downloading";
  const ready = state.phase === "ready";

  return (
    <>
      <div className={`update-capsule ${open ? "open" : ""} ${ready ? "is-ready" : ""}`} ref={wrapRef}>
        {/* 胶囊本体：点击展开阅读面板；ready 时点击直接进安装确认 */}
        <button
          className="update-capsule-btn"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={ready ? "更新已下载，点击查看更新说明并安装" : downloading ? `正在下载更新 ${pct}%，点击查看详情` : "发现新版本，点击查看更新说明"}
        >
          <span
            className="update-capsule-ring"
            style={downloading ? { background: `conic-gradient(var(--primary) ${pct * 3.6}deg, var(--surface-hover) 0deg)` } : undefined}
            aria-hidden="true"
          >
            <span className="update-capsule-ring-inner">
              {ready ? <Icon name="check" size={15} /> : downloading ? <span className="num">{pct}</span> : <Icon name="refresh" size={15} />}
            </span>
          </span>
          <span className="update-capsule-text">
            <b>{ready ? "更新已就绪" : downloading ? `正在下载 ${pct}%` : `发现新版本 v${state.latest ?? ""}`}</b>
            <em>{ready ? "点击查看说明并安装" : "点击查看更新说明"}</em>
          </span>
          {/* 三种相位都能展开阅读面板，所以箭头常驻；朝向由 CSS 的
              .update-capsule.open .update-capsule-caret 旋转，这里不需要分支 */}
          <span className="update-capsule-caret" aria-hidden="true"><Icon name="chevron-right" size={13} /></span>
        </button>

        {/* 阅读面板：悬停/点击展开的 Release Notes。
            用 max-height + opacity 过渡而非 display 切换，展开过程可见。 */}
        <div className="update-capsule-panel" role="dialog" aria-label="更新说明" hidden={!open}>
          <div className="update-panel-head">
            <strong>v{state.latest}</strong>
            {state.releaseDate ? <span className="dim">{state.releaseDate.slice(0, 10)}</span> : null}
          </div>
          {state.releaseNotes
            ? <div className="update-panel-body">{state.releaseNotes}</div>
            : <div className="update-panel-body dim">本次发布未提供更新说明。</div>}
          <div className="update-panel-foot">
            <span className="update-panel-status">
              {downloading
                ? `正在下载 ${pct}%`
                : ready
                  ? `当前 v${state.current ?? "?"} → v${state.latest}`
                  : state.current ? `当前版本 v${state.current}` : "正在准备下载…"}
            </span>
            {/* ready 态的安装入口放在说明面板里：点胶囊先看内容，再决定要不要重启。
                真正的破坏性一步仍由确认框兜底。 */}
            {ready && (
              <button className="btn primary small" onClick={() => { setOpen(false); setAsking(true); }}>
                更新并重启
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={asking}
        title="是否现在更新并重启？"
        // 完整说明在胶囊的阅读面板里；确认框只留一条短摘要 —— 否则一个
        // "要不要重启"的是/非框会被撑成整屏高的文本墙，反而没人读。
        body={"将安装 v" + state.latest + " 并立即重启软件。当前未保存的操作会丢失。"
          + (state.releaseNotes ? "\n\n" + state.releaseNotes.slice(0, 240) + (state.releaseNotes.length > 240 ? "…" : "") : "")}
        confirmText="更新并重启"
        onCancel={() => setAsking(false)}
        onConfirm={async () => {
          setAsking(false);
          try {
            await install();
          } catch (e) {
            // 安装失败时胶囊本身不会变状态（error 相位下它直接不渲染），
            // toast 是用户唯一能看到的反馈。
            toast.push({ kind: "error", message: "安装失败：" + errMsg(e) });
          }
        }}
      />
    </>
  );
}
