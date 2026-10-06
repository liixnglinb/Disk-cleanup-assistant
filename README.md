# 🧹 磁盘清理助手 · Disk Cleanup Assistant

<div align="center">

[![Release](https://custom-icon-badges.demolab.com/github/v/release/liixnglinb/Disk-cleanup-assistant?style=flat-square&logo=tag&label=%E6%9C%80%E6%96%B0%E7%89%88&labelColor=0d1117&color=2da44e)](https://github.com/liixnglinb/Disk-cleanup-assistant/releases)
[![Stars](https://custom-icon-badges.demolab.com/github/stars/liixnglinb/Disk-cleanup-assistant?style=flat-square&logo=star&labelColor=0d1117&color=f4a340)](https://github.com/liixnglinb/Disk-cleanup-assistant/stargazers)
[![Last Commit](https://custom-icon-badges.demolab.com/github/last-commit/liixnglinb/Disk-cleanup-assistant?style=flat-square&logo=git&labelColor=0d1117&color=5898ff)](https://github.com/liixnglinb/Disk-cleanup-assistant/commits)

</div>

> 一个 Windows 桌面**磁盘清理专用工具**：Electron + React + TypeScript 前端，Python FastAPI 后端，
> 通过 `127.0.0.1` 本地 HTTP 通信。扫描全盘文件，按用途智能分类并给出删除建议，
> 勾选后安全移入回收站释放空间——所有数据都留在本机。
>
> **A Windows desktop disk-cleanup tool** — Electron + React + TypeScript frontend with a Python
> FastAPI backend talking over local `127.0.0.1` HTTP. Scans the whole drive, classifies files by
> purpose, and frees space by moving user-selected files to the Recycle Bin. All data stays local.

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

## 界面外壳与信息架构（2026-10-03 重构，方案二「克制专业风」）
```
Electron 窗口（titleBarStyle: hidden + 系统绘制按钮 overlay，高 64px）
├── 标题栏 64px（一行内）：品牌 · 当前工作区名 · 盘符选择 + 开始/暂停扫描 + 真实进度
│                        · 目录百科抽屉 · 删除日志抽屉 · 更新方块 · 主题 · 系统按钮
├── 左侧导航栏 48px（纯图标 + 悬停 tooltip）：概览 / 清理 / 软件 / 设置
│   ├── 概览   —— 唯一英雄位「可释放 X GB」+ 主 CTA，其余降为次级元数据
│   ├── 清理   —— 分段容器：缓存 / 文件 / 重复 三个来源
│   ├── 软件   —— 已装软件 + 残留
│   └── 设置   —— 单栏全展开（通用/扫描/AI/安全/关于），无内层侧栏
└── 右侧抽屉（420px，z-index 90）：删除日志、目录百科
    目录百科不再是并列页签，而是与缓存/文件同源的知识视图

后端：backend/platform.py 资源注册中心（ToolSpec / 自动发现）
      backend/tools/<tool>.py 每个工具一个后端模块；GET /api/tools 列出已注册工具
      （注：前端的工具注册机制 src/tools/registry.tsx 已随产品收窄删除）
```

**统一确认流（Action Sheet）**：删除确认不再用居中模态框，改为**屏幕底部滑出**的面板
（`.modal-mask` 用 `align-items: flex-end`，560px 宽，只保留顶部圆角）。理由：居中模态把
按钮摆在视线正中，用户容易反射性点「确定」；底部动作区落在拇指可达区，配合实心红
危险按钮与 `is-danger` 顶部描边，让危险等级在读文字之前就成立。动作区 `position: sticky`，
清单再长（删 2 万个文件）按钮也始终可点。

**数据网格（DataTable）**：`src/components/DataTable.tsx` 抽出与业务无关的网格机制 ——
虚拟滚动、**Sticky 表头**、触底分页节流。`FileTable` 只提供列定义与行渲染。
表头必须与滚动内容同处一个滚动容器，`position: sticky` 才会相对该容器吸附；
放在容器外只会相对页面吸附，列表一滚就跟着跑。240 万文件下只渲染可视区 ±8 行。

**设计 token**（`src/styles/global.css`，设计系统 v9）：完全采用方案二数值。Light 底
`#F9F9F9` / 面板 `#FFFFFF`；Dark 底 `#121212` / 面板 `#1E1E1E`。语义色四轴
`--primary #6366F1` / `--ok #10B981` / `--warn #F59E0B` / `--danger #EF4444`
（暗色各自提亮一档）。字号 7 档 `--fs-xs 11 / --fs-table 12 / --fs-base 13 / --fs-md 14 /
--fs-lg 16 / --fs-xl 20 / --fs-hero 40`。圆角控件 6 / 面板 12。

> **两处有意偏离方案**（代码内均有注释）：
> 1. Dark 的 `--text-dim` 由 `#6B7280` 上调到 `#8A8F98` —— 前者在 `#121212` 上仅 4.1:1，
>    低于 WCAG AA 正文 4.5:1，而它承载路径与元信息等小字。
> 2. 浅色下的 `--ok` / `--warn` 约 2.3:1 / 2.0:1，同样不达标，因此语义色**只用于色块、
>    描边与图标**，不得单独承载小字号文字；文字标签一律搭配 `--text` 系中性色。
>
> **已移除 `voyra-ui.css` 覆盖层**（连同 `voyra-foundation.css`、`voyra-software-base.css`）：
> 那三个文件用 `:root` 重定义令牌（`--primary:#6650a4`、`--nav-rail-w:240px`、`--fs-base:14px`…）
> 并另写一套 `.file-row` 网格模板，在 `main.tsx` 里最后加载，会把上面这套令牌整体覆盖回去。
> 其中不依赖 `--vr-*` 且本软件在用的布局修正已迁入 `components.css` 末尾的迁移块。

`color-scheme` 按主题分别声明，保证原生控件（输入框、复选框、下拉）跟随深浅色。
`prefers-reduced-motion` 下 Action Sheet 的位移动画降级为纯透明度渐变。

**概览 Bento 布局**：非对称两栏（`2fr / 1fr`）—— Hero 占左侧 2/3，背景是**用真实容量值
做的巨大半透明水印**（`opacity 4.5%`，`position:absolute` 退出文档流）；数字由
`useFluidNumber`（rAF + easeOutExpo）做流体滚动。右侧「分类占比」把分类字节数转成彩色
刻度线，按索引 `45ms` 递增延迟形成 Stagger 入场，**行本身不加边框与背景** —— 刻度线已经
表达了"占多少"，再加容器是双重编码。点击任一分类直接带筛选跳进清理工作区。

> 水印必须是绝对定位：作为 flex 子项时它会占满容器宽度，把 `.hero-main` 挤成 0 宽，
> 中文会逐字竖排（每行一个字）。装饰性内容一律 `position:absolute` + `pointer-events:none`。

**软件卡手风琴**：整卡可点，原地平滑展开残留文件树，`grid-template-rows: 0fr → 1fr`
过渡（不用 `max-height` —— 残留可能有几百条，用 `max-height` 只能拍一个猜出来的数）。
同一时刻只展开一张卡（手风琴语义就是互斥）。展开后右下角才浮现「一键卸载 / 扫描残留」，
收起时清掉残留结果，避免下次展开看到上次的残留而误以为是新扫出来的。卡片顶部有 1px
软件主色高光线，取不到图标主色时退回按名称哈希的稳定色（同一软件每次颜色一致）。
闲置卡（半年未用）用虚线边框，但**展开时改回实线** —— 虚线与主色边框语义会打架。

**浮动更新胶囊**：从标题栏搬到**右下角常驻**（`.update-capsule`，`z-index:95`）。
标题栏是窗口拖拽区 + 系统按钮避让区，在那里放一个会变的方块既抢注意力又容易在拖窗口时误点。
`idle / checking / latest / error` 四态不渲染任何东西 —— 一个"没有更新"的胶囊不该长期占屏。
点击展开 Release Notes 阅读面板，点别处或 Esc 收起；`ready` 态点击直接进安装确认。

> 胶囊与 Toast 曾同占右下角（都是 `right/bottom ≈ 18~20px`），Toast 会把胶囊压住。
> 两者都是"系统级通知"，正确做法是沿垂直方向分层：胶囊贴底常驻，Toast 用
> `transform: translateY(-76px)` 让位，并用 `:not(:has(.update-capsule))` 在胶囊不存在时
> 自动取消让位。`:has()` 在 Electron 33（Chromium 130）已支持。

**自动更新**：进软件自动检测 → 自动下载（标题栏方块显示进度，无下载箭头）→
悬停看版本与发布说明 → **下载完成后**点击方块 → 「是否现在更新并重启？」→ 确认后静默安装并重启。
渠道按实测吞吐择优（两阶段：探 `latest.yml` 取资产名 → 对安装包做 256KB `Range` 采样），
全部失败时按默认顺序回退。详见「自动更新」一节。

## 运行（开发）

环境要求（实测）：Windows x64、Node.js 22 或 24（本机 24.16.0，CI 用 22）、Python 3.12
（本机 3.12.10）。仓库没有 `.nvmrc` / `.python-version`，以本节为准。

```powershell
py -3.12 -m venv .venv          # 本机裸 python 不在 PATH，用 py 或写全路径
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
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
`dist` 串了三步：`build:renderer` → `build:backend`（PyInstaller）→ `build:installer`。
最后一步前先跑 `node scripts/check_backend_fresh.mjs`：只要 `backend_dist` 里的 exe 比任何
后端源码旧，就直接失败。**别绕过它单独 `npx electron-builder`** —— 那会把上周打好的后端
原封不动装进新版本安装程序：版本号是新的、后端是旧的、而且一声不响（本机真出现过
0.5.6 界面配 0.5.1 后端）。确实要分步，顺序必须是：

```powershell
npm run build:renderer
npm run build:backend        # 重新打后端，不要复用 backend_dist 里的旧 exe
npm run build:installer      # 内含新鲜度闸门
```

## 自动构建（GitHub Actions）

`.github/workflows/build.yml` 在 `windows-latest` 上的顺序是：`npm ci` → 更新链路单测
（`npm test`）→ 装 Python 依赖 → 版本号一致性 → 后端 pytest → 前端 typecheck+构建 →
PyInstaller 后端 → **后端 exe 新鲜度闸门** → electron-builder NSIS → **产物三件套断言**
（exe / blockmap / latest.yml 必须齐，且 latest.yml 声明的版本、path、体积与真实 exe 一致）
→ 上传 artifact。提供两条路径：

- **发版**：推送 `v*` 形式的 tag，构建成功后安装包自动附到对应 Release。
  资产名固定为 ASCII 的 `DiskCleanup-Setup-<version>.exe`，与软件内 electron-updater
  的更新源、下载页的动态版本脚本三者的约定保持一致。
- **验证**：在 Actions 页手动触发 `workflow_dispatch`，只产出 artifact 供下载试用，
  不触碰 Release。

打包步骤显式带 `--publish never`（Release 由后面的 `action-gh-release` 上传），避免
electron-builder 自己按 publish 配置去推。`package.json` 里那条 `gh-proxy.com` 地址是软件内
electron-updater 读 `latest.yml` 的更新源，不是占位符，别删。

构建前执行 `python scripts/check_versions.py` 校验 7 处版本号是否一致；tag 构建还会
校验 tag 与代码版本是否匹配，不一致直接中断。本地发版前可用 `npm run check:versions` 自查。

## 自动更新（electron-updater）

使用 electron-builder 官方配套的 **electron-updater**。官方在 Windows 上仅支持 NSIS 目标，
便携版（portable）不支持自动更新，因此分发形态确定为 **NSIS 用户级安装**
（`perMachine: false`，默认装到 `%LOCALAPPDATA%\Programs\`，无需管理员权限）。

用户体验：首次双击安装包装一次，之后所有更新都在软件内完成 ——
启动后主进程自动检查（含渠道测速），发现新版本**立即自动下载**：标题栏右端出现 28×28 的更新方块，
下载中显示百分比进度环，悬停方块可查看版本号、发布日期与发布说明（过长可在浮层内滚动）。
**下载完成后**点击方块 → 弹出「是否现在更新并重启？」→ 确认后由 `quitAndInstall(true, true)`
静默安装并重启，不弹安装向导，等同原地更新。多份检查（渲染层补查、主进程启动检查）由主进程的
去重闸门收敛成"同一版本只下载一次"；`autoInstallOnAppQuit` 为 `false` —— **退出时不会静默安装**，
必须由用户在方块上确认。「设置 → 关于」显示的状态文案与方块同源，那里的「检查更新」按钮只做手动复查。

**发布新版本必须上传 `latest.yml`**（连同 `*.blockmap`）：electron-updater 靠它比对版本、
定位安装包并做增量下载；只上传 `.exe` 会导致更新检查直接失败。

**更新源**：`package.json` 的 `publish` 为 generic provider，指向
`https://gh-proxy.com/<GitHub releases/latest/download>` —— 国内网络无法直连 `api.github.com`
与 `github.com`，必须经镜像才可达。每次检查前主进程都会按测速结果重设 feed，候选渠道见
`electron/feeds.js` 的 `FEEDS`（gh-proxy → ghfast.top → github 直连；测速全失败时按此顺序回退）。

本地调试：`main.js` 在 `!app.isPackaged` 时打开 `autoUpdater.forceDevUpdateConfig`，项目根的
`dev-app-update.yml`（已 gitignore）是官方 dev 通道的配置文件。但**开发模式无法端到端验证更新
链路**：`checkWithFallback()` 每次检查前都会 `setFeedURL`，electron-updater 一旦设过 feed 就不再读
`dev-app-update.yml`；叠加 `isPackaged === false` 时 `update:check` 与启动静默检查都会提前返回，
开发模式只会显示"开发模式下不检查更新"。更新链路的真实验收只能在打包产物上做。

## 测试

发版门禁 = 下面全绿（当前实测：后端 85 项、更新链路 13 项、typecheck 与生产构建通过）。

```powershell
npm run test:all                 # 更新链路单测 + 后端 85 项（含越权守卫与加固回归）
npm run test:e2e                 # 真实 Electron 冒烟：10 项断言，接口全打桩，不碰真盘
node scripts/e2e-smoke.mjs --block-ai   # 同上，改走"AI 配置读取失败"的错误路径
npm run typecheck                # 前端类型检查
npm run build:renderer           # 前端生产构建
npm run check:versions           # 版本号一致性自检（发版前，7 处落点）
```

`test:backend` 与 `check:versions` 走 `.venv\Scripts\python.exe`（本机裸 `python` 不在
PATH）；CI 由 `setup-python` 提供解释器，直接调 `python`。
`scripts/e2e-smoke.mjs` 拦掉全部 `/api/**` 用桩数据跑，`scripts/smoke_packaged.py` 只做
健康检查 —— 两者都不会真的扫描、删除或卸载任何东西。
## 目录结构与数据流（接手先看这里）

```
electron/                 主进程
  main.js                 起后端 → 建窗口 → 装配更新器 → 退出收尾
  backend_runner.js       选端口、拉起后端 exe、健康等待、stderr 落盘
  feeds.js               更新渠道 + latest.yml 解析 + Release 正文降级纯文本（可单测）
  update_probe.js         渠道测速：探 latest.yml 拿资产名 → 对安装包做 Range 采样
src/                      React 渲染层（Vite 打包 → dist/）
  api/client.ts           唯一后端出口：鉴权头、超时、下载型端点
  store/                  ScanContext（扫描状态机）/ updater（更新状态机）/ settings / ToastContext
  components/             面板；DataTable.tsx 是虚拟滚动网格外壳（列模板与 CSS 两处同步）
backend/                  FastAPI 后端（PyInstaller 打成单 exe）
  main.py                 装载路由、本地 token 中间件、lifespan
  platform.py             工具发现与路由装载（装出 0 条路由会直接抛错）
  core/scanner.py         扫描 + 会话 SQLite(WAL) + 删除前溯源 + 保留清理
  core/secure_store.py    DPAPI 封装，AI Key 不落明文
  api/routes_*.py         11 个前缀 / 29 个端点
  tests/                  pytest（越权守卫 + 加固回归）
scripts/                  构建、版本自检、后端打包、冒烟与 E2E
```

数据流：渲染层 `fetch http://127.0.0.1:<随机端口>` 带 `X-DCA-Token` 头 → FastAPI 路由 →
`core` 业务模块 → 会话 SQLite。主进程与渲染层只通过 preload 暴露的 `window.dca` 通信。
**进程职责**：后端只做机制（扫描/分类/删除/审计），一切"用户是否确认"的判断在界面；
删除白名单由后端裁决（只有扫描在册且未锁定的路径才允许删），不依赖界面诚实。

## 运行时数据位置

`%APPDATA%\disk-cleanup-assistant\`

| 文件 | 作用 |
|---|---|
| `scans/<12位hex>.db`（含 `-wal`/`-shm`） | 一次扫描一个库；启动时回收 7 天前的与孤儿 sidecar |
| `ai_config.json` | AI 配置；Key 以 `dpapi:` 前缀存 Windows 用户级密文 |
| `deletion_log.jsonl` | 删除审计，界面「删除日志」与 CSV 导出的数据源 |
| `backend_stderr.log` | 后端 traceback，排查 500 从这里看 |

卸载**不会**删这个目录（`deleteAppDataOnUninstall: false`）——清理记录属于用户资产。
环境变量：`DCA_API_TOKEN`（主进程注入；单独跑后端时为空＝不鉴权）、
`DISK_CLEANUP_LOG_DIR`（测试/排障改数据目录）、`ELECTRON_START_URL`（dev 指向 vite）；
签名相关见 `.env.example`。

## FAQ（真踩过的）

- **点「更新并重启」没升级？** 更新安装只认静默参数（`quitAndInstall(true, true)`）；
  若弹出让点「下一步」的安装向导，等于没升级。开发模式恒不检查更新，更新链路只能在
  打包产物上验收。
- **界面一片空白 / 每个面板都空？** 先看 `/api/health` 的 `routers` 与 `load_errors`
  （正常 29 / 0）。工具路由装载失败会直接启动报错，不再"200 但没接口"。
- **后端报 500 怎么查？** 看 `%APPDATA%\disk-cleanup-assistant\backend_stderr.log`
  （dev 下后端不再丢弃 traceback）。
- **装完还是旧版本？** 检查是否装到了旧安装包：`release\` 里可能留着历史产物。
  本地重新出包只认 `npm run dist`，它会先重打后端并做新鲜度闸门。
- **安装程序提示"未知发布者"？** 当前 CI 不做代码签名，需要正规 OV/EV 证书或
  Azure Trusted Signing，见下一节；自签证书只能本地测试用。
- **更新为什么走 `gh-proxy.com`？** 直连 `github.com` 在部分网络下不可用；更新源与
  下载页链接都带镜像，且会在多个渠道间测速择优。

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
