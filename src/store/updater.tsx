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

/** 归一化版本号（容忍 v 前缀与空值）。 */
function normVersion(v?: string): string {
  return String(v ?? "").replace(/^v/, "");
}

/**
 * 条件升级的判据：当前已处于 ready / downloading，且说的是同一个版本。
 *
 * ready 被同版本的 available 覆盖 → 方块从"可点"退回"准备下载"，安装入口消失；而
 * autoInstallOnAppQuit 已改 false（退出不安装）→ 用户永远拿不到"确认后更新并重启"。
 * downloading 被覆盖 → 进度态倒退（虽会自愈，但同为状态倒退，一并守住）。
 *
 * 两条触发路径都真实存在：① 下载完成后在「设置 → 关于」点「检查更新」，update:check 以
 * 仍在运行的旧版本算 hasUpdate:true；② 主进程 5s 启动推送晚于下载完成。
 */
function keepRunningPhase(prev: UpdateState, latest?: string): boolean {
  if (prev.phase !== "ready" && prev.phase !== "downloading") return false;
  const a = normVersion(prev.latest);
  return a !== "" && a === normVersion(latest);
}

/**
 * 失败态是否允许整块覆盖当前状态（check() 的失败分支 + onUpdateError 共用）。
 *
 * ready：安装包已经下载完成，而 autoInstallOnAppQuit 为 false —— 安装只能靠用户点标题栏
 * 方块。检查失败时若把状态整块换成 error，方块与安装入口会一起消失，本次会话再也装不上；
 * 且主进程的去重闸门（downloadedVersion）是内存变量，重启即复位 → 已下载的安装包会被
 * 重新下载一遍。"这次没问到"不该毁掉本地已经拿到的成果，所以 ready 下保留原状态。
 *
 * downloading（及其余相位）返回 true：下载失败就是要让用户看到，照旧写 error。
 */
export function canClobberError(prevPhase: UpdateState["phase"]): boolean {
  return prevPhase !== "ready";
}

export function UpdaterProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });

  const check = useCallback(async () => {
    if (!window.dca) {
      setState({ phase: "error", error: "当前环境不支持自动更新（仅桌面版可用）" });
      return;
    }
    // 已有 ready / downloading 时不退回 checking：一是避免方块瞬间消失，
    // 二是下面的条件升级要以"检查前的状态"为准，退回 checking 会把判据抹掉。
    setState((p) => (keepRunningPhase(p, p.latest) ? p : { ...p, phase: "checking" }));
    try {
      const r = await window.dca.checkUpdate();
      if (!r.ok) {
        // 条件写：ready 下保留原状态（见 canClobberError），其余照旧写 error
        setState((p) => (canClobberError(p.phase) ? { phase: "error", error: r.error || "检查更新失败" } : p));
        return;
      }
      setState((p) =>
        r.hasUpdate
          ? keepRunningPhase(p, r.latest)
            ? p
            : { phase: "available", latest: r.latest, current: r.current, releaseDate: r.releaseDate, releaseNotes: r.releaseNotes }
          // "没有更新"同样不能打掉 ready / downloading：镜像缓存返回过期版本或 Release 被
          // 回滚时，本地已下载好的安装包还在，方块不该消失。
          : keepRunningPhase(p, p.latest)
            ? p
            : { phase: "latest", latest: r.latest, current: r.current },
      );
    } catch (e) {
      // 同上：invoke 本身抛错（主进程异常）也不能把 ready 打掉
      const msg = String(e instanceof Error ? e.message : e);
      setState((p) => (canClobberError(p.phase) ? { phase: "error", error: msg } : p));
    }
  }, []);

  // 常驻订阅：挂载即生效，不再随设置页卸载而丢失事件
  useEffect(() => {
    if (!window.dca) return;
    const offs = [
      window.dca.onUpdateAvailable((i) =>
        setState((p) =>
          keepRunningPhase(p, i.latest)
            ? p
            : { phase: "available", latest: i.latest, current: i.current, releaseDate: i.releaseDate, releaseNotes: i.releaseNotes },
        ),
      ),
      window.dca.onUpdateProgress((p) => setState((s) => ({ ...s, phase: "downloading", percent: p.percent }))),
      window.dca.onUpdateDownloaded((i) => setState((s) => ({ ...s, phase: "ready", latest: i.version || s.latest, percent: 100 }))),
      // ready 下不覆盖（同 canClobberError 的理由）；downloading 等其余相位照旧写 error
      window.dca.onUpdateError((e) => setState((s) => (canClobberError(s.phase) ? { ...s, phase: "error", error: e.message } : s))),
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
