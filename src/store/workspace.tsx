import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { IconName } from "../components/icons";
import type { FileFilter } from "../components/FileTable";

export type SectionKey = "overview" | "clean" | "software" | "settings";
export type DrawerKey = "logs" | "kb" | null;
export type CleanSegmentKey = "cache" | "files" | "duplicates";

interface WorkspaceCtx {
  section: SectionKey;
  setSection: (s: SectionKey) => void;
  drawer: DrawerKey;
  openDrawer: (d: Exclude<DrawerKey, null>) => void;
  closeDrawer: () => void;
  cleanSeg: CleanSegmentKey;
  fileFilter: FileFilter;
  /** 跳到「清理」工作区的某个来源，可带文件筛选条件 */
  openClean: (seg: CleanSegmentKey, filter?: FileFilter) => void;
  setFileFilter: (f: FileFilter) => void;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export const SECTIONS: { key: SectionKey; label: string; desc: string; icon: IconName }[] = [
  { key: "overview", label: "概览", desc: "磁盘空间与清理建议总览", icon: "chart" },
  { key: "clean", label: "清理", desc: "扫描并安全删除缓存、大文件和重复文件", icon: "eraser" },
  { key: "software", label: "软件", desc: "查看已装软件占用的磁盘空间", icon: "package" },
  { key: "settings", label: "设置", desc: "主题、扫描参数与 AI 分析配置", icon: "settings" },
];

/** 「清理」工作区里的三个来源分段 */
export const CLEAN_SEGMENTS: { key: CleanSegmentKey; label: string; icon: IconName }[] = [
  { key: "cache", label: "缓存", icon: "eraser" },
  { key: "files", label: "文件", icon: "file" },
  { key: "duplicates", label: "重复", icon: "copy" },
];

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [section, setSection] = useState<SectionKey>("overview");
  const [drawer, setDrawer] = useState<DrawerKey>(null);
  const [cleanSeg, setCleanSeg] = useState<CleanSegmentKey>("cache");
  const [fileFilter, setFileFilter] = useState<FileFilter>({});

  const openClean = useCallback((seg: CleanSegmentKey, filter?: FileFilter) => {
    setCleanSeg(seg);
    if (filter) setFileFilter(filter);
    setSection("clean");
  }, []);

  const value = useMemo(
    () => ({
      section,
      setSection,
      drawer,
      openDrawer: (d: Exclude<DrawerKey, null>) => setDrawer((cur) => (cur === d ? null : d)),
      closeDrawer: () => setDrawer(null),
      cleanSeg,
      fileFilter,
      openClean,
      setFileFilter,
    }),
    [section, drawer, cleanSeg, fileFilter, openClean],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace 必须在 WorkspaceProvider 内使用");
  return v;
}
