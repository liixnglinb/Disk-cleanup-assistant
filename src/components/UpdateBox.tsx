import React, { useState } from "react";
import Icon from "./icons";
import ConfirmDialog from "./ConfirmDialog";
import { useUpdater } from "../store/updater";
import { useToast } from "../store/ToastContext";

export default function UpdateBox() {
  const { state, install } = useUpdater();
  const toast = useToast();
  const [hover, setHover] = useState(false);
  const [asking, setAsking] = useState(false);

  if (state.phase === "idle" || state.phase === "checking" || state.phase === "latest" || state.phase === "error") {
    return null;
  }

  const pct = Math.max(0, Math.min(100, Math.round(state.percent ?? 0)));
  const downloading = state.phase === "downloading";
  const ready = state.phase === "ready";

  return (
    <div
      className="update-box-wrap no-drag"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        className={`update-box ${downloading ? "is-downloading" : ""} ${ready ? "is-ready" : ""}`}
        style={downloading ? { background: `conic-gradient(var(--primary) ${pct * 3.6}deg, var(--surface-hover) 0deg)` } : undefined}
        onClick={() => { if (ready) setAsking(true); }}
        aria-label={ready ? "更新已下载，点击安装" : downloading ? `正在下载更新 ${pct}%` : "发现新版本"}
      >
        <span className="update-box-inner">
          {ready ? <Icon name="check" size={14} /> : downloading ? `${pct}` : `v${state.latest ?? ""}`}
        </span>
      </button>

      {hover && (
        <div className="update-pop" role="tooltip">
          <div className="update-pop-head">
            <strong>v{state.latest}</strong>
            {state.releaseDate ? <span className="dim">{state.releaseDate.slice(0, 10)}</span> : null}
          </div>
          {state.releaseNotes ? <div className="update-pop-body">{state.releaseNotes}</div> : <div className="update-pop-body dim">发布说明未提供。</div>}
          <div className="update-pop-foot">
            {downloading ? `正在下载 ${pct}%` : ready ? "点击安装并重启" : "正在准备下载…"}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={asking}
        title="是否现在更新并重启？"
        body={`将安装 v${state.latest} 并立即重启软件。当前未保存的操作会丢失。`}
        confirmText="更新并重启"
        onCancel={() => setAsking(false)}
        onConfirm={async () => {
          setAsking(false);
          try {
            await install();
          } catch (e) {
            // 安装失败时方块本身不会变状态（error 相位下它直接不渲染），
            // toast 是用户唯一能看到的反馈。
            toast.push({ kind: "error", message: "安装失败：" + String(e instanceof Error ? e.message : e) });
          }
        }}
      />
    </div>
  );
}
