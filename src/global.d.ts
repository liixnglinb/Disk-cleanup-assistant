interface UpdateCheckResult {
  ok: boolean;
  error?: string;
  current?: string;
  latest?: string;
  hasUpdate?: boolean;
  assetName?: string;
  size?: number;
  digest?: string | null;
  publishedAt?: string;
  body?: string;
}

interface SmartDownloadResult {
  ok: boolean;
  error?: string;
  url?: string;
  source?: string;
  ms?: number;
  verified?: boolean;
  filePath?: string;
}

interface DcaBridge {
  platform: string;
  getApiToken: () => string | null;
  checkUpdate: () => Promise<UpdateCheckResult>;
  smartDownload: (payload: { assetName?: string; tag?: string; digest?: string | null; size?: number }) => Promise<SmartDownloadResult>;
}

interface Window {
  dca: DcaBridge;
}
