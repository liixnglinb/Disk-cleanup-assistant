import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { useTheme } from "../hooks/useTheme";
import type { AiConfig, AiPreset, AiTestResult } from "../types";
import { useUpdater } from "../store/updater";
import { patchSettings, useSettings } from "../store/settings";

type SectionKey = "general" | "scan" | "ai" | "safety" | "about";

function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="setting-section-title">
      <h3>{title}</h3>
      {desc && <p className="muted">{desc}</p>}
    </div>
  );
}

function Toggle({ on, onChange, label, desc, warn }: {
  on: boolean; onChange: (v: boolean) => void; label: string; desc: string; warn?: boolean;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row-main">
        <div className="setting-label">{label}{warn ? "（谨慎）" : ""}</div>
        <div className="setting-desc">{desc}</div>
      </div>
      <div className="setting-control">
        <label className="switch">
          <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
          <span className="knob" />
        </label>
      </div>
    </div>
  );
}

export default function SettingsPanel() {
  const { theme, toggleTheme } = useTheme();
  const { state: update, check: checkUpdate } = useUpdater();
  const settings = useSettings();
  const GROUPS = new Set<SectionKey>(["general", "scan", "ai", "safety", "about"]);

  // ---- AI 配置 ----
  const [ai, setAi] = useState<AiConfig | null>(null);
  const [presets, setPresets] = useState<AiPreset[]>([]);
  const [presetId, setPresetId] = useState("custom");
  const [aiEndpoint, setAiEndpoint] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);
  const [testBusy, setTestBusy] = useState(false);

  useEffect(() => {
    api.aiConfig().then((c) => {
      setAi(c);
      setAiEndpoint(c.endpoint);
      setAiModel(c.model);
    }).catch(() => {});
    api.aiPresets().then((r) => setPresets(r.items)).catch(() => {});
  }, []);

  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = presets.find((x) => x.id === id);
    if (p && p.id !== "custom") {
      setAiEndpoint(p.endpoint);
      setAiModel(p.model);
    }
  };

  const saveAi = async () => {
    setAiBusy(true);
    setAiMsg(null);
    try {
      const c = await api.aiSetConfig({ endpoint: aiEndpoint, model: aiModel, api_key: aiKey });
      setAi(c);
      setAiKey("");
      setAiMsg(c.configured ? "AI 配置已保存" : "配置已保存（尚未填写 Key，分析功能不可用）");
    } catch (e) {
      setAiMsg(String(e instanceof Error ? e.message : e));
    } finally {
      setAiBusy(false);
    }
  };

  const testAi = async () => {
    setTestBusy(true);
    setTestResult(null);
    setAiMsg(null);
    try {
      const r = await api.aiTest({ endpoint: aiEndpoint, model: aiModel, api_key: aiKey });
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, message: String(e instanceof Error ? e.message : e) });
    } finally {
      setTestBusy(false);
    }
  };

  const set = patchSettings;

  // 更新状态与订阅统一由 UpdaterProvider 持有（标题栏方块与设置页共用同一状态源）

  return (
    <div className="tool settings">
      <div className="panel settings-body">
          {GROUPS.has("general") && (
            <>
              <SectionTitle title="通用" desc="界面显示与交互偏好" />
              <Toggle
                on={theme === "dark"}
                onChange={toggleTheme}
                label="深色模式"
                desc="开启后切换为深色界面；关闭后使用浅色界面。"
              />
              <Toggle on={settings.autoPreview} onChange={(v) => set({ autoPreview: v })} label="文件列表自动预览" desc="在文件列表展示用途、所属软件与删除建议。" />
              <Toggle on={settings.showSafeCleanHint} onChange={(v) => set({ showSafeCleanHint: v })} label="清理前安全提示" desc="每次执行删除前显示安全与风险提示。" />
            </>
          )}
          {GROUPS.has("scan") && (
            <>
              <SectionTitle title="扫描设置" desc="扫描与文件分析的参数" />
              <div className="setting-row">
                <div className="setting-row-main">
                  <div className="setting-label">大文件阈值</div>
                  <div className="setting-desc">超过该大小（MB）的文件在列表中高亮并归类为大文件。</div>
                </div>
                <div className="setting-control">
                  <input type="number" min={10} max={1024} value={settings.largeFileMb}
                    onChange={(e) => set({ largeFileMb: Math.max(10, Math.min(1024, Number(e.target.value) || 100)) })} />
                </div>
              </div>
              <Toggle on={settings.autoPreview} onChange={(v) => set({ autoPreview: v })} label="深度解析文件用途" desc="为每个文件分析用途、所属软件和删除建议（默认开启）。" />
            </>
          )}
          {GROUPS.has("ai") && (
            <>
              <SectionTitle title="AI 分析" desc="文件用途分析使用的大模型服务（仅传元信息，不上传文件内容）" />

              {/* 供应商预设 */}
              <div className="setting-row">
                <div className="setting-row-main">
                  <div className="setting-label">供应商预设</div>
                  <div className="setting-desc">选择预设后自动填充端点与默认模型，只需补充 API Key。</div>
                </div>
                <div className="setting-control" style={{ width: 240 }}>
                  <select value={presetId} onChange={(e) => applyPreset(e.target.value)} style={{ width: "100%" }}>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 端点 */}
              <div className="setting-row">
                <div className="setting-row-main">
                  <div className="setting-label">API 端点</div>
                  <div className="setting-desc">OpenAI 兼容的 chat/completions 接口地址。</div>
                </div>
                <div className="setting-control" style={{ width: 360 }}>
                  <input type="text" style={{ width: "100%" }} value={aiEndpoint}
                    onChange={(e) => setAiEndpoint(e.target.value)}
                    placeholder="https://api.openai.com/v1/chat/completions" />
                </div>
              </div>

              {/* 模型 */}
              <div className="setting-row">
                <div className="setting-row-main">
                  <div className="setting-label">模型</div>
                  <div className="setting-desc">用于文件用途分析的模型名称。</div>
                </div>
                <div className="setting-control" style={{ width: 240 }}>
                  <input type="text" style={{ width: "100%" }} value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)} placeholder="gpt-4o-mini" />
                </div>
              </div>

              {/* Key */}
              <div className="setting-row">
                <div className="setting-row-main">
                  <div className="setting-label">API Key</div>
                  <div className="setting-desc">
                    仅保存在本机配置文件，不写入数据库、不上传。
                    {ai?.has_api_key ? ` 当前已配置：${ai.api_key_hint}` : " 当前未配置。"}
                  </div>
                </div>
                <div className="setting-control" style={{ width: 280 }}>
                  <input type="text" style={{ width: "100%" }} value={aiKey}
                    onChange={(e) => setAiKey(e.target.value)} placeholder="留空则保持现有 Key 不变" />
                </div>
              </div>

              {/* 操作区 */}
              <div className="settings-footer">
                <button className="btn" onClick={testAi} disabled={testBusy}>
                  {testBusy ? "测试中…" : "测试连接"}
                </button>
                <button className="btn primary" onClick={saveAi} disabled={aiBusy}>
                  {aiBusy ? "保存中…" : "保存配置"}
                </button>
              </div>

              {testResult && (
                <div className={`notice ${testResult.ok ? "ok" : "error"}`} style={{ marginTop: 12 }}>
                  {testResult.ok ? `✓ ${testResult.message}` : `✕ ${testResult.message}`}
                </div>
              )}
              {aiMsg && <div className="notice info" style={{ marginTop: 12 }}>{aiMsg}</div>}

              <div className="ai-privacy">
                隐私说明：AI 分析只发送文件的<strong>路径、扩展名、大小、时间、所在目录、数字签名发布者</strong>等元信息，绝不读取或上传文件内容本身。
              </div>
            </>
          )}
          {GROUPS.has("safety") && (
            <>
              <SectionTitle title="安全设置" desc="删除行为与系统保护" />
              <Toggle on={settings.restorePointOnDelete} onChange={(v) => set({ restorePointOnDelete: v })} label="删除前创建系统还原点" desc="默认关闭。开启后删除前尝试创建还原点（需要管理员权限）。" warn />
              <Toggle on={settings.allowPermanentDelete} onChange={(v) => set({ allowPermanentDelete: v })} label="允许永久删除" desc="默认关闭。开启后高级选项中才可勾选永久删除（不进回收站）。" warn />
              <div className="setting-row">
                <div className="setting-row-main">
                  <div className="setting-label">系统保护目录</div>
                  <div className="setting-desc">Windows、Program Files、ProgramData 等目录始终锁定，UI 置灰、后端拒绝删除，不可关闭。</div>
                </div>
                <div className="setting-control"><span className="badge badge-system">已锁定</span></div>
              </div>
            </>
          )}
          {GROUPS.has("about") && (
            <>
              <SectionTitle title="关于" />
              <div style={{ padding: "6px 0" }}>
                <div className="setting-label">磁盘清理助手 v{__APP_VERSION__}</div>
                <div className="setting-desc" style={{ marginTop: 8, lineHeight: 1.7 }}>
                  深度文件分析 + AI 辅助 + 安全回收站删除，所有数据留在本机。
                  <br />架构：Electron + React + TypeScript + Python FastAPI（本地 127.0.0.1 通信、自动端口）。
                </div>
              </div>

              {/* 软件更新（electron-updater）：状态源与标题栏更新方块一致 */}
              <div className="setting-row" style={{ borderTop: "1px solid var(--border)", marginTop: 18, paddingTop: 16 }}>
                <div className="setting-row-main">
                  <div className="setting-label">软件更新</div>
                  <div className="setting-desc" style={{ lineHeight: 1.6 }}>
                    {update.phase === "idle" && "发现新版本后会自动下载，点击标题栏的更新方块即可重启安装。"}
                    {update.phase === "checking" && "正在检查最新版本…"}
                    {update.phase === "latest" && `已是最新版本 v${update.current}。`}
                    {update.phase === "available" && `发现新版本 v${update.latest}，正在准备下载…`}
                    {update.phase === "downloading" && `正在下载 v${update.latest} … ${(update.percent ?? 0).toFixed(1)}%`}
                    {update.phase === "ready" && `v${update.latest} 已下载完成，点击标题栏的更新方块完成安装。`}
                    {update.phase === "error" && <span style={{ color: "var(--danger, #e5484d)" }}>{update.error}</span>}
                  </div>
                </div>
                <div className="setting-control">
                  <button
                    className="btn"
                    onClick={checkUpdate}
                    disabled={update.phase === "checking" || update.phase === "downloading"}
                  >
                    {update.phase === "checking" ? "检查中…" : "检查更新"}
                  </button>
                </div>
              </div>
            </>
          )}
      </div>
    </div>
  );
}
