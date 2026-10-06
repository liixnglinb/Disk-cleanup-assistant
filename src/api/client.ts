import type {
  AiAnalyzeResult, AiConfig, AiPreset, AiTestResult, AppConfig, CacheCandidate,
  CacheOverview, DeleteResult, DriveInfo, DuplicateResult,
  FileQueryResult, FolderKbItem, KbCategories, KbFoldersResult, LogEntry,
  ResidueResult, ScanStatus, ScanStatistics, SoftwareIconResult, SoftwareItem,
  ToolMeta,
} from "../types";
import { errMsg } from "../utils/errMsg";

/** Backend port: Electron main appends ?backend=PORT to the loaded URL. */
function backendBase(): string {
  const q = new URLSearchParams(window.location.search);
  const port = q.get("backend") || "17650";
  return `http://127.0.0.1:${port}`;
}

function backendToken(): string | null {
  return window.dca?.getApiToken() || new URLSearchParams(window.location.search).get("apiToken");
}

/** 后端挂起时不能把 UI 永久吊住：所有请求都有超时。
 *  默认 60s（全盘扫描后 240 万行的统计/查询确实慢），个别调用可自己放宽。 */
const DEFAULT_TIMEOUT_MS = 60000;

function authHeaders(init?: RequestInit & { timeoutMs?: number }): { headers: Headers; timeoutMs: number } {
  const token = backendToken();
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("X-DCA-Token", token);
  return { headers, timeoutMs: init?.timeoutMs ?? DEFAULT_TIMEOUT_MS };
}

async function throwHttp(res: Response): Promise<never> {
  let detail: unknown = res.statusText;
  try {
    const body = await res.json();
    detail = body.detail || detail;
  } catch {
    /* 非 JSON 错误体就用状态文本 */
  }
  throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
}

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { headers, timeoutMs } = authHeaders(init);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${backendBase()}${path}`, { ...init, headers, signal: ctl.signal });
  } catch (e) {
    throw new Error(e instanceof Error && e.name === "AbortError" ? `请求超时（${Math.round(timeoutMs / 1000)}s 未响应）` : errMsg(e));
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) await throwHttp(res);
  return res.json() as Promise<T>;
}

/** 下载型端点（CSV 导出）：必须带鉴权头，所以不能再用 window.open 裸 GET。 */
async function downloadFile(path: string, filename: string): Promise<void> {
  const { headers, timeoutMs } = authHeaders();
  headers.delete("Content-Type");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${backendBase()}${path}`, { headers, signal: ctl.signal });
  } catch (e) {
    throw new Error(e instanceof Error && e.name === "AbortError" ? "导出超时" : errMsg(e));
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) await throwHttp(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 会让部分 Chromium 版本丢掉下载，延后一拍再释放。
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export interface FileQueryPayload {
  scan_id: string;
  category?: string;
  min_size?: number;
  keyword?: string;
  page?: number;
  page_size?: number;
  sort?: string;
  recommendation?: string;
  ext?: string;
  owner?: string;
  needs_ai?: boolean;
}

export const api = {
  base: backendBase,
  drives: () => request<{ items: DriveInfo[] }>("/api/drives"),
  getConfig: () => request<AppConfig>("/api/config"),
  startScan: (drive: string, large_file_mb?: number) =>
    request<{ scan_id: string; message: string }>("/api/scan/start", {
      method: "POST",
      body: JSON.stringify({ drive, large_file_mb }),
    }),
  scanStatus: (scanId: string | null) =>
    request<ScanStatus>(`/api/scan/status/${scanId}`),
  recentScan: () =>
    request<{ scan_id: string | null; exists: boolean; drive?: string; status?: string }>("/api/scan/recent"),
  pauseScan: (scanId: string) =>
    request<{ ok: boolean; message: string }>("/api/scan/pause", {
      method: "POST",
      body: JSON.stringify({ scan_id: scanId }),
    }),
  resumeScan: (scanId: string) =>
    request<{ ok: boolean; message: string }>("/api/scan/resume", {
      method: "POST",
      body: JSON.stringify({ scan_id: scanId }),
    }),
  cancelScan: (scanId: string) =>
    request<{ ok: boolean; message: string }>("/api/scan/cancel", {
      method: "POST",
      body: JSON.stringify({ scan_id: scanId }),
    }),
  queryFiles: (payload: FileQueryPayload) => request<FileQueryResult>("/api/files/query", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  selectAllPaths: (payload: FileQueryPayload) =>
    request<{ paths: string[]; count: number }>("/api/files/select-all", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  statistics: (scanId: string) => request<ScanStatistics>(`/api/files/statistics/${scanId}`),
  deleteFiles: (paths: string[], permanent: boolean, restore_point = false) =>
    request<DeleteResult>("/api/delete/", {
      method: "POST",
      body: JSON.stringify({ paths, permanent, restore_point }),
    }),
  software: () => request<{ items: SoftwareItem[] }>("/api/software/installed"),
  softwareIcon: (name: string) => request<SoftwareIconResult>(`/api/software/icon?name=${encodeURIComponent(name)}`),
  softwareUninstall: (uninstall_string: string) =>
    request<{ ok: boolean; message: string }>("/api/software/uninstall", {
      method: "POST",
      body: JSON.stringify({ uninstall_string }),
    }),
  softwareResidue: (name: string, install_location: string) =>
    request<ResidueResult>("/api/software/residue", {
      method: "POST",
      body: JSON.stringify({ name, install_location }),
    }),
  cacheCandidates: () => request<{ items: CacheCandidate[] }>("/api/cache/candidates"),
  cacheOverview: (force = false) => request<CacheOverview>(`/api/cache/overview${force ? "?force=true" : ""}`),
  kbFolders: (params: { category?: string; recommendation?: string; keyword?: string; only_existing?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (params.category) q.set("category", params.category);
    if (params.recommendation) q.set("recommendation", params.recommendation);
    if (params.keyword) q.set("keyword", params.keyword);
    if (params.only_existing) q.set("only_existing", "true");
    const qs = q.toString();
    return request<KbFoldersResult>(`/api/kb/folders${qs ? `?${qs}` : ""}`);
  },
  kbCategories: () => request<KbCategories>("/api/kb/categories"),
  cleanCache: (paths: string[], permanent: boolean, restore_point = false) =>
    request<DeleteResult>("/api/cache/clean", {
      method: "POST",
      body: JSON.stringify({ paths, permanent, restore_point }),
    }),
  reveal: (path: string) =>
    request<{ ok: boolean; path: string }>("/api/system/reveal", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  duplicates: (scanId: string) => request<DuplicateResult>(`/api/duplicates/find/${scanId}`),
  logs: () => request<{ items: LogEntry[]; total: number }>("/api/logs"),
  exportLogs: () => downloadFile("/api/logs/export", `磁盘清理助手-删除记录-${new Date().toISOString().slice(0, 10)}.csv`),
  tools: () => request<{ items: ToolMeta[]; count: number }>("/api/tools"),
  aiConfig: () => request<AiConfig>("/api/ai/config"),
  aiPresets: () => request<{ items: AiPreset[] }>("/api/ai/presets"),
  aiTest: (payload: { endpoint: string; api_key: string; model: string; timeout_s?: number }) =>
    request<AiTestResult>("/api/ai/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  aiSetConfig: (payload: { endpoint: string; api_key: string; model: string; timeout_s?: number; clear_key?: boolean }) =>
    request<AiConfig>("/api/ai/config", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  aiAnalyze: (paths: string[], with_signature = false) =>
    request<AiAnalyzeResult>("/api/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ paths, with_signature }),
    }),
};
