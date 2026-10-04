import React, { useRef } from "react";
import Icon from "./icons";
import { useModalFocus } from "../hooks/useModalFocus";

interface Props {
  open: boolean;
  title: string;
  desc?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  open,
  title,
  desc,
  confirmText = "确认",
  cancelText = "取消",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef, open, onClose, busy);
  if (!open) return null;

  return (
    <div className="modal-mask" onClick={() => !busy && onClose()}>
      <div className={`modal ${danger ? "is-danger" : ""}`} ref={dialogRef} role="alertdialog" aria-modal="true" aria-label={title} aria-busy={busy} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className={`modal-icon ${danger ? "danger-icon" : "warn-icon"}`}>
          <Icon name="alert" size={22} />
        </div>
        <h3>{title}</h3>
        {desc && <p className="modal-desc">{desc}</p>}
        <div className="modal-actions">
          <button type="button" data-safe-focus className="btn" onClick={onClose} disabled={busy}>{cancelText}</button>
          <button className={`btn ${danger ? "danger" : "primary"}`} onClick={onConfirm} disabled={busy}>
            {busy ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
