import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface UpdateState {
  phase: "idle" | "checking" | "latest" | "available" | "downloading" | "ready" | "error";
  latest?: string;
  current?: string;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  error?: string;
}

interface UpdaterCtx {
  state: UpdateState;
  check: () => Promise<void>;
  install: () => Promise<void>;
}

const Ctx = createContext<UpdaterCtx | null>(null);

export function UpdaterProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });

  const check = useCallback(async () => {
    if (!window.dca) {
      setState({ phase: "error", error: "当前环境不支持自动更新（仅桌面版可用）" });
      return;
    }
    setState((p) => ({ ...p, phase: "checking" }));
    try {
      const r = await window.dca.checkUpdate();
      if (!r.ok) {
        setState({ phase: "error", error: r.error || "检查更新失败" });
        return;
      }
      setState(
        r.hasUpdate
          ? { phase: "available", latest: r.latest, current: r.current, releaseDate: r.releaseDate, releaseNotes: r.releaseNotes }
          : { phase: "latest", latest: r.latest, current: r.current },
      );
    } catch (e) {
      setState({ phase: "error", error: String(e instanceof Error ? e.message : e) });
    }
  }, []);

  // 常驻订阅：挂载即生效，不再随设置页卸载而丢失事件
  useEffect(() => {
    if (!window.dca) return;
    const offs = [
      window.dca.onUpdateAvailable((i) =>
        setState({ phase: "available", latest: i.latest, current: i.current, releaseDate: i.releaseDate, releaseNotes: i.releaseNotes }),
      ),
      window.dca.onUpdateProgress((p) => setState((s) => ({ ...s, phase: "downloading", percent: p.percent }))),
      window.dca.onUpdateDownloaded((i) => setState((s) => ({ ...s, phase: "ready", latest: i.version || s.latest, percent: 100 }))),
      window.dca.onUpdateError((e) => setState((s) => ({ ...s, phase: "error", error: e.message }))),
    ];
    // 兜底：主进程 5s 静默检查若早于本订阅，事件会丢，这里主动补一次
    const t = setTimeout(() => { void check(); }, 1500);
    return () => {
      offs.forEach((off) => off());
      clearTimeout(t);
    };
  }, [check]);

  const install = useCallback(async () => {
    await window.dca?.installUpdate();
  }, []);

  const value = useMemo(() => ({ state, check, install }), [state, check, install]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUpdater(): UpdaterCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUpdater 必须在 UpdaterProvider 内使用");
  return v;
}
