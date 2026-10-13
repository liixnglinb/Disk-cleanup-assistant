import React, { useEffect } from "react";
import ScanControl from "./ScanControl";
import { useTheme } from "../hooks/useTheme";

/**
 * 标题栏：v10 退化为一条纯粹的窗口控制带。
 *
 * v9 这里是「品牌 + 扫描控制 + 三个抽屉/主题图标按钮」。v10 品牌与那三个
 * 按钮全部搬进左侧三段式侧栏（品牌块 / 底部工具块），标题栏只剩两件事：
 * 左侧全局扫描入口，中间整块可拖拽区，右侧让位给系统 overlay 按钮。
 *
 * 保留项说明：
 *   - setTitleBarOverlay：系统按钮的前景/背景色由主进程画，必须跟着主题走；
 *   - onDoubleClick：系统原生只处理 drag 区的双击最大化，按钮上的双击
 *     会被 React 冒泡到这里，需要排除掉控件目标，否则点两下扫描按钮会弹最大化。
 */
export default function TitleBar() {
  const { theme } = useTheme();

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
      <ScanControl />
      <div className="titlebar-drag" />
      <div className="titlebar-overlay-gap" />
    </header>
  );
}
