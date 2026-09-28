import React from "react";
import CleanWorkspace from "../../components/CleanWorkspace";
import Drawer from "../../components/Drawer";
import KnowledgePanel from "../../components/KnowledgePanel";
import LogsPanel from "../../components/LogsPanel";
import OverviewPanel from "../../components/OverviewPanel";
import SettingsPanel from "../../components/SettingsPanel";
import SoftwarePanel from "../../components/SoftwarePanel";
import { useWorkspace } from "../../store/workspace";

export default function DiskCleanupTool() {
  const { section, drawer, closeDrawer, openDrawer, openClean } = useWorkspace();

  return (
    <>
      {section === "overview" && <OverviewPanel onOpenFiles={(f) => openClean("files", f)} />}
      {section === "clean" && <CleanWorkspace onOpenKb={() => openDrawer("kb")} />}
      {section === "software" && <SoftwarePanel />}
      {section === "settings" && <SettingsPanel />}

      <Drawer open={drawer === "logs"} title="删除日志" icon="log" onClose={closeDrawer}>
        <LogsPanel />
      </Drawer>
      <Drawer open={drawer === "kb"} title="目录百科" icon="book" onClose={closeDrawer}>
        <KnowledgePanel />
      </Drawer>
    </>
  );
}
