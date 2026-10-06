import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { ScanStatistics, ScanStatus } from "../types";
import { errMsg } from "../utils/errMsg";

interface ScanCtx {
  scanId: string | null;
  status: ScanStatus | null;
  statistics: ScanStatistics | null;
  error: string | null;
  /** 正在执行的扫描控制动作；同一时刻只允许一个，按钮据此禁用 */
  control: "start" | "pause" | "resume" | "cancel" | null;
  selected: Set<string>;
  startScan: (drive: string, large_file_mb?: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  cancel: () => Promise<void>;
  setSelected: (path: string, checked: boolean) => void;
  setSelectedMany: (paths: string[], checked: boolean) => void;
  clearSelection: () => void;
  refreshStatistics: () => Promise<void>;
}

const Ctx = createContext<ScanCtx | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [scanId, setScanId] = useState<string | null>(null);
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [statistics, setStatistics] = useState<ScanStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelectedState] = useState<Set<string>>(new Set());
  const [control, setControl] = useState<"start" | "pause" | "resume" | "cancel" | null>(null);
  // 用 ref 做同步闸门：连点时两次点击在同一个 tick 内，setState 还没生效，
  // 只靠 state 判断会放行第二个请求（后端有"已有扫描正在进行"的闸，但那是 400，
  // 界面该先自己拦住，而不是把报错当正常流程）。
  const controlRef = useRef(false);

  const runControl = useCallback(async (
    name: "start" | "pause" | "resume" | "cancel",
    fn: () => Promise<void>,
  ) => {
    if (controlRef.current) return;
    controlRef.current = true;
    setControl(name);
    try {
      await fn();
    } finally {
      controlRef.current = false;
      setControl(null);
    }
  }, []);

  const refreshStatistics = useCallback(async () => {
    if (!scanId) return;
    try {
      const st = await api.statistics(scanId);
      setStatistics(st);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [scanId]);

  useEffect(() => {
    if (!scanId) return;
    let alive = true;
    let timer: number | undefined;
    const TERMINAL = new Set(["completed", "cancelled", "error"]);
    const poll = async () => {
      let done = false;
      try {
        const st = await api.scanStatus(scanId);
        if (!alive) return;
        setStatus(st);
        if (TERMINAL.has(st.status)) {
          done = true;
          await refreshStatistics();
        }
      } catch (e) {
        if (!alive) return;
        setError(errMsg(e));
      }
      // 串行链而不是 setInterval：setInterval 不等上一次返回，后端一旦变慢
      // 就会堆叠请求；终态后也没有继续轮询的意义。
      if (alive && !done) timer = window.setTimeout(poll, 1500);
    };
    poll();
    return () => {
      alive = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [scanId, refreshStatistics]);

  // 启动时自动恢复最近一次扫描（软件/后端重启后不丢上次结果）
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.recentScan();
        if (alive && r.exists && r.scan_id) {
          setScanId(r.scan_id);
        }
      } catch {
        /* 静默：无历史扫描或后端未就绪时保持空态 */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const startScan = useCallback((drive: string, large_file_mb?: number) => runControl("start", async () => {
    setError(null);
    try {
      const res = await api.startScan(drive, large_file_mb);
      setScanId(res.scan_id);
      setSelectedState(new Set());
      setStatistics(null);
      setStatus(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }), [runControl]);

  const pause = useCallback(() => runControl("pause", async () => {
    if (!scanId) return;
    try {
      await api.pauseScan(scanId);
      const st = await api.scanStatus(scanId);
      setStatus(st);
    } catch (e) {
      setError(errMsg(e));
    }
  }), [runControl, scanId]);

  const resume = useCallback(() => runControl("resume", async () => {
    if (!scanId) return;
    try {
      await api.resumeScan(scanId);
      const st = await api.scanStatus(scanId);
      setStatus(st);
    } catch (e) {
      setError(errMsg(e));
    }
  }), [runControl, scanId]);

  const cancel = useCallback(() => runControl("cancel", async () => {
    if (!scanId) return;
    try {
      await api.cancelScan(scanId);
      const st = await api.scanStatus(scanId);
      setStatus(st);
    } catch (e) {
      setError(errMsg(e));
    }
  }), [runControl, scanId]);

  const setSelected = useCallback((path: string, checked: boolean) => {
    setSelectedState((prev) => {
      const next = new Set(prev);
      if (checked) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  const setSelectedMany = useCallback((paths: string[], checked: boolean) => {
    setSelectedState((prev) => {
      const next = new Set(prev);
      for (const p of paths) {
        if (checked) next.add(p);
        else next.delete(p);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedState(new Set()), []);

  return (
    <Ctx.Provider
      value={{
        scanId, status, statistics, error, control, selected,
        startScan, pause, resume, cancel, setSelected, setSelectedMany, clearSelection, refreshStatistics,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useScan(): ScanCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useScan must be used within ScanProvider");
  return ctx;
}
