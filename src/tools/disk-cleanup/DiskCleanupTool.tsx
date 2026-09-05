import React, { useEffect, useState } from "react";
import { api } from "../../api/client";
import CachePanel from "../../components/CachePanel";
import DuplicatesPanel from "../../components/DuplicatesPanel";
import FactoryPanel from "../../components/FactoryPanel";
import FileTable, { FileFilter } from "../../components/FileTable";
import Icon from "../../components/icons";
import KnowledgePanel from "../../components/KnowledgePanel";
import LogsPanel from "../../components/LogsPanel";
import OverviewPanel from "../../components/OverviewPanel";
import ScanPanel from "../../components/ScanPanel";
import SettingsPanel from "../../components/SettingsPanel";
import SoftwarePanel from "../../components/SoftwarePanel";
import { ScanProvider, useScan } from "../../store/ScanContext";
import type { DriveInfo } from "../../types";
import { formatBytes } from "../../utils/format";
import type { Category } from "../../types";
import { loadSettings } from "../../components/SettingsPanel";

const TABS = [
  { key: "overview", label: "概览", icon: "chart" },
  { key: "files", label: "文件清理", icon: "file" },
  { key: "cache", label: "缓存清理", icon: "eraser" },
  { key: "kb", label: "目录百科", icon: "book" },
  { key: "factory", label: "出厂检测", icon: "shield" },
  { key: "software", label: "软件管理", icon: "package" },
  { key: "duplicates", label: "重复文件", icon: "copy" },
  { key: "logs", label: "删除日志", icon: "log" },
  { key: "settings", label: "设置", icon: "settings" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function HeaderScanControl() {
  const { status, startScan } = useScan();
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDrive, setSelectedDrive] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api.drives()
      .then((r) => {
        setDrives(r.items);
        if (r.items.length) setSelectedDrive((p) => p || r.items[0].drive);
      })
      .catch(() => {});
  }, []);

  const running = status?.status === "running" || status?.status === "starting";
  const paused = status?.status === "paused";
  const pausedOrRunning = running || paused;

  const onStart = async () => {
    if (!selectedDrive || starting || running) return;
    setStarting(true);
    try {
      await startScan(selectedDrive, loadSettings().largeFileMb);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="header-scan">
      <select
        className="drive-select"
        value={selectedDrive}
        onChange={(e) => setSelectedDrive(e.target.value)}
        disabled={pausedOrRunning || starting}
      >
        {drives.map((d) => (
          <option key={d.drive} value={d.drive}>
            {d.label || d.drive}（可用 {formatBytes(d.free)}）
          </option>
        ))}
      </select>
      <button className="btn primary" onClick={onStart} disabled={!selectedDrive || running || starting}>
        <Icon name="play" size={13} /> {starting || running ? "扫描中…" : "开始扫描"}
      </button>
    </div>
  );
}

function ToolScreen() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [fileFilter, setFileFilter] = useState<FileFilter>({});
  const { scanId, status } = useScan();

  const openFiles = (filter: FileFilter = {}) => {
    setFileFilter(filter);
    setTab("files");
  };

  return (
    <div className="tool">
      <div className="tool-header">
        <div className="tool-heading">
          <h2><span className="tool-icon"><Icon name="eraser" size={22} /></span> 磁盘清理</h2>
          <p className="muted">扫描 → 深度解析用途 / 所属软件 / 删除建议 → 勾选 → 回收站安全释放。</p>
        </div>
        <HeaderScanControl />
      </div>
      <div className="tool-tabs-row">
        <div className="tool-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`tool-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
              <Icon name={t.icon as any} size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tool-body">
        {tab === "overview" && <OverviewPanel onOpenFiles={openFiles} />}
        {tab === "files" && (
          <>
            <ScanPanel />
            {scanId && (
              <section className="file-section">
                <div className="section-title">
                  <h3>文件列表（深度解析）</h3>
                  <span className="muted">大文件 (&gt;{loadSettings().largeFileMb}MB) 高亮 · 每一行展示用途、所属软件与删除建议 · 系统文件置灰锁定</span>
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
        {tab === "factory" && <FactoryPanel />}
        {tab === "duplicates" && <DuplicatesPanel />}
        {tab === "logs" && <LogsPanel />}
        {tab === "settings" && <SettingsPanel />}
      </div>
    </div>
  );
}

export default function DiskCleanupTool() {
  return (
    <ScanProvider>
      <ToolScreen />
    </ScanProvider>
  );
}