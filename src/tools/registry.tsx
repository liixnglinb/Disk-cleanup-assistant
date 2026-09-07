import { lazy } from "react";
import type { ToolEntry } from "./types";

/**
 * 前端工具注册中心。
 *
 * 新增一个工具：
 *   1. 在 src/tools/<id>/ 下新建默认导出组件
 *   2. 在下方 ToolEntry 里登记（用 lazy 保证每个工具独立分包）
 *   3. （可选）在 backend/tools/<id>.py 提供后端 TOOL 以在 /api/tools 列出
 */
export const TOOL_ENTRIES: ToolEntry[] = [
  {
    meta: {
      id: "disk-cleanup",
      name: "磁盘清理",
      description:
        "扫描盘符全部文件，按用途智能分类，大文件高亮，勾选后安全移入回收站释放空间。",
      icon: "eraser",
      version: "0.1.2",
    },
    component: lazy(() => import("./disk-cleanup/DiskCleanupTool")),
  },
];

export const toolById = new Map(TOOL_ENTRIES.map((t) => [t.meta.id, t]));

export const HOME_SCREEN = "home";
export const SETTINGS_SCREEN = "settings";
export type ScreenKey = typeof HOME_SCREEN | typeof SETTINGS_SCREEN | ToolEntry["meta"]["id"];