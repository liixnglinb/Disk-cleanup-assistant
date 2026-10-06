import { useSyncExternalStore } from "react";

export interface AppSettings {
  allowPermanentDelete: boolean;
  autoPreview: boolean;
  largeFileMb: number;
  restorePointOnDelete: boolean;
  showSafeCleanHint: boolean;
}

const KEY = "ltb-settings";

const DEFAULTS: AppSettings = {
  allowPermanentDelete: false,
  autoPreview: true,
  largeFileMb: 100,
  restorePointOnDelete: false,
  showSafeCleanHint: true,
};

/** 脏 localStorage 不能让设置变成 NaN / 字符串 "false"：
 *  此前只 try/catch JSON.parse，类型不校验 —— 例如 largeFileMb 被写成 "abc"
 *  会一路传到 FileTable 的 *1024*1024 变成 NaN，再被 JSON.stringify 成 null 发给后端。 */
function sanitize(raw: unknown): AppSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const mb = Number(o.largeFileMb);
  return {
    allowPermanentDelete: bool(o.allowPermanentDelete, DEFAULTS.allowPermanentDelete),
    autoPreview: bool(o.autoPreview, DEFAULTS.autoPreview),
    // 与设置页输入框同一钳制区间，脏值不再穿透到查询与扫描
    largeFileMb: Number.isFinite(mb) ? Math.max(10, Math.min(1024, Math.round(mb))) : DEFAULTS.largeFileMb,
    restorePointOnDelete: bool(o.restorePointOnDelete, DEFAULTS.restorePointOnDelete),
    showSafeCleanHint: bool(o.showSafeCleanHint, DEFAULTS.showSafeCleanHint),
  };
}

function read(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      // darkMode 曾存在这份设置里，现由 useTheme 单独管理，读到时丢弃
      const { darkMode, ...rest } = JSON.parse(raw);
      return sanitize(rest);
    }
  } catch {
    /* 解析失败回落默认值 */
  }
  return { ...DEFAULTS };
}

let current: AppSettings = read();
const listeners = new Set<() => void>();

export function loadSettings(): AppSettings {
  return current;
}

export function saveSettings(s: AppSettings) {
  current = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 隐私模式下写入可能失败，内存态仍然生效 */
  }
  listeners.forEach((l) => l());
}

export function patchSettings(patch: Partial<AppSettings>) {
  saveSettings({ ...current, ...patch });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** 订阅式读取：改设置后所有使用方立即重渲染（此前各面板渲染期直读、永不更新）。 */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
