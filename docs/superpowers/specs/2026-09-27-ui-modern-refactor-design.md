# 磁盘清理助手 · UI 现代化深度重构设计

日期：2026-09-27 ｜ 目标版本：v0.4.0 ｜ 状态：待实现
参照系：**VS Code / GitHub Desktop 式专业工具**（用户 2026-09-27 选定）

---

## 0. 问题诊断（实测证据，非推测）

在 dev server（vite 5173 + 后端 17680，真实数据：2,412,561 文件已扫描、缓存 38 处 / 11.7 GB）
用 CDP 截图实测，确认界面显旧的根因不是配色，而是**条带堆叠 + 标题重复 + 无焦点**：

1. 内容出现前堆了 5 条横向带：系统标题栏 → Electron 默认菜单 → `.topbar`(48px)
   → `.statusbar`(30px) → `.tool-header` → `.tool-tabs-row`。
2. 那个"文件/编辑/视图/窗口/帮助"菜单**从来没人写过**：`electron/main.js:174` 的
   `BrowserWindow` 未设 `frame` / `titleBarStyle`，也未调 `Menu.setApplicationMenu`，
   看到的是 Electron 默认菜单。README 与 Voyra 文档 §7.1 声称的"无边框自绘 UI"为假。
3. 同一屏标题重复 4 次：`磁盘清理助手` → `磁盘清理`+说明句 → 页签 → 面板内再来
   一个大标题 + 一整段说明（该骨架在 7 个面板里被复制：CachePanel:103、
   KnowledgePanel:68、FactoryPanel:60、LogsPanel:30、DuplicatesPanel:62、
   SoftwarePanel:145、SettingsPanel:247）。
4. 9 个顶级页签中 4 个是同一件事（缓存/文件/重复/百科都是"找东西删"），
   2 个是次级信息（日志/关于），1 个定位漂移（出厂检测）。并列 9 项本身即无 IA 的证据。
5. 最值钱的数字（可释放 11.7 GB）在概览页完全不出现；概览反而显示"还没有扫描过磁盘"。

---

## 1. 范围

**目标**
- 自绘标题栏：品牌 + 工作区名 + 扫描控制 + 搜索 + 日志抽屉 + 主题，与窗口按钮同一行。
- 左侧 48px 图标导航栏取代 9 个横向页签；顶级入口收敛到 3 个工作区 + 设置。
- 建立焦点层级（唯一英雄位）、语义色系统、克制的材质语言。
- 高密度数据表基线（24px 行高 / 12px 字），批量操作常驻化。
- 抽出面板共性（骨架、设置订阅、确认弹窗），删除死代码与平台化遗留。
- 修掉 §9 列出的 6 个 bug。

**非目标（明确不做）**
- 不引入组件库、不引入 Tailwind、不改构建链。
- 不改任何后端判定逻辑：`classifier.py`、`cleanup_kb.py`、`cache_dirs.py`、
  `protected_paths.py`、`delete_manager.py` 的判定规则与 `PROTECTED_RELATIVE` 白名单一律不动。
  （例外：§8 新增 `backend/core/icon_map.py` 只做"缓存条目→注册表软件名"的图标匹配，
  不参与任何分类/风险/删除判定。）
- 不新增功能、不做 i18n、不做移动端/触屏适配。
- 不重排 §10 删除清单之外的 CSS。

---

## 2. 窗口外壳

### 2.1 配置（`electron/main.js`）

采用 `titleBarStyle: "hidden"` + `titleBarOverlay`，**不用 `frame: false`**。

依据：Electron 33 文档对 `frame:false` 下的 Aero Snap / Snap Layouts / Win+方向键 /
最大化遮任务栏 / 高 DPI 行为**零记载**（对 `browser-window.md`、
`structures/base-window-options.md`、`tutorial/custom-window-styles.md` 全文 grep
`snap|aero|dpi` 无命中）；GitHub Desktop 与 VS Code 在 frameless 下都需自补 3px/4px
缩放命中区。`titleBarOverlay` 保留原生 NC 区，吸附与缩放交给系统。

```js
new BrowserWindow({
  width: 1280, height: 820, minWidth: 980, minHeight: 640,
  title: "磁盘清理助手",
  titleBarStyle: "hidden",
  titleBarOverlay: { color: "#F7F7F5", symbolColor: "#16161A", height: 34 },
  backgroundColor: "#EFEFED",   // 跟随浅色 --bg，消除暗色启动闪白
  // 其余（icon/webPreferences）不变
})
```

- 原生 overlay 按钮区在 Windows 上占宽 `calc(138px / var(--zoom-factor))`（VS Code
  `titlebarpart.css:346`），右侧内容必须避让，用 `env(titlebar-area-x)` /
  `env(titlebar-area-width)` 兜底。
- overlay 颜色必须随主题切换：`theme` 变化时经 IPC 调 `win.setTitleBarOverlay({color, symbolColor, height:34})`。
  浅色 `{color:"#F7F7F5", symbolColor:"#16161A"}`，暗色 `{color:"#17181C", symbolColor:"#EDEEF1"}`。
- `backgroundColor` 也随主题重设，避免暗色启动闪白。

### 2.2 菜单（`electron/main.js`）

`Menu.setApplicationMenu(null)` 会连带移除 Windows 菜单栏。为保证标准编辑加速器不丢，
改为**保留一份极小 role 模板 + 隐藏菜单栏**：

```js
Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu" /*被忽略*/ , submenu: [
  { role: "undo" }, { role: "redo" }, { role: "cut" }, { role: "copy" },
  { role: "paste" }, { role: "selectAll" },
]}]))
win.setAutoHideMenuBar(true); win.setMenuBarVisibility(false)
```

role 自带 accelerator，因此 Ctrl+C/V/A 有保证；Alt 唤出菜单栏的行为随之消失（预期）。
`Menu.setApplicationMenu(null)` 是否连带失去 Ctrl+C/V 官方未写、未实测，故不采用该写法。

### 2.3 新增 IPC（`electron/preload.js` + `src/global.d.ts`）

窗口按钮由 overlay 原生绘制，无需 IPC；但自绘拖拽区需要自己处理双击最大化：

| 通道 | 方向 | 用途 |
|---|---|---|
| `win:toggle-maximize` | invoke | 标题栏双击 / 品牌区双击 |
| `win:set-titlebar-overlay` | invoke | 主题切换时同步 overlay 与 backgroundColor |
| `win:maximized-changed` | main→renderer | 最大化态变化，供图标切换 |

`DcaBridge`（`src/global.d.ts:26`）相应加 3 个方法签名，全部可选并在渲染侧做
`window.dca?.` 空值保护（浏览器直开 vite 时无 bridge）。

### 2.4 标题栏一行内的排布（`src/components/Shell.tsx` 重写）

```
[品牌◈] [工作区名] │ [盘符 ▾][开始/暂停扫描] [扫描进度 2.4M ▓▓░ 68%] │ ←拖拽弹性区→ │ [🔍][日志][主题] │ [原生 ─ □ ✕]
```

- 整条 `-webkit-app-region: drag`，其中所有可点控件与输入 `no-drag`（overlay 区吞指针事件）。
- 扫描进度取代原 `.statusbar`；错误/暂停/完成态改用 toast + 进度位变色。**独立状态栏整条删除。**
- 视觉横带从 5 条降到 2 条：标题栏(34) + 工作区头(40)。
- 顶栏盘符进度条（原 `TopbarDrives`）从标题栏移除，改放概览英雄区下方。

### 2.5 左侧导航栏（新 `src/components/NavRail.tsx`）

- 宽 **48px**（VS Code activity bar 实测 48px，`activitybarpart.css:8`），图标 20px。
- 激活态：左侧 2px 品牌色指示条 + `--primary-soft` 背景（**不用 `border-left` 粗条**，
  那是 README 明令禁止的写法，当前 SettingsPanel 违规）。
- 底部固定：设置项（与顶部工作区用一条 `--border` 分隔）。
- 不做悬停展开文字标签（YAGNI；48px 纯图标 + tooltip 足够）。

---

## 3. 信息架构：9 页签 → 3 工作区 + 设置 + 2 抽屉

| 新入口 | 图标 | 吃掉原来的 | 形态 |
|---|---|---|---|
| 概览 | chart | 概览 | 决策面板（英雄位 + 来源分解） |
| 清理 | eraser | 缓存清理 + 文件清理 + 重复文件 | 分段共表 + 检视抽屉 |
| 软件 | package | 软件管理（含残留） | 按占用体积排序的列表 |
| 设置 | settings | 设置 | 单栏分组，去掉内层侧栏 |
| 抽屉 A | log | 删除日志 | 标题栏唤出的右侧抽屉 |
| 抽屉 B | book | 目录百科 | 选中任意路径时右侧检视面板 + 全局搜索 |
| — | — | **出厂检测：整体删除** | 见 §10 |

**「清理」不是把三种数据硬塞进一张表**（三者数据形状不同：缓存是目录聚合、文件是行、
重复是组）。实现为：**同一套表格外壳 + 三个分段**，共享选择集、批量删除条、检视抽屉、
列定义与密度：

```
[缓存 11.7GB] [大文件 132GB] [重复 4.2GB]     ← 分段控件，常驻
[☐ 全选] [清理所选 (3) → 2.1GB] [搜索] [建议 ▾] [仅依附应用]   ← 常驻工具条
紧凑表格 24px/行
```

- 全选框常驻表头、行操作 hover 才浮出（GitHub Desktop `_changes-list.scss:22` +
  VS Code `markers.css:132` 的做法）。**不做浮动条、不做底部条。**
- 目录百科不再是可以单独逛的页签：选中一行 → 右侧 320px 抽屉显示该路径的
  用途 / 依附应用 / 删除影响 / 风险 / 「打开位置」。知识长在数据上。
- 全局搜索（`Ctrl+K`）：在百科条目、缓存候选、已扫文件路径三处同时查，结果分组显示。

**跨页签状态**：现有 `onOpenFiles`→`fileFilter`（`DiskCleanupTool.tsx:86-92`）随结构收敛
上提为 `src/store/workspace.ts` 的 `useWorkspace()`（导航 + 分段 + 筛选 + 检视目标）。
`ScanProvider` 保留，但 `Shell` 不再依赖 `window` 事件 `"ltb-scan-status"`（`Shell.tsx:63`），
改为直接消费 `useScan()`，消除"脱离 provider 只显示就绪"的缺陷。

---

## 4. 焦点层级

概览只有一个英雄位：**「可释放 11.7 GB」+ 一个主 CTA「清理推荐项（9.44 GB）」**。

- 英雄数字：新增 `--fs-hero: 40px`（`--fs-2xl` 26px 保留给分节大数字，不改动），`--ok` 绿，等宽数字。
- 其余全部降为次级：38 处位置 / 依附应用 24 项 / 磁盘 C 67% D 52% / 重复文件 ——
  统一 11px 元数据 + 细进度条，**不再等权重平铺成卡片阵**。
- 概览必须恢复上次已持久化的扫描（修 §9 bug-1），英雄数字来自真实数据。
- 概览删除重复的第二个"开始扫描"按钮（英雄 CTA 已承担）。

---

## 5. 语义色系统

一条概念一条色，全界面同义同色，写进 `global.css` 并只允许这四处来源：

| 语义 | token | 浅色值 | 覆盖内容 |
|---|---|---|---|
| 可释放 / 推荐清理 / 低风险 | `--ok` | #0F7B52 | 缓存"推荐清理"、residue/cache 分类、可释放体积 |
| 需谨慎 / 中风险 / 待确认 | `--warn` | #9A6700 | "谨慎删除"、download/large/unknown 分类、中风险 |
| 锁定 / 系统 / 危险 / 永久删除 | `--danger` | #C93A34 | system 分类、保护路径、永久删除选项 |
| 品牌 / CTA / 激活 / 焦点 | `--primary` | #562AFF | 仅主按钮、导航激活、focus ring |

**呈现规则（照 GitHub Desktop `octicon-status` mixin：只给图标上色，文字不变色）**
- 行内状态 = 16px 着色图标 + `--text-body` 中性文字。**取消现在一行 4 个彩色胶囊。**
- 彩色胶囊只用于**聚合计数**：高 18px、圆角 full、11px 字、`--*-soft` 底 + 同色文字。
- 分类色（`utils/format.ts:41-90`）收敛到上述四色轴，不再各自为政。
- 品牌紫严格守 60-30-10 的那个 10：不做大面积底色。

---

## 6. 材质（比看板类产品克制一档，但不纯平）

纯平 = 工程原型感。专业工具下的材质做法：

- 面板/卡片：`linear-gradient(180deg, 提亮 2% 的 surface, surface)` +
  `box-shadow: inset 0 1px 0 rgba(255,255,255,.5)`（暗色 `rgba(255,255,255,.06)`）+ `--shadow-sm`。
- 圆角：控件 6 / 容器 9 / 卡片与抽屉 12（沿用现有 token，不新增体系）。
- 英雄区允许一处 `radial-gradient` 氛围光（仅概览顶部，透明度 ≤ 8%）。
- **表格行不卡片化**：保持纯 surface + 1px 分隔线，材质只出现在面板、抽屉、弹层。
- 浮层（抽屉/弹层/toast）用 `--shadow` / `--shadow-lg`，与平面层级严格对应。

---

## 7. 密度基线

以下数字均标注来源，且**都是源码声明值，未在本机 DPI 实测**（§12 会实测复核）。

| 项 | 采用值 | 依据 |
|---|---|---|
| 标题栏高 | 34px | VS Code 30px（无 WCO）/ 35px（`DEFAULT_CUSTOM_TITLEBAR_HEIGHT`，window.ts:381）；GHD `--win32-title-bar-height:28px` |
| 左侧导航宽 | 48px | VS Code `activitybarpart.css:8` |
| 工作区头高 | 40px | GHD `--toolbar-height:50px` 减一档（本处无二级按钮组） |
| 表格行高 | 24px | VS Code `ITEM_HEIGHT = 22`（treeView.ts:1246）；GHD `RowHeight = 29`（filter-changes-list.tsx:85） |
| 表头高 | 28px | GHD 列表头同 29px |
| 正文字号 | 12px / 行高 1.4 | GHD `--font-size:12`；VS Code workbench 13px/1.4em |
| 元数据字号 | 11px | GHD `--font-size-xs:11` |
| 图标 | 16px（导航 20px） | VS Code codicon 16px |
| 输入框高 | 26px | GHD `--text-field-height:25px`；VS Code 搜索框 23px |
| 间距刻度 | 4/8/12/16/24 | 沿用现有 `--space-*`（已是 4pt 体系） |
| 数值列 | 右对齐 + 等宽 tabular-nums | 现有 `.num` 已做，保留 |

字号阶梯并入现有 8 档 token：`--fs-xs 11 / --fs-sm 12 / --fs-base 13→12 / --fs-md 14 /
--fs-lg 16 / --fs-xl 20 / --fs-2xl 26 / --fs-hero 40`。`--fs-base` 从 13 降到 12 以匹配
数据密集度；正文可读性靠行高 1.5 与 `--text` 对比度补回。

---

## 8. 组件抽取（消除 7 份复制）

| 新组件/模块 | 取代 | 说明 |
|---|---|---|
| `src/components/WorkspaceHeader.tsx` | 7 个面板各自的"大标题+说明段" | 只有一行：名称 + 关键统计 + 动作。说明段全部删除，改为标题 tooltip 或百科抽屉内容 |
| `src/components/StatBar.tsx` | 各面板自写统计行 | 英雄位 + 次级元数据两种形态 |
| `src/components/DataTable.tsx` | FileTable 的 grid 模板 + CachePanel 卡片行 + 重复文件行 | 列定义驱动，行高/表头/全选/批量条统一 |
| `src/components/InspectorDrawer.tsx` | 目录百科页签 | 右侧 320px，承载 KB 条目 + 「打开位置」 |
| `src/components/ConfirmDialog.tsx`（保留并强化） | ConfirmModal + 2 处 `window.confirm`（DuplicatesPanel:45、SoftwarePanel:101） | 统一承载安全提示、永久删除勾选、还原点状态 |
| `src/store/settings.ts` | `SettingsPanel.tsx:25 loadSettings` | 可订阅的极小 store + `useSettings()`；修 §9 bug-5 |
| `src/components/Skeleton.tsx` | 3 份各写高度（54/40/108） | 形状与真实行高一致 |

`SettingsPanel` 拆为纯 UI 后，5 个 import 方（FileTable:9、CachePanel:8、ConfirmDialog:4、
OverviewPanel:7、DiskCleanupTool:18）改指 `store/settings.ts`。

**真实品牌图标**：`backend/core/software.py:175 get_software_icon` 已能从注册表
`DisplayIcon` / 安装目录 exe 提取真实图标（PNG base64 + 磁盘缓存）。缓存行与文件行的
归属图标复用该管线：按 `cache_dirs` 的 `app` 字段（如 "NVIDIA 显卡驱动"、"Nodejs / npm"）
与注册表软件名做归一化匹配（新增 `backend/core/icon_map.py`，含显式别名表 + 匹配失败回落）。
**匹配不上的用品牌色字母徽标，不硬编假 logo。**

---

## 9. 必须修的 6 个 bug

| # | 现象 | 根因（实测/代码定位） | 修法 |
|---|---|---|---|
| 1 | 概览显示"还没有扫描过磁盘"，状态栏却显示"扫描完成 · 2,412,561 个文件" | 文件清理页恢复持久化扫描，概览不恢复 | 概览挂载时读最近 scan，英雄数字用真实数据 |
| 2 | 暗色下搜索框纯白底、复选框纯白方块 | `components.css:94` 用 `input[type="text"]` 属性选择器，而 `CachePanel:128`/`FileTable:292`/`KnowledgePanel:86` 写的 `<input className="search">` **无 type 属性 → 不匹配**；且全仓库无 `color-scheme` 声明 | 按主题分别声明：`:root{color-scheme:light}` + `[data-theme="dark"]{color-scheme:dark}`（**不可写 `light dark`**，那会跟随系统而与软件内主题开关脱节）；输入样式改类选择器 `input.search`；`accent-color` 保留 |
| 3 | 列头"文件名 / 所属软件"与独立"所属软件"列重复 | `FileTable.tsx:328` vs `:330` | 第一列改"文件"，归属只留独立列 |
| 4 | 「删除前创建还原点」在重复文件清理里无效 | `DuplicatesPanel.tsx:49` 调 `api.deleteFiles(paths,false)`，不传 `restore_point`（`client.ts:91`） | 统一走 `store/settings` + ConfirmDialog，传 `restore_point` |
| 5 | 改大文件阈值后高亮/筛选/列模板不更新 | 5 个面板渲染期直读 `loadSettings()`、`useMemo(…,[])` 无订阅 | `useSettings()` 订阅 |
| 6 | 装机版退出残留后端进程（实测 PID 8868 RSS 1.1GB，主进程已消失） | `electron/main.js:233` `will-quit` 仅 `child.kill()`，Windows 下不保证杀树 | 改用 `process_tree_kill`（`taskkill /T /F /PID`）+ 子进程 `detached:false`；退出前调后端 `/api/shutdown`；`before-quit` 与 `process.on('exit')` 双保险 |

bug-6 需真机验证：启动装机版→退出→`netstat -ano | grep 1765` 应无 LISTENING。

---

## 10. 删除清单

**出厂检测（整体删除，用户 2026-09-27 批准"没用的删了"）**
- `src/components/FactoryPanel.tsx`（116 行）
- `backend/core/factory_check.py`（217 行）、`backend/api/routes_factory.py`（12 行）
- `backend/tools/disk_cleanup.py:9,32` 的 import 与 `include_router`
- `src/api/client.ts:150 factoryCheck`、`src/types.ts:237-259`（FactoryDevice/FactoryItem/FactoryCheckResult）
- `DiskCleanupTool.tsx:5,25,133` 的 import / TABS 项 / 渲染分支
- 确认：`backend/tests/` 无任何 factory 引用（实测 grep 零命中），37 个用例不受影响。

**结构性删除**
- `.statusbar` 整条（内容并入标题栏进度位）
- `.tool-tabs-row` 与 9 页签机制
- `SettingsPanel` 内层 5 项侧栏导航（改单栏分组）
- 重复的 `formatBytes`（`SoftwarePanel.tsx:280`）→ 改 import `utils/format.ts`
- `ConfirmModal.tsx`（并入 `ConfirmDialog`）
- 7 个面板的"大标题 + 说明段"（改 `WorkspaceHeader`）

**CSS 死代码（实测 292 个 class token 中 18 个无引用）**
`.side-item.active`(:32)、`.tool-card`(:183)、`.modal-result`(:386)、`.danger-icon`(:368)、
`.stats`(:642)、`.stat-card.hero`(:643)、`.stat-row/.stat-name/.stat-meta/.dot/.bar/.bar-fill`(:644-649)、
`.home-hero-cta/.home-logo/.tool-card-icon/.mtool-icon`(:717-730)；
token `--sidebar-bg`（零引用）、`--sidebar-w`（仅 `.topbar-brand` min-width 引用，一并清）。

**图标**：外壳落地后重跑未用扫描再删（现未用 6 个：home/refresh/pause/lock/download/
chevron-right，其中 lock/download/chevron-right 新设计要用，先留）。

**顺带补齐（反向缺样式，实测有类无定义）**：`.cache-item`、`.kb-panel`、`.kb-{rec}`、
`.col-rec`、`.badge-warn`、`.badge-ok`、`.badge-danger`、`.dup-del` —— 随 `DataTable` 统一。

---

## 11. 数据与状态流

```
main.js ── titleBarOverlay/backgroundColor ──► preload(dca) ──► Shell
ScanProvider(useScan) ──► 标题栏进度位 / 概览 / 清理
store/settings(useSettings) ──► 阈值/预览/永久删除/还原点/提示 的订阅方
store/workspace(useWorkspace) ──► 导航 + 清理分段 + 筛选 + 检视目标
```

错误处理：所有 API 失败统一走 toast（现有 `ToastContext`），面板不再各写
`setError(String(e instanceof Error ? …))`（实测复制 7 份）。后端不可用时
（`electron/main.js:215` 启动失败路径）标题栏显示"后端未就绪 · 重试"，各面板显示
可操作空态而非空白。

---

## 12. 验证与验收标准

**必须逐条实测，不接受"build 过了"当作运行时过了。**

1. `npm run typecheck` 通过；`.venv/Scripts/python.exe -m pytest backend/tests -q` 37 全绿；
   `npm run check:versions` 8 处一致。
2. CDP 打开 dev server，**真实数据密度**下截图：概览（含 11.7GB 英雄数字）、
   清理-缓存分段、清理-文件分段（2.4M 行）、清理-重复、软件、设置、检视抽屉、日志抽屉，
   浅色 + 暗色各一套。
3. DPI 实测：在 100% / 125% / 150% 三档下用 `getBoundingClientRect()` 量标题栏=34、
   导航栏=48、表格行=24 的**落地像素**（声明值≠落地值，高 DPI 下若不符则改用
   `env(titlebar-area-height)` 或调整常量并记录实测值）。
4. 暗色断言：`getComputedStyle` 检查所有 `input.search` 的 `background-color` 等于
   `--input-bg` 解析值（不得为 `rgb(255,255,255)`）；复选框不得为纯白块。
5. 横带计数：内容区上方视觉横带 ≤ 2（标题栏 + 工作区头）；DOM 上不再存在 `.statusbar`。
6. 窗口行为真机验证（`npm start` 打包外的 electron 窗口）：贴边吸附、Win+↑/↓、
   双击标题栏最大化、最大化不遮任务栏、150% DPI 下 overlay 按钮可点且不错位。
7. bug-6：装机版启动→退出→`netstat -ano` 无 1765x LISTENING。
8. 三档窗口宽度（1280 / 980 最小宽 / 手动窄化）无横向裁切；
   `prefers-reduced-motion` 下动效降级仍生效。

---

## 13. 分期

| 期 | 内容 | 可独立验收 |
|---|---|---|
| P1 | 外壳：main.js/preload/global.d.ts + Shell 重写 + NavRail + 删状态栏 + 删出厂检测全链路 | 窗口行为 + 截图 |
| P2 | token：语义色/材质/密度/`color-scheme` + WorkspaceHeader + StatBar + Skeleton | 概览与暗色断言 |
| P3 | 清理工作区：DataTable + 三分段 + InspectorDrawer + 全局搜索 | 2.4M 行实测 |
| P4 | 概览英雄位（含 bug-1）+ 软件 + 设置页重做 + 日志抽屉 | 截图 |
| P5 | `store/settings` + ConfirmDialog 统一 + bug 2-6 + 死代码清理 + 版本号升 0.4.0 + README/文档同步 | §12 全绿 |

依赖：P2 的 token 是 P3/P4 的前提；P1 的 `useWorkspace` 是 P3 的前提。

---

## 14. 风险

1. **`titleBarOverlay` 与 Snap 的真实行为未经本机实测**（官方文档零记载）—— P1 第一件事
   就是实测，若异常则回退到 `frame:false` + 自补 3px 缩放命中区（照 GHD/VS Code 做法）。
2. **虚拟滚动三处高度打架**：`ROW=44`（FileTable:11）↔ `.file-row{height:44px}`(:277)
   ↔ 行内 `style{height:ROW}`(:357)；`endIdx` 硬编码 560(:248)；`calc(100vh - 430px)`(:667)
   假定四条横带总高。改行高与删横带必须同步这几处，否则底部裁切。
3. **列宽模板与 `autoPreview` 耦合**：`:266`(9 列) 与 `:271`(6 列) 必须与 FileTable
   条件渲染列数严格同步（README 自述此处曾错乱）→ 由 `DataTable` 列定义单一来源解决。
4. **z-index 阶梯**：`.modal-mask:100`、`.toast-wrap:200`；`.file-bottom-bar`、
   `.settings-nav` 用 sticky 且依赖 `.content` 为唯一滚动容器（:52）。抽屉必须插进
   现有阶梯（取 90）而非另起。
5. **`SettingsPanel` 同时是页面与 store**（被 5 文件 import）—— P5 才拆，中途保持兼容导出。
6. **概览恢复扫描**依赖后端 scan 持久化，需确认最近 scan 可跨进程读取（现状：文件页可以）。

---

## 15. 未决 / 待实测（诚实记录）

- `titleBarOverlay` 下 Aero Snap / Snap Layouts / Win+方向键的实际行为：文档未写，需 P1 实测。
- `Menu.setApplicationMenu(null)` 是否连带失去 Ctrl+C/V：文档未写、未运行验证 → 本设计
  用 role 模板绕开该不确定性。
- VS Code 侧栏默认宽度常量未定位到（grep 无果），240px 展开态为保守估值——本设计
  不做展开态，故不影响。
- 所有 §7 数字均为源码声明值，未在本机 125%/150% DPI 下实测落地像素。
- 缓存条目 `app` 字段 → 注册表软件名的归一化匹配率：需实测，匹配不上者走字母徽标。
