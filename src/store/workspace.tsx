import React, { createContext, useContext, useMemo, useState } from "react";
import type { IconName } from "../components/icons";

export type SectionKey =
  | "overview" | "files" | "cache" | "kb" | "software" | "duplicates" | "logs" | "settings";

interface WorkspaceCtx {
  section: SectionKey;
  setSection: (s: SectionKey) => void;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export const SECTIONS: { key: SectionKey; label: string; icon: IconName }[] = [
  { key: "overview", label: "概览", icon: "chart" },
  { key: "files", label: "文件清理", icon: "file" },
  { key: "cache", label: "缓存清理", icon: "eraser" },
  { key: "kb", label: "目录百科", icon: "book" },
  { key: "software", label: "软件管理", icon: "package" },
  { key: "duplicates", label: "重复文件", icon: "copy" },
  { key: "logs", label: "删除日志", icon: "log" },
  { key: "settings", label: "设置", icon: "settings" },
];

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [section, setSection] = useState<SectionKey>("overview");
  const value = useMemo(() => ({ section, setSection }), [section]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace 必须在 WorkspaceProvider 内使用");
  return v;
}
