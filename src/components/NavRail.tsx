import React from "react";
import Icon from "./icons";
import { SECTIONS, useWorkspace } from "../store/workspace";

/**
 * 左侧导航：图标 + 常驻文字标签。
 * 一级导航不靠悬停 tooltip 才知道去哪，标签直接摆在图标侧面。
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
          aria-current={section === s.key ? "page" : undefined}
        >
          <Icon name={s.icon} size={20} />
          <span className="rail-label">{s.label}</span>
        </button>
      ))}
    </nav>
  );
}
