import React, { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import Icon from "./icons";
import { useScan } from "../store/ScanContext";
import { loadSettings } from "../store/settings";
import type { DriveInfo } from "../types";
import { formatBytes } from "../utils/format";
import { useToast } from "../store/ToastContext";
import { errMsg } from "../utils/errMsg";

export default function ScanControl() {
  const { status, startScan, pause, resume, error, control } = useScan();
  const toast = useToast();
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDrive, setSelectedDrive] = useState("");
  const shownErr = useRef<string | null>(null);

  // 扫描控制失败（暂停/继续/取消/开始）落在 store 的 error 上，标题栏这条区域
  // 本来不渲染它 —— 点了没反应就等于没反馈。这里转成一条 toast，同一个原因只报一次。
  useEffect(() => {
    if (error && error !== shownErr.current) {
      shownErr.current = error;
      toast.push({ kind: "error", message: "扫描操作失败：" + error });
    }
    if (!error) shownErr.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  useEffect(() => {
    api.drives()
      .then((r) => {
        setDrives(r.items);
        if (r.items.length) setSelectedDrive((p) => p || r.items[0].drive);
      })
      // 盘符读不到时下拉框是空的，不吭声用户只会觉得"软件坏了"
      .catch((e) => {
        setDrives([]);
        toast.push({ kind: "error", message: "无法读取盘符列表：" + errMsg(e) });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = status?.status === "running" || status?.status === "starting";
  const paused = status?.status === "paused";

  const onStart = async () => {
    // 闸门在 store 里（control），这里再判一次只为让按钮状态即时跟上
    if (!selectedDrive || running || control) return;
    await startScan(selectedDrive, loadSettings().largeFileMb);
  };

  const pct = typeof status?.percent === "number" ? status.percent : null;

  return (
    <div className="titlebar-scan no-drag">
      <select
        value={selectedDrive}
        onChange={(e) => setSelectedDrive(e.target.value)}
        disabled={running || paused || !!control}
      >
        {drives.map((d) => (
          <option key={d.drive} value={d.drive}>
            {d.drive}（可用 {formatBytes(d.free)}）
          </option>
        ))}
      </select>
      {!running && !paused && (
        <button className="btn primary small" onClick={onStart} disabled={!selectedDrive || control === "start"}>
          {control === "start" ? "正在开始…" : (<><Icon name="play" size={13} /> 开始扫描</>)}
        </button>
      )}
      {running && (
        <>
          <span className="titlebar-progress" title={status?.current_path || ""}>
            <i style={{ width: `${pct ?? 0}%` }} />
          </span>
          <span className="num dim">{pct === null ? "…" : `${pct}%`}</span>
          <button className="btn small" onClick={pause} disabled={!!control}>
            <Icon name="pause" size={13} /> 暂停
          </button>
        </>
      )}
      {paused && (
        <button className="btn small" onClick={resume} disabled={!!control}>
          <Icon name="play" size={13} /> 继续
        </button>
      )}
    </div>
  );
}
