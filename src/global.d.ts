interface UpdateCheckResult {
  ok: boolean;
  error?: string;
  current?: string;
  latest?: string;
  hasUpdate?: boolean;
  releaseDate?: string;
  releaseNotes?: string;
}

interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

interface UpdateActionResult {
  ok: boolean;
  error?: string;
}

interface DcaBridge {
  platform: string;
  getApiToken: () => string | null;
  checkUpdate: () => Promise<UpdateCheckResult>;
  downloadUpdate: () => Promise<UpdateActionResult>;
  installUpdate: () => Promise<UpdateActionResult>;
  onUpdateAvailable: (
    cb: (i: { latest: string; current: string; releaseDate?: string }) => void,
  ) => () => void;
  onUpdateProgress: (cb: (p: UpdateProgress) => void) => () => void;
  onUpdateDownloaded: (cb: (i: { version: string }) => void) => () => void;
  onUpdateError: (cb: (e: { message: string }) => void) => () => void;
}

interface Window {
  dca: DcaBridge;
}
