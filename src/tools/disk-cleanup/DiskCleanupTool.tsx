import React, { useState } from "react";
import CachePanel from "../../components/CachePanel";
import DuplicatesPanel from "../../components/DuplicatesPanel";
import FileTable, { FileFilter } from "../../components/FileTable";
import KnowledgePanel from "../../components/KnowledgePanel";
import LogsPanel from "../../components/LogsPanel";
import OverviewPanel from "../../components/OverviewPanel";
import ScanPanel from "../../components/ScanPanel";
import SettingsPanel from "../../components/SettingsPanel";
import { useSettings } from "../../store/settings";
import SoftwarePanel from "../../components/SoftwarePanel";
import { useScan } from "../../store/ScanContext";
import { useWorkspace } from "../../store/workspace";

function ToolScreen() {
  const { section: tab, setSection: setTab } = useWorkspace();
  const settings = useSettings();
  const [fileFilter, setFileFilter] = useState<FileFilter>({});
  const { scanId } = useScan();

  const openFiles = (filter: FileFilter = {}) => {
    setFileFilter(filter);
    setTab("files");
  };

  return (
    <div className="tool">
      <div className="tool-body">
        {tab === "overview" && <OverviewPanel onOpenFiles={openFiles} />}
        {tab === "files" && (
          <>
            <ScanPanel />
            {scanId && (
              <section className="file-section">
                <div className="section-title">
                  <h3>文件列表（深度解析）</h3>
                  <span className="muted">大文件 (&gt;{settings.largeFileMb}MB) 高亮 · 每一行展示用途、所属软件与删除建议 · 系统文件置灰锁定</span>
                </div>
                <FileTable initialFilter={fileFilter} onFilterChange={setFileFilter} />
              </section>
            )}
            {!scanId && <div className="panel empty">请先在上方选择盘符并开始扫描。</div>}
          </>
        )}
        {tab === "kb" && <KnowledgePanel />}
        {tab === "software" && <SoftwarePanel />}
        {tab === "cache" && <CachePanel onOpenKb={() => setTab("kb")} />}
        {tab === "duplicates" && <DuplicatesPanel />}
        {tab === "logs" && <LogsPanel />}
        {tab === "settings" && <SettingsPanel />}
      </div>
    </div>
  );
}

export default function DiskCleanupTool() {
  return <ToolScreen />;
}
