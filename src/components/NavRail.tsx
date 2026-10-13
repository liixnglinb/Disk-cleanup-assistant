import React from "react";
import Icon from "./icons";
import { SECTIONS, useWorkspace } from "../store/workspace";
import { useTheme } from "../hooks/useTheme";

/**
 * 左侧导航：v10 三段式（品牌块 / 分组导航 / 底部工具块）。
 *
 * 为什么从"图标 + 挤在一起的标签"改成三段式：
 *   1. 品牌搬到侧栏后，标题栏只剩扫描控制，窗口 chrome 干净了；
 *   2. 分组标题给出层级线索（"工作区"是一组、"工具"是另一组）；
 *   3. 目录百科 / 删除日志 / 主题切换原来挂在标题栏右侧，是三个无分组、
 *      无文字的图标按钮 —— 现在它们在侧栏底部有名字、有位置。
 *
 * 底部两块都用 .rail-item（与导航项同源）：同一套 hover / active 语义，
 * 不引入第二套按钮样式。
 */
export default function NavRail() {
  const { section, setSection, drawer, openDrawer } = useWorkspace();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="nav-rail" aria-label="主导航">
      {/* 第一段：品牌块。固定不滚。 */}
      <div className="rail-brand">
        <span className="rail-logo"><Icon name="eraser" size={18} /></span>
        <span className="rail-brand-text">
          <b>磁盘清理助手</b>
          <em>v{__APP_VERSION__}</em>
        </span>
      </div>

      {/* 第二段：分组导航。flex:1 吃掉剩余高度，底部块才能贴住底缘。 */}
      <div className="rail-nav">
        <span className="rail-group-title">工作区</span>
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`rail-item ${section === s.key ? "active" : ""}`}
            onClick={() => setSection(s.key)}
            aria-current={section === s.key ? "page" : undefined}
          >
            <Icon name={s.icon} size={17} />
            <span className="rail-label">{s.label}</span>
          </button>
        ))}
      </div>

      {/* 第三段：常驻工具。一条发丝线与导航分开。 */}
      <div className="rail-foot">
        <span className="rail-group-title">工具</span>
        <button
          type="button"
          className={`rail-item ${drawer === "kb" ? "on" : ""}`}
          onClick={() => openDrawer("kb")}
          aria-label="打开目录百科"
        >
          <Icon name="book" size={17} />
          <span className="rail-label">目录百科</span>
        </button>
        <button
          type="button"
          className={`rail-item ${drawer === "logs" ? "on" : ""}`}
          onClick={() => openDrawer("logs")}
          aria-label="打开删除日志"
        >
          <Icon name="log" size={17} />
          <span className="rail-label">删除日志</span>
        </button>
        <button
          type="button"
          className="rail-item"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
          <span className="rail-label">{theme === "dark" ? "浅色主题" : "深色主题"}</span>
        </button>
      </div>
    </nav>
  );
}
