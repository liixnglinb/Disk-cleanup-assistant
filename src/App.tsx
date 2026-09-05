import React, { Suspense, useState } from "react";
import Home from "./components/Home";
import SettingsPanel from "./components/SettingsPanel";
import Shell, { NavItem, StatusInfo } from "./components/Shell";
import Icon from "./components/icons";
import { ToastProvider } from "./store/ToastContext";
import { ThemeProvider } from "./hooks/useTheme";
import { HOME_SCREEN, ScreenKey, SETTINGS_SCREEN, toolById, TOOL_ENTRIES } from "./tools/registry";

function AppInner() {
  const [screen, setScreen] = useState<ScreenKey>(HOME_SCREEN);

  const nav: NavItem[] = [
    { key: HOME_SCREEN, label: "概览", icon: "home" },
    ...TOOL_ENTRIES.map((t) => ({ key: t.meta.id, label: t.meta.name, icon: t.meta.icon })),
    { key: SETTINGS_SCREEN, label: "设置", icon: "settings" },
  ];

  const ToolComponent = toolById.get(screen)?.component;
  const statusInfo: StatusInfo = { kind: "idle", label: "就绪 · 本地工具箱", right: "" };

  return (
    <Shell nav={nav} active={screen} onNavigate={(k) => setScreen(k as ScreenKey)} statusInfo={statusInfo}>
      {screen === HOME_SCREEN ? (
        <Home onOpenTool={(id) => setScreen(id as ScreenKey)} />
      ) : screen === SETTINGS_SCREEN ? (
        <SettingsPanel />
      ) : ToolComponent ? (
        <Suspense fallback={<div className="panel empty">正在加载工具…</div>}>
          <ToolComponent />
        </Suspense>
      ) : (
        <div className="panel empty">未找到该工具</div>
      )}
    </Shell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </ThemeProvider>
  );
}
