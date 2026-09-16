# 🧹 磁盘清理助手 · Disk Cleanup Assistant

<div align="center">

[![Release](https://custom-icon-badges.demolab.com/github/v/release/liixnglinb/Disk-cleanup-assistant?style=flat-square&logo=tag&label=%E6%9C%80%E6%96%B0%E7%89%88&labelColor=0d1117&color=2da44e)](https://github.com/liixnglinb/Disk-cleanup-assistant/releases)
[![License](https://custom-icon-badges.demolab.com/github/license/liixnglinb/Disk-cleanup-assistant?style=flat-square&logo=law&labelColor=0d1117&color=8250df)](LICENSE)
[![Stars](https://custom-icon-badges.demolab.com/github/stars/liixnglinb/Disk-cleanup-assistant?style=flat-square&logo=star&labelColor=0d1117&color=f4a340)](https://github.com/liixnglinb/Disk-cleanup-assistant/stargazers)
[![Last Commit](https://custom-icon-badges.demolab.com/github/last-commit/liixnglinb/Disk-cleanup-assistant?style=flat-square&logo=git&labelColor=0d1117&color=5898ff)](https://github.com/liixnglinb/Disk-cleanup-assistant/commits)

</div>

> 一个 Windows 桌面「工具平台」：Electron + React + TypeScript 前端，Python FastAPI 后端，通过 `127.0.0.1` 本地 HTTP 通信。当前内置第一个工具：**磁盘清理助手**；以后可以不断加入更多工具，无需改动平台骨架。
>
> **A Windows desktop "tool platform"** — Electron + React + TypeScript frontend with a Python FastAPI backend talking over local `127.0.0.1` HTTP. Ships with its first tool, **Disk Cleanup Assistant**; more tools can be added without touching the platform skeleton.

[在线下载页](https://lxlrwxs.top/local-toolbox/) · [Releases](https://github.com/liixnglinb/Disk-cleanup-assistant/releases)

---

## 🌏 English

- **Safety first**: every deletion requires manual selection + a confirmation dialog; files go to the Recycle Bin (`send2trash`) by default, protected paths (`Windows`, `Program Files`, `ProgramData`…) are rejected twice (UI disabled + backend guard).
- **Smart cache cleanup**: a built-in knowledge base lists cache directories for browsers, chat apps, dev tools and system updates — each entry explains what it is, the impact of deleting it, and a recommendation/risk level.
- **Directory encyclopedia**: 75+ common Windows/software directories documented with purpose, attached-app info and deletion advice.

---

一个 Windows 桌面**磁盘清理专用工具**：Electron + React + TypeScript 前端，Python FastAPI 后端，
通过 `127.0.0.1` 本地 HTTP 通信。扫描全盘文件，按用途智能分类并给出删除建议，
勾选后安全移入回收站释放空间——所有数据都留在本机。

## 安全红线（已落实）
- 删除必须用户手动勾选 + 弹窗二次确认，后端不提供任何“自动删除”。
- 默认移入回收站（`send2trash`）；永久删除需额外勾选确认，且后端仍拒绝保护路径。
- `Windows` / `Program Files` / `Program Files (x86)` / `ProgramData` 等硬编码白名单：
  UI 置灰不可选（`is_locked`），后端 `delete_manager` 再次 `is_protected_path` 拒绝。
- 第一版只读注册表，不做任何写入/删除。
- 删除前默认不创建系统还原点。
- 所有测试仅在项目内专门测试目录进行。

## 磁盘清理助手：清理逻辑与目录百科（v2）
- **缓存清理**：`backend/core/cache_dirs.py` 从「清理知识库」提取本机存在的缓存目录
  （浏览器 / 聊天软件 / 开发工具 / 系统更新 / 显卡着色器等），每项携带
  `app`（所属软件）、`app_attached`（是否依附应用）、`description`（是什么）、
  `delete_impact`（删除影响）、`recommendation`（推荐/谨慎）、`risk`（风险）。
  动态额外探测浏览器 Code/GPU 缓存、微信 FileStorage 缓存、JetBrains 缓存等。
  **一键清理候选仅限「软件缓存 / 系统缓存 / 系统临时」三类**，绝不包含
  AppData 根、用户文件、聊天记录、系统核心（有测试锁定）。
- **目录百科**：`backend/core/cleanup_kb.py` 内置 75 条常见 Windows 系统/软件目录知识
  （用途说明 + 依附关系 + 删除建议 + 风险），前端「目录百科」页支持搜索 /
  按建议 / 分类 / 本机存在过滤。
- **新增 API**：`GET /api/kb/folders`、`GET /api/kb/categories`、
  `GET /api/cache/overview`、`GET /api/cache/candidates`（兼容旧字段）。
- **修复**：CORS 改用 `allow_origin_regex` 匹配 `localhost/127.0.0.1` 任意端口，
  修复 dev / Electron 开发模式下请求被 CORS 拦截的问题。

## v3 优化（2026-09）
- **目录百科入口恢复**：`src/tools/disk-cleanup/DiskCleanupTool.tsx` 重新挂载「目录百科」页签，
  内置 75 条目录知识（用途/是否依附应用/哪些建议删哪些不推荐）在前端可完整查看。
- **默认浅色**：`src/hooks/useTheme.tsx` 默认主题改为 light；`electron/main.js` 窗口
  `backgroundColor` 改为浅色 `#EEF1F6`，消除启动闪暗色。
- **设置项真正生效**（此前 5 项均为摆设）：
  - 「大文件阈值」：`scan/start` 接收 `large_file_mb`，`classifier.classify` / `file_analysis.analyze`
    按会话阈值归类「大文件」，前端高亮与「仅看 >N MB」筛选同步。
  - 「允许永久删除」：`ConfirmDialog` 读取设置，关闭时永久删除选项置灰并提示；
  - 「删除前创建还原点」：`delete_manager.create_restore_point()` 用 `Checkpoint-Computer`
    删除前尝试建还原点（需管理员，失败不阻断）；
  - 「清理前安全提示」「文件列表自动预览」分别控制确认弹窗文案与用途/所属软件两列显示。
- **exe 误锁修复**：`classifier` 系统扩展名（exe/dll/sys…）仅在与系统区域（Windows /
  Program Files / ProgramData）命中时锁定，用户下载/绿色软件的 exe 不再被误判为系统文件。
- **扫描性能**：`detect_owner` 注册表归属索引按首字符分桶（`_OWNER_BUCKETS`），
  从全量线性匹配降为 O(1) 定位桶内前缀匹配；新增 `_prune_old_scan_dbs()` 自动清理
  7 天前且不在活跃会话中的扫描库，防止 `%APPDATA%` 下 `scans/*.db` 无限堆积。
- **缓存统计提速**：`candidate_cache_dirs` 用线程池并行统计各目录大小 + 120s TTL 缓存，
  首次 26s→约 13s，二次请求秒回；清理成功后前端 `cacheOverview(true)` 强制刷新。
- **打开位置**：新增 `POST /api/system/reveal`，缓存清理 / 目录百科条目可一键在资源管理器定位。
- **重复文件检测**：加载期间显示「正在计算文件指纹」提示，避免长时间无反馈。
- **布局精修**：修复「文件列表自动预览」关闭时表格仍按 8 列渲染导致列宽错乱（新增
  `no-preview` 6 列模板）；修复 `.btn-mini-icon` 悬停引用未定义变量；主按钮阴影去掉
  暗色遗留的紫色残留；浅色主题 `--primary-grad` 改为纯蓝渐变（此前蓝紫混合）；
  文件列表高度自适应窗口（`min(540px, calc(100vh - 430px))`）；文件选中行加左侧
  强调条；设置页窄窗口下导航与正文纵向堆叠；大文件阈值文案（概览/文件列表）跟随
  设置动态显示，不再写死 100MB。
- 测试 37 个全绿（新增用户 exe 不误锁用例）。

## UI 设计系统 v7（taste-skill + impeccable 原则重构）
- 品牌紫（用户指定的 Meoo 紫 `#562AFF` / `#7C5DFF`）走"品牌色 override"路径，克制成体系：
  中性色全部向品牌紫相倾斜（微 chroma）、60-30-10 权重、单一圆角体系、4pt 语义间距 token。
- 去 AI 味：无渐变文字标题、无 `border-left` 状态条（改用背景浅色）、无纯黑/纯白基底、
  无 neon 外发光（激活态用 inset 边框）、无 em-dash。
- 动效：统一缓动 `cubic-bezier(0.16,1,0.3,1)`、只动 transform/opacity、`:active` 物理按压反馈、
  完整 `prefers-reduced-motion` 降级、骨架屏（`skeleton`）替代转圈。
- 首页为产品概览：欢迎条 + 真实数据统计卡（磁盘/容量/可用空间）+ 工具汇总网格 + 磁盘概览，
  `TOOL_ENTRIES` 注册新工具后自动出现。
- 品牌与版式参考来自早期 meoo 门户快照（素材已从本地清理，且长期在 `.gitignore` 中，不随仓库分发）。

## 自定义协议唤起（local-toolbox://）
- `electron/main.js`：单实例锁 + `app.setAsDefaultProtocolClient("local-toolbox")` + 二次启动聚焦窗口。
- `package.json` → `build.protocols` 声明 `local-toolbox`，NSIS 安装时注册协议关联，
  网页可一键唤起已安装的磁盘清理助手软件。
- 协议名沿用历史的 `local-toolbox`（技术标识，改动会破坏已安装用户的注册表关联）。

## 平台架构
```
Electron 外壳
├── 后端平台 backend/platform.py       资源注册中心（ToolSpec / 自动发现）
│   ├── backend/tools/<tool>.py        每个工具一个后端模块
│   └── GET /api/tools                 列出已安装工具
├── 前端平台 src/tools/registry.tsx    前端工具注册中心（懒加载）
│   ├── src/tools/<tool>/              每个工具一个前端面板
│   └── 首页仪表盘 / 通用导航（按注册表渲染）
└── 通用组件：主题、按钮、弹窗、表格、虚拟滚动
```

## 运行（开发）
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm install
node node_modules/esbuild/install.js
node node_modules/electron/install.js
npm run dev
```
单独跑后端：
```powershell
.\.venv\Scripts\python.exe scripts\run_dev.py --port=17650
```

## 打包
```powershell
npm run dist     # 前端 + 后端exe + NSIS 安装包 → release\
```
或分步：
```powershell
npm run build:renderer
powershell -ExecutionPolicy Bypass -File scripts\build_backend.ps1
npx electron-builder --win nsis
```

## 自动构建（GitHub Actions）

`.github/workflows/build.yml` 在 `windows-latest` 上依次执行
pytest → 前端 typecheck/构建 → PyInstaller 后端 → electron-builder NSIS，提供两条路径：

- **发版**：推送 `v*` 形式的 tag，构建成功后安装包自动附到对应 Release。
  资产名固定为 ASCII 的 `DiskCleanup-Setup-<version>.exe`，与软件内 electron-updater
  的更新源、下载页的动态版本脚本三者的约定保持一致。
- **验证**：在 Actions 页手动触发 `workflow_dispatch`，只产出 artifact 供下载试用，
  不触碰 Release。

打包步骤显式带 `--publish never`，避免 electron-builder 在 tag 构建时误用
`package.json` 里指向 `example.com` 的 publish 占位配置。

构建前执行 `python scripts/check_versions.py` 校验 10 处版本号是否一致；tag 构建还会
校验 tag 与代码版本是否匹配，不一致直接中断。本地发版前可用 `npm run check:versions` 自查。

## 自动更新（electron-updater）

使用 electron-builder 官方配套的 **electron-updater**。官方在 Windows 上仅支持 NSIS 目标，
便携版（portable）不支持自动更新，因此分发形态确定为 **NSIS 用户级安装**
（`oneClick: true` + `perMachine: false`，装到 `%LOCALAPPDATA%\Programs\`，无需管理员权限）。

用户体验：首次双击安装包装一次，之后所有更新都在软件内完成 ——
「设置 → 关于 → 软件更新」→ 检查更新 → 下载更新（带进度与速度）→ 重启并安装。
安装由 `quitAndInstall(true, true)` 静默执行，不弹安装向导，等同原地更新。

**发布新版本必须上传 `latest.yml`**（连同 `*.blockmap`）：electron-updater 靠它比对版本、
定位安装包并做增量下载；只上传 `.exe` 会导致更新检查直接失败。

**更新源**：`package.json` 的 `publish` 为 generic provider，指向
`https://gh-proxy.com/<GitHub releases/latest/download>` —— 国内网络无法直连 `api.github.com`
与 `github.com`，必须经镜像才可达。主源不可用时，主进程会依次回退到 `ghproxy.net` 与
GitHub 直连（见 `electron/main.js` 的 `UPDATE_FEEDS`）。

本地调试：`app.isPackaged` 为 false 时界面会提示"开发模式下不检查更新"；如需在开发模式
走通完整流程，可在项目根放一个 `dev-app-update.yml`（已 gitignore）。

## 测试
```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q     # 后端 37 个用例
npm run typecheck                                          # 前端类型检查
npm run build:renderer                                     # 前端生产构建
python scripts/check_versions.py                           # 版本号一致性自检（发版前）
python scripts/smoke_packaged.py                           # 打包后端 exe 健康检查
```
## 代码签名（Windows 分发）

> 说明：让 SmartScreen 不再弹“未知发布者”，必须使用正规 CA 的**代码签名证书**（OV/EV）。
> EV 证书额外还能快速建立信任。自签名证书只用于本地测试，**不能**用于公开发布。

### 你需要准备的
- 一块企业/个人 **代码签名证书**（DigiCert、Sectigo、GlobalSign 等），导出为 `.pfx` / `.p12`（建议 `SHA256 + RSA`，有效期越长越好并开启时间戳）。
- 证书私钥密码。**证书文件与密码绝不入库**（已加入 `.gitignore`）。

### 方式A：打包时自动签名（推荐）
设置环境变量后直接 `npm run dist`：

```powershell
$env:CSC_LINK = "C:\secure\certs\your-code-signing.pfx"
$env:CSC_KEY_PASSWORD = "你的证书密码"
npm run dist
```

### 方式B：对已打包产物补签
```powershell
# 默认签名 release\win-unpacked\DiskCleanupAssistant.exe + release\*-Setup-*.exe
npm run sign -- -CertFile C:\secure\certs\your-code-signing.pfx -CertPassword "你的证书密码"

# 或配好 .env 后：
powershell -ExecutionPolicy Bypass -File scripts\sign.ps1
```

签名脚本使用 SHA256 摘要 + RFC3161 时间戳（默认 DigiCert），并自动校验签名者与时间戳。

### 本地测试签名流程（可选）
生成一个仅用于验证 pipeline 的自签名证书：

```powershell
npm run gen:dev-cert
# 生成 build\certs\dev-selfsigned.pfx（密码 DevSign123!）
```

> 注意：该证书不被 Windows 信任，仅用来确认签名/时间戳链路正常。

### Azure Trusted Signing（云签名，私钥不落盘）
electron-builder 支持 Azure Trusted Signing：在 `package.json -> build.win` 增加
`azureSignOptions`（endpoint / codeSigningAccountName / certificateProfileName /
trustedSigningClientId 等），并从环境变量提供凭据即可。需要时我把配置写好。

---

### Azure Trusted Signing 详细用法

**优点**：微软官方云签名，私钥不出本地、不需要自己买 & 管理 pfx，天然适配 CI（GitHub Actions / Azure DevOps）。

#### 1) 准备 Azure 资源（只需一次）
1. 注册/登录 [Azure 门户](https://portal.azure.com)，需要**企业订阅**（Trusted Signing 属于 Azure 服务，需付费/试用量）。
2. 开通 **Microsoft Partner Center → 安全性 → 你的 Partner ID**（Trusted Signing 要求）。
3. 在 Azure 门户搜 **Trusted Signing** → 创建 **签名账户**，记下 `Endpoint`（形如 `https://wus2.codesigning.azure.net`）与 **账户名**。
4. 在签名账户里创建 **证书配置（Certificate Profile）**，记下 **配置文件名**。
5. 在 **Microsoft Entra ID** 注册一个应用（App Registration）：
   - 记下 **目录(租户)ID** 与 **客户端ID**
   - 为其创建 **客户端机密（Client secret）** 或客户端证书
   - 给该应用授予签名账户的 **Signer** 角色（Trusted Signing → 访问控制(IAM)）

#### 2) 在本地/CI 配置环境变量
把 `.env.azure.example` 复制为 `.env.azure`（本地）或把变量写入 CI Secrets：

```env
AZURE_TRUSTED_SIGNING_ENDPOINT=https://wus2.codesigning.azure.net
AZURE_TRUSTED_SIGNING_ACCOUNT=你的签名账户名
AZURE_TRUSTED_SIGNING_PROFILE=你的证书配置文件名
AZURE_TENANT_ID=你的租户ID
AZURE_CLIENT_ID=应用客户端ID
AZURE_CLIENT_SECRET=应用客户端机密
```

#### 3) 构建并自动签名
```powershell
# 一键：构建 + 生成 Azure 签名配置 + electron-builder 打包（自动调用 Invoke-TrustedSigning）
npm run dist:azure

# 仅校验环境变量是否齐全、能否生成 Azure 配置
npm run verify:azure-env
```

说明：electron-builder 会**自动安装** PowerShell 模块 `TrustedSigning`（首次需要联网）并调用 `Invoke-TrustedSigning` 完成 SHA256 + 时间戳签名，产物仍是 `release\DiskCleanup-Setup-<version>.exe`。

> 建议安装 **PowerShell 7（pwsh）**，Trusted Signing 在 pwsh 下最稳定；仅装了 Windows PowerShell 5.1 时也能自动回退使用。
