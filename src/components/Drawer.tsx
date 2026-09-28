import React, { useEffect } from "react";
import Icon from "./icons";

interface Props {
  open: boolean;
  title: string;
  icon?: "log" | "book";
  onClose: () => void;
  children: React.ReactNode;
}

/** 右侧抽屉：承载"不该占顶级入口"的次级信息（删除日志、目录百科）。z-index 90，低于弹窗 100。 */
export default function Drawer({ open, title, icon = "book", onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-mask" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <header className="drawer-head">
          <span className="drawer-title"><Icon name={icon} size={15} /> {title}</span>
          <button className="icon-btn" onClick={onClose} title="关闭（Esc）"><Icon name="x" size={15} /></button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
