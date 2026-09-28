import React from "react";
import CachePanel from "./CachePanel";
import DuplicatesPanel from "./DuplicatesPanel";
import FileTable from "./FileTable";
import Icon from "./icons";
import ScanPanel from "./ScanPanel";
import { useSettings } from "../store/settings";
import { useScan } from "../store/ScanContext";
import { CLEAN_SEGMENTS, useWorkspace } from "../store/workspace";

interface Props {
  onOpenKb: () => void;
}

/**
 * 「清理」工作区：缓存 / 文件 / 重复 三个来源共用一个分段容器。
 * 三者数据形状不同（目录聚合 / 文件行 / 重复组），所以先收敛入口与导航，
 * 共享表格外壳留给后续阶段。
 */
export default function CleanWorkspace({ onOpenKb }: Props) {
  const { cleanSeg: seg, setSection, fileFilter, setFileFilter, openClean } = useWorkspace();
  const { scanId } = useScan();
  const settings = useSettings();

  return (
    <div className="tool">
      <div className="seg-row" role="tablist" aria-label="清理来源">
        {CLEAN_SEGMENTS.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={seg === s.key}
            className={`seg-item ${seg === s.key ? "active" : ""}`}
            onClick={() => openClean(s.key)}
          >
            <Icon name={s.icon} size={14} /> {s.label}
          </button>
        ))}
      </div>

      <div className="tool-body">
        {seg === "cache" && <CachePanel onOpenKb={onOpenKb} />}
        {seg === "files" && (
          <>
            <ScanPanel />
            {scanId && (
              <section className="file-section">
                <div className="section-title">
                  <h3>文件列表（深度解析）</h3>
                  <span className="muted">大文件 (&gt;{settings.largeFileMb}MB) 高亮 · 每一行展示用途、所属软件与删除建议 · 系统文件置灰锁定</span>
                </div>
                <FileTable initialFilter={fileFilter} onFilterChange={setFileFilter} />
              </section>
            )}
            {!scanId && <div className="panel empty">请在标题栏选择盘符并开始扫描。</div>}
          </>
        )}
        {seg === "duplicates" && <DuplicatesPanel />}
      </div>
    </div>
  );
}
