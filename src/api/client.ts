import type {
  AiAnalyzeResult, AiConfig, AiPreset, AiTestResult, AppConfig, CacheCandidate,
  CacheOverview, DeleteResult, DriveInfo, DuplicateResult, FactoryCheckResult,
  FileQueryResult, FolderKbItem, KbCategories, KbFoldersResult, LogEntry,
  ResidueResult, ScanStatus, ScanStatistics, SoftwareIconResult, SoftwareItem,
  ToolMeta,
} from "../types";

/** Backend port: Electron main appends ?backend=PORT to the loaded URL. */
function backendBase(): string {
  const q = new URLSearchParams(window.location.search);
  const port = q.get("backend") || "17650";
  return `http://127.0.0.1:${port}`;
}

function backendToken(): string | null {
  return window.dca?.getApiToken() || new URLSearchParams(window.location.search).get("apiToken");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = backendToken();
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("X-DCA-Token", token);
  const res = await fetch(`${backendBase()}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
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
  tools: () => request<{ items: ToolMeta[]; count: number }>("/api/tools"),
  aiConfig: () => request<AiConfig>("/api/ai/config"),
  aiPresets: () => request<{ items: AiPreset[] }>("/api/ai/presets"),
  aiTest: (payload: { endpoint: string; api_key: string; model: string; timeout_s?: number }) =>
    request<AiTestResult>("/api/ai/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  aiSetConfig: (payload: { endpoint: string; api_key: string; model: string; timeout_s?: number }) =>
    request<AiConfig>("/api/ai/config", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  aiAnalyze: (paths: string[], with_signature = false) =>
    request<AiAnalyzeResult>("/api/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ paths, with_signature }),
    }),
  factoryCheck: () => request<FactoryCheckResult>("/api/factory/check"),
};
