interface UpdateCheckResult {
  ok: boolean;
  error?: string;
  current?: string;
  latest?: string;
  hasUpdate?: boolean;
  assetName?: string;
  size?: number;
  publishedAt?: string;
  body?: string;
}

interface SmartDownloadResult {
  ok: boolean;
  error?: string;
  url?: string;
  source?: string;
  ms?: number;
}

interface DcaBridge {
  platform: string;
  checkUpdate: () => Promise<UpdateCheckResult>;
  smartDownload: (payload: { assetName?: string; tag?: string }) => Promise<SmartDownloadResult>;
}

interface Window {
  dca: DcaBridge;
}
