export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const n = Math.abs(bytes);
  if (n < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
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
  system: { label: "系统文件", color: "#9A9A94" },
  download: { label: "下载目录", color: "#0550AE" },
  cache: { label: "软件缓存", color: "#9A6700" },
  residue: { label: "残留文件", color: "#C1341B" },
  large: { label: "大文件", color: "#111111" },
  docs: { label: "用户文档", color: "#1A7F37" },
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
export const KB_CATEGORY_META: Record<string, { label: string; color: string; icon: string }> = {
  system_core: { label: "系统核心", color: "#9A9A94", icon: "" },
  system_cache: { label: "系统缓存", color: "#0550AE", icon: "" },
  system_temp: { label: "系统临时", color: "#6B6B66", icon: "" },
  app_cache: { label: "软件缓存", color: "#9A6700", icon: "" },
  app_data: { label: "软件数据", color: "#333333", icon: "" },
  user_data: { label: "用户文件", color: "#1A7F37", icon: "" },
};

export const KB_RECOMMENDATION_META: Record<string, { label: string; cls: string }> = {
  recommend: { label: "推荐清理", cls: "badge-rec" },
  caution: { label: "谨慎清理", cls: "badge-caution" },
  keep: { label: "建议保留", cls: "badge-keep" },
  system: { label: "系统必留", cls: "badge-system" },
};

export function kbRecommendationColor(rec: string): string {
  switch (rec) {
    case "recommend": return "#1A7F37";
    case "caution": return "#9A6700";
    case "keep": return "#0550AE";
    case "system": return "#C1341B";
    default: return "#9A9A94";
  }
}

export function kbRiskLabel(risk: string): string {
  return risk === "low" ? "低风险" : risk === "medium" ? "中风险" : "高风险";
}