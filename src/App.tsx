import React from "react";
import DiskCleanupTool from "./tools/disk-cleanup/DiskCleanupTool";
import Shell, { StatusInfo } from "./components/Shell";
import { ToastProvider } from "./store/ToastContext";
import { ThemeProvider } from "./hooks/useTheme";

function AppInner() {
  const statusInfo: StatusInfo = { kind: "idle", label: "就绪", right: "" };

  return (
    <Shell statusInfo={statusInfo}>
      <DiskCleanupTool />
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
