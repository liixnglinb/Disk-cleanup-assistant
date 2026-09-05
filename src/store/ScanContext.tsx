import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { ScanStatistics, ScanStatus } from "../types";

interface ScanCtx {
  scanId: string | null;
  status: ScanStatus | null;
  statistics: ScanStatistics | null;
  error: string | null;
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
  const prevScanId = useRef<string | null>(null);

  const refreshStatistics = useCallback(async () => {
    if (!scanId) return;
    try {
      const st = await api.statistics(scanId);
      setStatistics(st);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }, [scanId]);

  useEffect(() => {
    if (!scanId) return;
    let alive = true;
    const poll = async () => {
      try {
        const st = await api.scanStatus(scanId);
        if (!alive) return;
        setStatus(st);
        window.dispatchEvent(new CustomEvent("ltb-scan-status", { detail: st }));
        if (st.status === "completed" || st.status === "cancelled" || st.status === "error") {
          await refreshStatistics();
        }
      } catch (e) {
        if (alive) setError(String(e instanceof Error ? e.message : e));
      }
    };
    poll();
    const iv = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(iv);
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

  const startScan = useCallback(async (drive: string, large_file_mb?: number) => {
    setError(null);
    try {
      const res = await api.startScan(drive, large_file_mb);
      setScanId(res.scan_id);
      setSelectedState(new Set());
      setStatistics(null);
      setStatus(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }, []);

  const pause = useCallback(async () => {
    if (!scanId) return;
    try {
      await api.pauseScan(scanId);
      const st = await api.scanStatus(scanId);
      setStatus(st);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }, [scanId]);

  const resume = useCallback(async () => {
    if (!scanId) return;
    try {
      await api.resumeScan(scanId);
      const st = await api.scanStatus(scanId);
      setStatus(st);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }, [scanId]);

  const cancel = useCallback(async () => {
    if (!scanId) return;
    try {
      await api.cancelScan(scanId);
      const st = await api.scanStatus(scanId);
      setStatus(st);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }, [scanId]);

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
        scanId, status, statistics, error, selected,
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