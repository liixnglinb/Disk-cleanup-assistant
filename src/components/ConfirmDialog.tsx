import React, { useState } from "react";
import { api } from "../api/client";
import { useToast } from "../store/ToastContext";
import { loadSettings } from "./SettingsPanel";
import type { DeleteResult } from "../types";
import { baseName, formatBytes } from "../utils/format";
import Icon from "./icons";

interface Props {
  open: boolean;
  paths: string[];
  onClose: () => void;
  onDone: () => Promise<void>;
}

const SHOW_MAX = 5;

export default function ConfirmDialog({ open, paths, onClose, onDone }: Props) {
  const toast = useToast();
  const [permanent, setPermanent] = useState(false);
  const [permanentAck, setPermanentAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeleteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const settings = loadSettings();
  const permanentAllowed = settings.allowPermanentDelete;
  const canConfirm = !(permanent && !permanentAck) && paths.length > 0 && !busy;

  const close = () => {
    setResult(null);
    setError(null);
    setPermanentAck(false);
    setPermanent(false);
    onClose();
  };

  // 清理报告视图（删除完成后展示）
  if (result) {
    return (
      <div className="modal-mask" onClick={close}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-icon ok-icon"><Icon name="check" size={22} /></div>
          <h3>清理完成</h3>
          <div className="report-stats">
            <div className="report-stat"><b className="num">{result.ok.length}</b><span>成功删除</span></div>
            <div className="report-stat"><b className="num">{formatBytes(result.freed_bytes)}</b><span>释放空间</span></div>
            <div className={`report-stat ${result.failed.length > 0 ? "has-fail" : ""}`}><b className="num">{result.failed.length}</b><span>失败</span></div>
          </div>
          {result.failed.length > 0 && (
            <div className="report-failed">
              <div className="rf-title">失败明细</div>
              {result.failed.slice(0, SHOW_MAX).map((f) => (
                <div className="rf-row" key={f.path} title={f.path}>
                  <span className="rf-name">{baseName(f.path)}</span>
                  <span className="rf-err">{f.error}</span>
                </div>
              ))}
              {result.failed.length > SHOW_MAX && (
                <div className="dim" style={{ padding: "4px 8px", fontSize: 12 }}>… 还有 {result.failed.length - SHOW_MAX} 项失败</div>
              )}
            </div>
          )}
          <div className="modal-actions">
            <button className="btn primary" onClick={close}>完成</button>
          </div>
        </div>
      </div>
    );
  }

  const doDelete = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // 安全红线：默认回收站；永久删除需额外勾选确认（后端仍默认拒绝危险路径）
      const res = await api.deleteFiles(paths, permanent, settings.restorePointOnDelete);
      setResult(res);
      toast.push({ kind: "ok", message: `已删除 ${res.ok.length} 个文件，释放 ${formatBytes(res.freed_bytes)}` });
      await onDone();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon warn-icon"><Icon name="alert" size={22} /></div>
        <h3>确认删除 {paths.length} 个文件？</h3>
        <p className="modal-desc">
          {settings.showSafeCleanHint ? (
            <>这些文件将被移到回收站，可在 <b>30 天内恢复</b>。系统保护文件已自动排除。</>
          ) : (
            <>这些文件将被移到回收站（可在回收站恢复）。</>
          )}
        </p>
        <div className="modal-scroll">
          {paths.slice(0, SHOW_MAX).map((p) => (
            <div className="modal-file" key={p} title={p}>
              <span className="mf-name">{baseName(p)}</span>
            </div>
          ))}
          {paths.length > SHOW_MAX && <div className="dim" style={{ padding: "5px 8px", fontSize: 12 }}>… 还有 {paths.length - SHOW_MAX} 个文件</div>}
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

        {error && <div className="notice error">{error}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={close} disabled={busy}>取消</button>
          <button className="btn danger" onClick={doDelete} disabled={!canConfirm}>
            {busy ? "处理中…" : permanent ? "确认永久删除" : `移到回收站 (${paths.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
