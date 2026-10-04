import React from "react";
import Icon from "./icons";
import { SECTIONS, useWorkspace } from "../store/workspace";

/**
 * 48px 极简图标导航（方案二要求）。
 * 标签不常驻：靠 CSS 的 ::after + data-label 在悬停/聚焦时浮出 tooltip，
 * 避免 48px 宽度下文字换行或截断。
 */
export default function NavRail() {
  const { section, setSection } = useWorkspace();
  return (
    <nav className="nav-rail" aria-label="主导航">
      {SECTIONS.map((s) => (
        <button
          key={s.key}
          className={`rail-item ${section === s.key ? "active" : ""}`}
          onClick={() => setSection(s.key)}
          data-label={s.label}
          title={s.label}
          aria-current={section === s.key ? "page" : undefined}
        >
          <Icon name={s.icon} size={20} />
          <span className="sr-only">{s.label}</span>
        </button>
      ))}
    </nav>
  );
}
