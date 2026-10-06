import type { IconName } from "../components/icons";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "未知";
  if (!bytes) return "0 B";
  const n = Math.abs(bytes);
  if (n < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i += 1;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

export function formatTime(ms: number | null | undefined): string {
  if (!ms) return "-";
  const d = new Date(ms * 1000);
  // 非法日期返回 "-"，不返回 "NaN-NaN-NaN"：文件表一次渲染上千行，
  // 一列全是 NaN 会把整张表的排版打乱，且用户无从判断是数据问题还是程序问题。
  if (Number.isNaN(d.getTime())) return "-";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((x) => String(x).padStart(2, "0")).join(":");
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function dirName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  parts.pop();
  return parts.join("\\") || path;
}

export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  system: { label: "系统文件", color: "var(--cat-system)" },
  download: { label: "下载目录", color: "var(--cat-download)" },
  cache: { label: "软件缓存", color: "var(--cat-cache)" },
  residue: { label: "残留文件", color: "var(--cat-residue)" },
  large: { label: "大文件", color: "var(--cat-large)" },
  docs: { label: "用户文档", color: "var(--cat-docs)" },
  app_data: { label: "软件数据", color: "var(--cat-app-data)" },
  unknown: { label: "未知类型", color: "var(--cat-unknown)" },
};

export const RECOMMENDATION_META: Record<string, { label: string; cls: string }> = {
  recommend: { label: "推荐删除", cls: "badge-rec" },
  caution: { label: "谨慎删除", cls: "badge-caution" },
  keep: { label: "建议保留", cls: "badge-keep" },
  system: { label: "系统必留", cls: "badge-system" },
};

export const RISK_META: Record<string, { label: string; cls: string }> = {
  low: { label: "低风险", cls: "badge-risk-low" },
  medium: { label: "中风险", cls: "badge-risk-medium" },
  high: { label: "高风险", cls: "badge-risk-high" },
};

// ===== 清理知识库（目录百科）元数据 =====
// icon 用的是全站 SVG 图标集的键名（不是 emoji）：六个类目以前全填 ""，
// 于是每张百科卡片左侧那个 30×30 的图标位一直是个空格子。
export const KB_CATEGORY_META: Record<string, { label: string; color: string; icon: IconName }> = {
  system_core: { label: "系统核心", color: "var(--cat-system)", icon: "shield" },
  system_cache: { label: "系统缓存", color: "var(--cat-download)", icon: "eraser" },
  system_temp: { label: "系统临时", color: "var(--cat-unknown)", icon: "file" },
  app_cache: { label: "软件缓存", color: "var(--cat-cache)", icon: "package" },
  app_data: { label: "软件数据", color: "var(--cat-large)", icon: "folder" },
  user_data: { label: "用户文件", color: "var(--cat-docs)", icon: "archive" },
};

export const KB_RECOMMENDATION_META: Record<string, { label: string; cls: string }> = {
  recommend: { label: "推荐清理", cls: "badge-rec" },
  caution: { label: "谨慎清理", cls: "badge-caution" },
  keep: { label: "建议保留", cls: "badge-keep" },
  system: { label: "系统必留", cls: "badge-system" },
};

// 语义色四轴：可释放=ok / 谨慎=warn / 保留=info(品牌) / 锁定=danger
export function kbRecommendationColor(rec: string): string {
  switch (rec) {
    case "recommend": return "var(--ok)";
    case "caution": return "var(--warn)";
    case "keep": return "var(--info)";
    case "system": return "var(--danger)";
    default: return "var(--text-dim)";
  }
}

export function kbRiskLabel(risk: string): string {
  return risk === "low" ? "低风险" : risk === "medium" ? "中风险" : "高风险";
}
