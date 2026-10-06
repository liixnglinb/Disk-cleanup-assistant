import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import Icon from "./icons";
import { useScan } from "../store/ScanContext";
import { loadSettings } from "../store/settings";
import type { DriveInfo } from "../types";
import { formatBytes } from "../utils/format";
import { useToast } from "../store/ToastContext";

export default function ScanControl() {
  const { status, startScan, pause, resume } = useScan();
  const toast = useToast();
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDrive, setSelectedDrive] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api.drives()
      .then((r) => {
        setDrives(r.items);
        if (r.items.length) setSelectedDrive((p) => p || r.items[0].drive);
      })
      // 盘符读不到时下拉框是空的，不吭声用户只会觉得"软件坏了"
      .catch((e) => {
        setDrives([]);
        toast.push({ kind: "error", message: "无法读取盘符列表：" + String(e instanceof Error ? e.message : e) });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = status?.status === "running" || status?.status === "starting";
  const paused = status?.status === "paused";

  const onStart = async () => {
    if (!selectedDrive || starting || running) return;
    setStarting(true);
    try {
      await startScan(selectedDrive, loadSettings().largeFileMb);
    } finally {
      setStarting(false);
    }
  };

  const pct = typeof status?.percent === "number" ? status.percent : null;

  return (
    <div className="titlebar-scan no-drag">
      <select
        value={selectedDrive}
        onChange={(e) => setSelectedDrive(e.target.value)}
        disabled={running || paused || starting}
      >
        {drives.map((d) => (
          <option key={d.drive} value={d.drive}>
            {d.drive}（可用 {formatBytes(d.free)}）
          </option>
        ))}
      </select>
      {!running && !paused && (
        <button className="btn primary small" onClick={onStart} disabled={!selectedDrive || starting}>
          <Icon name="play" size={13} /> 开始扫描
        </button>
      )}
      {running && (
        <>
          <span className="titlebar-progress" title={status?.current_path || ""}>
            <i style={{ width: `${pct ?? 0}%` }} />
          </span>
          <span className="num dim">{pct === null ? "…" : `${pct}%`}</span>
          <button className="btn small" onClick={pause}>
            <Icon name="pause" size={13} /> 暂停
          </button>
        </>
      )}
      {paused && (
        <button className="btn small" onClick={resume}>
          <Icon name="play" size={13} /> 继续
        </button>
      )}
    </div>
  );
}
