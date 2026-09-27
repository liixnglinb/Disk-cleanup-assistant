import React, { useEffect, useState } from "react";
import Icon from "./icons";
import ScanControl from "./ScanControl";
import UpdateBox from "./UpdateBox";
import { SECTIONS, useWorkspace } from "../store/workspace";
import { useTheme } from "../hooks/useTheme";

export default function TitleBar() {
  const { section, setSection } = useWorkspace();
  const { theme, toggleTheme } = useTheme();
  const [maximized, setMaximized] = useState(false);
  const label = SECTIONS.find((s) => s.key === section)?.label ?? "";

  useEffect(() => {
    window.dca?.setTitleBarOverlay?.(theme);
  }, [theme]);

  useEffect(() => window.dca?.onMaximizedChanged?.((m) => setMaximized(m.maximized)), []);

  const onDoubleClick = () => {
    window.dca?.toggleMaximize?.().then((r) => setMaximized(r.maximized));
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
      <div className="titlebar-actions no-drag">
        <button className="icon-btn" title="目录百科搜索" onClick={() => setSection("kb")}>
          <Icon name="search" size={16} />
        </button>
        <button className="icon-btn" title="删除日志" onClick={() => setSection("logs")}>
          <Icon name="log" size={16} />
        </button>
        <button
          className="icon-btn"
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
