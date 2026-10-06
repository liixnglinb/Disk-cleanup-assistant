import React, { useEffect } from "react";
import Icon from "./icons";
import ScanControl from "./ScanControl";
import { SECTIONS, useWorkspace } from "../store/workspace";
import { useTheme } from "../hooks/useTheme";

export default function TitleBar() {
  const { section, drawer, openDrawer } = useWorkspace();
  const { theme, toggleTheme } = useTheme();
  const label = SECTIONS.find((s) => s.key === section)?.label ?? "";

  useEffect(() => {
    window.dca?.setTitleBarOverlay?.(theme);
  }, [theme]);

  const onDoubleClick = (e: React.MouseEvent) => {
    // no-drag 只挡 OS 拖拽，不挡 DOM 冒泡：双击扫描按钮/下拉/动作按钮会冒到这里。
    // drag 区本身由系统原生处理双击最大化，React 事件不会冒上来。
    if ((e.target as HTMLElement).closest("button, select, input, a, [role='button']")) return;
    window.dca?.toggleMaximize?.().catch(() => {});
  };

  return (
    <header className="titlebar" onDoubleClick={onDoubleClick}>
      <div className="titlebar-brand">
        <span className="titlebar-logo"><Icon name="eraser" size={16} /></span>
        <span className="titlebar-title">磁盘清理助手</span>
        <span className="titlebar-sep" />
        <span className="titlebar-section">{label}</span>
      </div>
      <ScanControl />
      <div className="titlebar-drag" />
      {/* 更新胶囊已移到右下角浮动（见 Shell），标题栏只留抽屉与主题 */}
      <div className="titlebar-actions no-drag">
        <button className={`icon-btn ${drawer === "kb" ? "on" : ""}`} aria-label="打开目录百科" title="目录百科" onClick={() => openDrawer("kb")}>
          <Icon name="search" size={16} />
        </button>
        <button className={`icon-btn ${drawer === "logs" ? "on" : ""}`} aria-label="打开删除日志" title="删除日志" onClick={() => openDrawer("logs")}>
          <Icon name="log" size={16} />
        </button>
        <button
          className="icon-btn"
          aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          onClick={toggleTheme}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
        </button>
      </div>
      <div className="titlebar-overlay-gap" />
    </header>
  );
}
