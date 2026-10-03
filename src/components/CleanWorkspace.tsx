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
      <div className="cleanup-flow"><strong>先查看范围，再确认清理。</strong><ol aria-label="清理流程"><li>1 · 扫描与识别</li><li>2 · 选择项目</li><li>3 · 预览确认</li><li>4 · 查看报告</li></ol></div>
      <div className="seg-row" role="tablist" aria-label="清理来源">
        {CLEAN_SEGMENTS.map((s) => (
          <button
            key={s.key}
            role="tab"
            id={'clean-tab-' + s.key}
            aria-controls={'clean-panel-' + s.key}
            tabIndex={seg === s.key ? 0 : -1}
            aria-selected={seg === s.key}
            className={`seg-item ${seg === s.key ? "active" : ""}`}
            onClick={() => openClean(s.key)}
            onKeyDown={(e) => {
              if (!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
              e.preventDefault();
              const i = CLEAN_SEGMENTS.findIndex((item) => item.key === seg);
              const next = e.key === 'Home' ? 0 : e.key === 'End' ? CLEAN_SEGMENTS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + CLEAN_SEGMENTS.length) % CLEAN_SEGMENTS.length;
              openClean(CLEAN_SEGMENTS[next].key);
              document.getElementById('clean-tab-' + CLEAN_SEGMENTS[next].key)?.focus();
            }}
          >
            <Icon name={s.icon} size={14} /> {s.label}
          </button>
        ))}
      </div>

      <div className="tool-body" role="tabpanel" id={'clean-panel-' + seg} aria-labelledby={'clean-tab-' + seg}>
        {seg === "cache" && <CachePanel onOpenKb={onOpenKb} />}
        {seg === "files" && (
          <>
            <ScanPanel />
            {scanId && (
              <section className="file-section">
                <div className="section-title">
                  <h3>文件列表（深度解析）</h3>
                  <span className="muted">大文件 (&gt;{settings.largeFileMb} MiB) 高亮 · 每行展示用途、所属软件与删除建议 · 系统文件锁定保护</span>
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
