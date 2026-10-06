import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useTheme } from "../hooks/useTheme";
import type { AiConfig, AiPreset, AiTestResult } from "../types";
import { useUpdater } from "../store/updater";
import { patchSettings, useSettings } from "../store/settings";
import { errMsg } from "../utils/errMsg";


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

  // ---- AI 配置 ----
  const [ai, setAi] = useState<AiConfig | null>(null);
  const [presets, setPresets] = useState<AiPreset[]>([]);
  const [presetId, setPresetId] = useState("custom");
  const [aiEndpoint, setAiEndpoint] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);
  const [testBusy, setTestBusy] = useState(false);

  // AI 区块的读取状态：以前两处 .catch(() => {}) 把失败全吞了，
  // 用户看到的是一个空白的 AI 设置区，分不清"没配过"和"后端没答上来"。
  const [aiLoading, setAiLoading] = useState(true);
  const [aiLoadErr, setAiLoadErr] = useState<string | null>(null);

  const loadAi = useCallback(async () => {
    setAiLoading(true);
    setAiLoadErr(null);
    // 预设列表失败不单独拦：它只影响下拉候选，端点仍可手填，但原因要说出来
    const [cfgRes, presetRes] = await Promise.allSettled([api.aiConfig(), api.aiPresets()]);
    if (cfgRes.status === "fulfilled") {
      const c = cfgRes.value;
      setAi(c);
      setAiEndpoint(c.endpoint);
      setAiModel(c.model);
    }
    if (presetRes.status === "fulfilled") setPresets(presetRes.value.items);
    const failure = [cfgRes, presetRes].find((r) => r.status === "rejected") as
      PromiseRejectedResult | undefined;
    setAiLoadErr(
      cfgRes.status === "rejected"
        ? errMsg(cfgRes.reason)
        : failure
          ? "供应商预设读取失败：" + errMsg(failure.reason)
          : null,
    );
    setAiLoading(false);
  }, []);

  useEffect(() => { void loadAi(); }, [loadAi]);

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
      setAiMsg({
        text: c.configured ? "AI 配置已保存" : "配置已保存（尚未填写 Key，分析功能不可用）",
        ok: true,
      });
    } catch (e) {
      // 后端 400（端点不合法）/500（写盘失败）都是"没保存上"，
      // 必须用失败样式说清楚，不能显示成一条中性提示。
      setAiMsg({ text: "保存失败：" + errMsg(e), ok: false });
    } finally {
      setAiBusy(false);
    }
  };

  const clearKey = async () => {
    setAiBusy(true);
    setAiMsg(null);
    try {
      const c = await api.aiSetConfig({
        endpoint: aiEndpoint, model: aiModel, api_key: "", clear_key: true,
      });
      setAi(c);
      setAiKey("");
      setAiMsg({ text: "已清除本机保存的 API Key", ok: true });
    } catch (e) {
      setAiMsg({ text: "清除失败：" + errMsg(e), ok: false });
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
      setTestResult({ ok: false, message: errMsg(e) });
    } finally {
      setTestBusy(false);
    }
  };

  const set = patchSettings;

  // 更新状态与订阅统一由 UpdaterProvider 持有（标题栏方块与设置页共用同一状态源）

  return (
    <div className="tool settings">
      <div className="panel settings-body">
    <SectionTitle title="通用" desc="界面显示与交互偏好" />
    <Toggle
      on={theme === "dark"}
      onChange={toggleTheme}
      label="深色模式"
      desc="开启后切换为深色界面；关闭后使用浅色界面。"
    />
    <Toggle on={settings.autoPreview} onChange={(v) => set({ autoPreview: v })} label="文件列表自动预览" desc="在文件列表显示「用途 / 所属软件 / 删除建议」三列；关闭只是收起列，不影响扫描时的分析。" />
    <Toggle on={settings.showSafeCleanHint} onChange={(v) => set({ showSafeCleanHint: v })} label="清理前安全提示" desc="每次执行删除前显示安全与风险提示。" />
    <SectionTitle title="扫描设置" desc="扫描与文件分析的参数" />
    <div className="setting-row">
      <div className="setting-row-main">
        <div className="setting-label">大文件阈值</div>
        <div className="setting-desc">超过该大小（MiB）的文件在列表中高亮并归类为大文件。</div>
      </div>
      <div className="setting-control">
        {/* text+numeric 代替 number：Chromium 的数字输入依赖本地化资源，
            语言包缺失时会原生崩溃（设置页黑屏的根因），纯文本输入不依赖它 */}
        <input
          type="text" inputMode="numeric" className="large-file-mb" value={settings.largeFileMb}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            set({ largeFileMb: Math.max(10, Math.min(1024, Number(digits) || 100)) });
          }}
        />
      </div>
    </div>
    {/* 与「通用 → 文件列表自动预览」是同一个开关，两处并排会让用户以为
        能分别控制（拨一个另一个跟着跳）。只留通用那一处。 */}
    <SectionTitle title="AI 分析" desc="文件用途分析使用的大模型服务（仅传元信息，不上传文件内容）" />

    {aiLoading ? (
      <div className="notice" role="status">正在读取 AI 配置…</div>
    ) : aiLoadErr ? (
      <div className="notice error" role="alert">
        AI 配置读取失败：{aiLoadErr}
        <button className="btn small" style={{ marginLeft: 10 }} onClick={() => void loadAi()}>重试</button>
      </div>
    ) : ai?.config_warning ? (
      <div className="notice error" role="alert">{ai.config_warning}</div>
    ) : null}

    {/* 供应商预设 */}
    <div className="setting-row">
      <div className="setting-row-main">
        <div className="setting-label">供应商预设</div>
        <div className="setting-desc">选择预设后自动填充端点与默认模型，只需补充 API Key。</div>
      </div>
      <div className="setting-control" style={{ width: 240 }}>
        {/* 预设取不到时以前是个空下拉：value="custom" 无对应 option，选中态显示空白，
            用户以为"没预设"。这里始终留一条「自定义」兜底，并给控件可访问名。 */}
        <select
          value={presetId}
          onChange={(e) => applyPreset(e.target.value)}
          style={{ width: "100%" }}
          aria-label="供应商预设"
        >
          <option value="custom">自定义</option>
          {presets.filter((p) => p.id !== "custom").map((p) => (
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
        <input type="text" aria-label="API 端点" style={{ width: "100%" }} value={aiEndpoint}
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
        <input type="text" aria-label="模型名" style={{ width: "100%" }} value={aiModel}
          onChange={(e) => setAiModel(e.target.value)} placeholder="gpt-4o-mini" />
      </div>
    </div>

    {/* Key */}
    <div className="setting-row">
      <div className="setting-row-main">
        <div className="setting-label">API Key</div>
        <div className="setting-desc">
          只保存在本机，不写入数据库、不上传。
          {ai?.has_api_key
            ? `当前已配置：${ai.api_key_hint}（${
                ai.key_storage === "dpapi"
                  ? "Windows 用户级加密，换用户或换机器需重新配置"
                  : "未能加密保存，任何本机进程都可读取"
              }）`
            : "当前未配置。"}
        </div>
      </div>
      <div className="setting-control" style={{ width: 280 }}>
        <input type="text" aria-label="API Key" style={{ width: "100%" }} value={aiKey}
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
      {/* 留空保存是"不改 Key"（后端契约），所以清除必须是显式动作 */}
      {ai?.has_api_key && (
        <button className="btn" onClick={clearKey} disabled={aiBusy}>清除 Key</button>
      )}
    </div>

    {testResult && (
      <div className={`notice ${testResult.ok ? "ok" : "error"}`} style={{ marginTop: 12 }}>
        {testResult.ok ? `✓ ${testResult.message}` : `✕ ${testResult.message}`}
      </div>
    )}
    {aiMsg && (
      <div className={`notice ${aiMsg.ok ? "info" : "error"}`} role={aiMsg.ok ? "status" : "alert"} style={{ marginTop: 12 }}>
        {aiMsg.text}
      </div>
    )}

    <div className="ai-privacy">
      隐私说明：AI 分析只发送文件的<strong>路径、扩展名、大小、时间、所在目录、数字签名发布者</strong>等元信息，绝不读取或上传文件内容本身。
    </div>
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
      </div>
    </div>
  );
}
