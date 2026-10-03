import React, { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useToast } from "../store/ToastContext";
import { useSettings } from "../store/settings";
import type { DeleteResult } from "../types";
import { baseName, formatBytes } from "../utils/format";
import Icon from "./icons";
import { useModalFocus } from "../hooks/useModalFocus";

/**
 * 通用确认模式（可选）：传入 title 即走通用文案，不涉及删除流程，
 * 删除专用 props（paths/onClose/onDone）与永久删除选项都不参与渲染。
 */
export interface GenericConfirmProps {
  open?: boolean;
  title?: string;
  body?: string;
  confirmText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface Props extends GenericConfirmProps {
  paths?: string[];
  onClose?: () => void;
  onDone?: () => Promise<void>;
}

const SHOW_MAX = 5;

export default function ConfirmDialog({
  open,
  paths = [],
  onClose,
  onDone,
  title,
  body,
  confirmText,
  onConfirm,
  onCancel,
}: Props) {
  const toast = useToast();
  const [permanent, setPermanent] = useState(false);
  const [permanentAck, setPermanentAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeleteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewLimit, setPreviewLimit] = useState(SHOW_MAX);
  const modalRef = useRef<HTMLDivElement>(null);
  // 必须在任何条件 return 之前调用：下面有"通用确认"与"删除确认"两条分支，
  // 把 hook 放到 return 之后会造成渲染间 hooks 数量不一致。
  const settings = useSettings();
  const close = () => {
    if (busy) return;
    setResult(null); setError(null); setPermanentAck(false); setPermanent(false);
    if (title) onCancel?.(); else onClose?.();
  };
  useModalFocus(modalRef, Boolean(open), close, busy);
  useEffect(() => {
    if (!open) { setResult(null); setError(null); setPermanent(false); setPermanentAck(false); setPreviewLimit(SHOW_MAX); }
  }, [open]);
  useEffect(() => {
    if (open && result && !busy) modalRef.current?.querySelector<HTMLElement>('[data-safe-focus]')?.focus({ preventScroll: true });
  }, [open, result, busy]);

  if (!open) return null;

  // 通用确认模式：只有 title/body/onConfirm，不渲染文件清单、永久删除与还原点提示
  if (title) {
    return (
      <div className="modal-mask" onClick={close}>
        <div className="modal" ref={modalRef} role="alertdialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
          <div className="modal-icon"><Icon name="refresh" size={22} /></div>
          <h3>{title}</h3>
          {body && <p className="modal-desc">{body}</p>}
          <div className="modal-actions">
            <button type="button" data-safe-focus className="btn" onClick={close}>取消</button>
            <button className="btn primary" onClick={() => onConfirm?.()}>{confirmText ?? "确定"}</button>
          </div>
        </div>
      </div>
    );
  }

  const permanentAllowed = settings.allowPermanentDelete;
  const canConfirm = !(permanent && (!permanentAllowed || !permanentAck)) && paths.length > 0 && !busy;

  // 清理报告视图（删除完成后展示）
  if (result) {
    return (
      <div className="modal-mask" onClick={close}>
        <div className="modal" ref={modalRef} role="dialog" aria-modal="true" aria-label="清理结果" aria-busy={busy} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
          <div className="modal-icon ok-icon"><Icon name="check" size={22} /></div>
          <h3>{result.failed.length ? result.ok.length ? "部分清理完成" : "本次清理未完成" : "清理完成"}</h3>
          <div className="report-stats" role="status" aria-label="本次清理结果">
            <div className="report-stat"><b className="num">{result.ok.length}</b><span>成功删除</span></div>
            <div className="report-stat"><b className="num">{formatBytes(result.freed_bytes)}</b><span>释放空间</span></div>
            <div className={`report-stat ${result.failed.length > 0 ? "has-fail" : ""}`}><b className="num">{result.failed.length}</b><span>失败</span></div>
          </div>
          {result.restore_point_requested && result.restore_point_created === false && (
            <div className="notice error">
              还原点创建失败（可能需要管理员权限或未开启系统保护），删除操作已继续。
            </div>
          )}
          {result.failed.length > 0 && (
            <div className="report-failed" role="region" aria-label="清理失败明细" tabIndex={0}>
              <div className="rf-title">失败明细</div>
              {result.failed.slice(0, previewLimit).map((f) => (
                <div className="rf-row" key={f.path} title={f.path}>
                  <span className="rf-name">{baseName(f.path)}</span>
                  <span className="mf-path">{f.path}</span>
                  <span className="rf-err">{f.error}</span>
                </div>
              ))}
              {result.failed.length > previewLimit && (
                <button type="button" className="btn small" onClick={() => setPreviewLimit((n) => n + 50)}>继续查看失败项（剩余 {result.failed.length - previewLimit}）</button>
              )}
            </div>
          )}
          {error && <div className="notice error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button type="button" data-safe-focus className="btn primary" disabled={busy} onClick={close}>{busy ? '正在刷新列表…' : '关闭报告'}</button>
          </div>
        </div>
      </div>
    );
  }

  const doDelete = async () => {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // 安全红线：默认回收站；永久删除需额外勾选确认（后端仍默认拒绝危险路径）
      const res = await api.deleteFiles(paths, permanent, settings.restorePointOnDelete);
      setResult(res);
      toast.push({ kind: res.failed.length ? "error" : "ok", message: `成功 ${res.ok.length} 项，失败 ${res.failed.length} 项，实际释放 ${formatBytes(res.freed_bytes)}` });
      try { await onDone?.(); }
      catch { setError("清理请求已完成，但结果列表刷新失败；请关闭报告后重新读取扫描结果。"); }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={close}>
      <div className="modal" ref={modalRef} role="alertdialog" aria-modal="true" aria-label="确认清理文件" aria-busy={busy} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon warn-icon"><Icon name="alert" size={22} /></div>
        <h3>确认删除 {paths.length} 个文件？</h3>
        <p className="modal-desc">
          {settings.showSafeCleanHint ? (
            <>默认移到回收站；回收站被清空后将无法恢复。系统保护文件由后端安全规则拦截。</>
          ) : (
            <>这些文件将被移到回收站（可在回收站恢复）。</>
          )}
        </p>
        <div className="modal-scroll" role="region" aria-label="待清理完整路径" tabIndex={0}>
          {paths.slice(0, previewLimit).map((p) => (
            <div className="modal-file" key={p} title={p}>
              <span className="mf-name">{baseName(p)}</span>
              <span className="mf-path">{p}</span>
            </div>
          ))}
          {paths.length > previewLimit && <button type="button" className="btn small" onClick={() => setPreviewLimit((n) => n + 50)}>继续查看路径（剩余 {paths.length - previewLimit}）</button>}
        </div>

        <div className="modal-adv">
          <label className={`adv-toggle ${permanentAllowed ? "" : "adv-disabled"}`}>
            <input type="checkbox" checked={permanent} disabled={!permanentAllowed} onChange={(e) => setPermanent(e.target.checked)} />
            高级选项：永久删除（不再进回收站）
          </label>
          {!permanentAllowed && (
            <div className="adv-body dim" style={{ fontSize: 12 }}>
              需先在「设置 → 安全设置」中开启「允许永久删除」才能使用。
            </div>
          )}
          {permanent && permanentAllowed && (
            <div className="adv-body">
              <label className="option-line warn">
                <input type="checkbox" checked={permanentAck} onChange={(e) => setPermanentAck(e.target.checked)} />
                我已知晓永久删除无法恢复，并承担风险
              </label>
            </div>
          )}
        </div>

        {error && <div className="notice error" role="alert">{error}</div>}

        <div className="modal-actions">
          <button type="button" data-safe-focus className="btn" onClick={close} disabled={busy}>取消</button>
          <button className="btn danger" onClick={doDelete} disabled={!canConfirm}>
            {busy ? "处理中…" : permanent ? "确认永久删除" : `移到回收站 (${paths.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
