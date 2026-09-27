import React from "react";
import DiskCleanupTool from "./tools/disk-cleanup/DiskCleanupTool";
import Shell from "./components/Shell";
import { ToastProvider } from "./store/ToastContext";
import { ThemeProvider } from "./hooks/useTheme";
import { ScanProvider } from "./store/ScanContext";
import { WorkspaceProvider } from "./store/workspace";
import { UpdaterProvider } from "./store/updater";

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <UpdaterProvider>
          <ScanProvider>
            <WorkspaceProvider>
              <Shell>
                <DiskCleanupTool />
              </Shell>
            </WorkspaceProvider>
          </ScanProvider>
        </UpdaterProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
