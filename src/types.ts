export type Category = "system" | "download" | "cache" | "app_data" | "docs" | "residue" | "large" | "unknown";
export type Recommendation = "recommend" | "caution" | "keep" | "system";
export type RiskLevel = "low" | "medium" | "high";

export interface DriveInfo {
  drive: string;
  label: string;
  total: number;
  free: number;
}

export interface AppConfig {
  app: string;
  large_file_mb: number;
  page_size: number;
}

export type ScanStatusKind = "starting" | "running" | "paused" | "completed" | "cancelled" | "error" | "idle";

export interface ScanStatus {
  scan_id: string;
  drive: string;
  status: ScanStatusKind;
  files_count: number;
  dirs_seen: number;
  bytes_scanned: number;
  errors: number;
  current_path: string;
  start_ms: number;
  end_ms: number;
  elapsed_ms: number;
  message: string;
  total_bytes?: number;
  percent?: number;
}

export interface FileRecord {
  id: number;
  path: string;
  size: number;
  mtime: number | null;
  ctime: number | null;
  ext: string;
  magic: string | null;
  category: string;
  is_locked: number;
  is_dir: number;
  purpose: string;
  owner: string;
  recommendation: string;
  risk: string;
  recommendation_reason?: string;
  needs_ai?: number;
}

export interface FileQueryResult {
  items: FileRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface CategoryStat {
  count: number;
  bytes: number;
}

export interface ScanStatistics {
  total_files: number;
  total_bytes: number;
  categories: Record<string, CategoryStat>;
  recommendations?: Record<string, CategoryStat>;
}

export interface DeleteResult {
  ok: { path: string; size: number }[];
  failed: { path: string; error: string }[];
  freed_bytes: number;
}

export interface SoftwareItem {
  name: string;
  publisher: string;
  installed_size_mb: number | null;
  install_location: string;
  uninstall_string: string;
  install_date: string | null;
  last_used: string | null;
  drive?: string;
  display_icon?: string;
}

export interface SoftwareIconResult {
  name: string;
  icon: string;
}

export interface ResidueItem {
  path: string;
  size: number;
  is_dir: boolean;
}

export interface ResidueResult {
  items: ResidueItem[];
  count: number;
  total_bytes: number;
}

export interface CacheCandidate {
  label: string;
  path: string;
  bytes: number;
  // v2 扩展：所属软件 / 用途说明 / 删除影响 / 建议 / 风险 / 依附关系
  app?: string;
  app_attached?: boolean;
  description?: string;
  delete_impact?: string;
  recommendation?: string;
  risk?: string;
  category?: string;
  exists?: boolean;
}

export interface CacheOverview {
  count: number;
  total_bytes: number;
  by_recommendation: Record<string, number>;
  attached_count: number;
  attached_bytes: number;
  items: CacheCandidate[];
}

export type KbCategory =
  | "system_core"
  | "system_cache"
  | "system_temp"
  | "app_cache"
  | "app_data"
  | "user_data";

export interface FolderKbItem {
  id: string;
  name: string;
  category: KbCategory;
  app: string;
  app_attached: boolean;
  path: string;
  resolved_path: string;
  exists: boolean;
  description: string;
  delete_impact: string;
  recommendation: "recommend" | "caution" | "keep" | "system";
  risk: "low" | "medium" | "high";
}

export interface KbCategories {
  categories: Record<string, string>;
  recommendations: Record<string, string>;
  risks: Record<string, string>;
}

export interface KbFoldersResult {
  items: FolderKbItem[];
  total: number;
}

export interface DuplicateGroup {
  size: number;
  hash: string;
  files: { path: string; mtime: number | null }[];
  total_bytes: number;
}

export interface DuplicateResult {
  groups: DuplicateGroup[];
  group_count: number;
  recoverable_bytes: number;
}

export interface LogEntry {
  time: string;
  path: string;
  name: string;
  size: number;
  permanent: boolean;
}
export interface ToolMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  enabled?: boolean;
  builtin?: boolean;
}

export interface AiConfig {
  configured: boolean;
  endpoint: string;
  model: string;
  has_api_key: boolean;
  api_key_hint: string;
}

export interface AiPreset {
  id: string;
  name: string;
  endpoint: string;
  model: string;
}

export interface AiTestResult {
  ok: boolean;
  latency_ms?: number;
  message: string;
}

export interface AiFileResult {
  path: string;
  source?: string;
  purpose?: string;
  risk?: string;
  suggest_delete?: string;
  detail?: string;
}

export interface AiAnalyzeResult {
  ok: boolean;
  message?: string;
  analyzed?: number;
  items: AiFileResult[];
}

export interface FactoryDevice {
  manufacturer: string;
  product: string;
  brand: string;
  arch: string;
  chassis: string;
  is_laptop: boolean;
}

export interface FactoryItem {
  name: string;
  path: string;
  category: string;
  description: string;
  exists: boolean;
  required: boolean;
  severity: "high" | "low";
  is_dir: boolean;
}

export interface FactoryCheckResult {
  device: FactoryDevice;
  items: FactoryItem[];
  summary: {
    total: number;
    present: number;
    missing: number;
    missing_high: number;
    healthy: boolean;
  };
}