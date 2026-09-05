"""清理知识库：常见 Windows 系统/软件目录的「用途说明 + 依附关系 + 清理建议」。

数据为静态知识（只读），随应用打包。前端「目录百科」页展示全部条目，
「缓存清理」页只取其中属于缓存/临时、且本机存在的路径作为一键清理候选。

字段约定：
    id            唯一键
    name          目录显示名
    category      分类：system_core / system_cache / system_temp / app_cache / app_data / user_data
    app           所属软件（空 = 系统级，不依附于任何应用）
    app_attached  是否依附于某个应用（卸载该应用后通常会被清理）
    path          路径模板（支持 %SystemRoot% %WinDir% %ProgramData% %TEMP% %USERPROFILE% %LOCALAPPDATA% %APPDATA%）
    description   这个文件夹是干嘛的
    delete_impact 删除后会发生什么
    recommendation recommend=推荐删除 / caution=谨慎删除 / keep=建议保留 / system=系统必留
    risk          low / medium / high
"""
import os
from typing import Dict, List

# ---------------------------------------------------------------------------
# 静态知识条目
# ---------------------------------------------------------------------------
_KB: List[dict] = [
    # ================= 系统核心（绝不删除） =================
    dict(
        id="sys_windows", name="C:\\Windows 系统目录",
        category="system_core", app="", app_attached=False,
        path="%SystemRoot%",
        description="Windows 操作系统核心目录，存放系统文件、驱动、DLL、字体等，系统运行的基础。",
        delete_impact="删除会直接导致系统无法启动或崩溃，任何情况下都不要动它。",
        recommendation="system", risk="high",
    ),
    dict(
        id="sys_system32", name="C:\\Windows\\System32",
        category="system_core", app="", app_attached=False,
        path="%SystemRoot%\\System32",
        description="32/64 位系统关键动态库、可执行文件与系统组件的家，系统启动必需。",
        delete_impact="删除会导致蓝屏、软件无法运行甚至系统损坏，绝不可删。",
        recommendation="system", risk="high",
    ),
    dict(
        id="sys_programfiles", name="Program Files（程序目录）",
        category="system_core", app="", app_attached=False,
        path="%ProgramFiles%",
        description="绝大多数软件默认安装目录，删除会破坏已安装软件。",
        delete_impact="删除其中文件会使对应软件无法运行；卸载软件请走「已装软件」或系统卸载入口。",
        recommendation="system", risk="high",
    ),
    dict(
        id="sys_programdata", name="C:\\ProgramData",
        category="system_core", app="", app_attached=False,
        path="%ProgramData%",
        description="程序公共数据目录，软件与 Windows 共享的配置、数据库、更新缓存等。",
        delete_impact="删除会破坏大量软件与系统组件的公共数据，仅个别子目录（如 Package Cache）可谨慎清理。",
        recommendation="system", risk="high",
    ),
    dict(
        id="sys_boot", name="引导/恢复分区",
        category="system_core", app="", app_attached=False,
        path="%SystemDrive%\\Boot",
        description="系统引导文件与恢复环境（Windows RE），开机必需的引导数据。",
        delete_impact="删除后无法正常开机，禁止清理。",
        recommendation="system", risk="high",
    ),
    dict(
        id="sys_recycle", name="$Recycle.Bin（回收站）",
        category="system_core", app="", app_attached=False,
        path="%SystemDrive%\\$Recycle.Bin",
        description="回收站数据目录，里面是「删除但未清空」的文件。",
        delete_impact="清空回收站即可释放空间；直接删目录会损坏回收站。软件删除默认进回收站，可在系统里清空。",
        recommendation="system", risk="medium",
    ),
    dict(
        id="sys_drivers", name="C:\\Windows\\System32\\drivers",
        category="system_core", app="", app_attached=False,
        path="%SystemRoot%\\System32\\drivers",
        description="硬件驱动程序文件，系统/硬件正常工作的基础。",
        delete_impact="删除驱动会导致对应硬件（显卡、声卡、网卡等）失效。",
        recommendation="system", risk="high",
    ),
    dict(
        id="sys_fonts", name="C:\\Windows\\Fonts",
        category="system_core", app="", app_attached=False,
        path="%SystemRoot%\\Fonts",
        description="系统字体库，所有程序显示文字的来源。",
        delete_impact="删除字体可能导致界面/文档文字显示异常。",
        recommendation="system", risk="high",
    ),

    # ================= 系统缓存 / 临时（推荐清理） =================
    dict(
        id="sys_temp", name="用户临时文件（TEMP）",
        category="system_temp", app="", app_attached=False,
        path="%TEMP%",
        description="Windows 与软件写入的临时文件，安装、解压、浏览时产生，普遍可安全删除。",
        delete_impact="删除正在被占用的文件会跳过，其余不影响使用；重启后系统会重新生成。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_wintemp", name="C:\\Windows\\Temp",
        category="system_temp", app="", app_attached=False,
        path="%SystemRoot%\\Temp",
        description="系统级临时目录，Windows Update、驱动安装等过程写入的临时文件。",
        delete_impact="占用中的文件会跳过，其余可安全删除。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_prefetch", name="C:\\Windows\\Prefetch（预读取）",
        category="system_cache", app="", app_attached=False,
        path="%SystemRoot%\\Prefetch",
        description="系统为加快程序启动生成的预读取缓存，会随使用自动重建。",
        delete_impact="删除后首次启动软件会稍慢，之后自动重建；不释放多少空间，可清但收益低。",
        recommendation="caution", risk="low",
    ),
    dict(
        id="sys_wupdate", name="Windows 更新缓存（SoftwareDistribution\\Download）",
        category="system_cache", app="", app_attached=False,
        path="%SystemRoot%\\SoftwareDistribution\\Download",
        description="已下载待安装的 Windows 更新安装包缓存。",
        delete_impact="删除后更新包需重新下载；建议在「设置-系统-存储-临时文件」里清理或重启后删除。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_delivery", name="传递优化缓存（Delivery Optimization）",
        category="system_cache", app="", app_attached=False,
        path="%ProgramData%\\Microsoft\\Windows\\DeliveryOptimization\\Cache",
        description="Windows 更新在局域网/互联网分发时留下的缓存，常占用数 GB。",
        delete_impact="删除后重新下载更新时重建，安全可清，通常收益明显。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_wer", name="Windows 错误报告（WER）",
        category="system_cache", app="", app_attached=False,
        path="%ProgramData%\\Microsoft\\Windows\\WER",
        description="程序崩溃/错误时上传的转储与报告，日积月累可占不少空间。",
        delete_impact="仅影响故障排查历史，删除安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_lkr", name="LiveKernelReports（内核错误报告）",
        category="system_cache", app="", app_attached=False,
        path="%SystemRoot%\\LiveKernelReports",
        description="内核级崩溃转储，通常只会在系统异常时产生，体积可能较大。",
        delete_impact="删除安全，仅丢失故障调试数据。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_minidump", name="Minidump（蓝屏转储）",
        category="system_cache", app="", app_attached=False,
        path="%SystemRoot%\\Minidump",
        description="蓝屏时生成的小型内存转储文件，排障用。",
        delete_impact="删除安全；若近期蓝屏频发建议保留到排查完。",
        recommendation="caution", risk="low",
    ),
    dict(
        id="sys_thumb", name="Windows 缩略图/Explorer 缓存",
        category="system_cache", app="", app_attached=False,
        path="%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer",
        description="文件夹/图片预览的缩略图缓存（thumbcache），文件多时占用可观。",
        delete_impact="删除后缩略图会重新生成，安全可清。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_inetcache", name="INetCache（旧版网络缓存）",
        category="system_cache", app="", app_attached=False,
        path="%LOCALAPPDATA%\\Microsoft\\Windows\\INetCache",
        description="IE/部分系统组件留下的网页临时缓存。",
        delete_impact="删除安全，仅使个别旧组件重新缓存。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_fontcache", name="FontCache（字体缓存）",
        category="system_cache", app="", app_attached=False,
        path="%SystemRoot%\\ServiceProfiles\\LocalService\\AppData\\Local\\FontCache",
        description="系统字体索引缓存，加速文字渲染。",
        delete_impact="删除后系统重建，极短时间内字体渲染稍慢，安全。",
        recommendation="caution", risk="low",
    ),
    dict(
        id="sys_pkgcache", name="ProgramData\\Package Cache",
        category="system_cache", app="", app_attached=False,
        path="%ProgramData%\\Package Cache",
        description="已安装程序（NSIS 等安装器）留下的安装包缓存，用于修复/卸载。",
        delete_impact="删除后部分软件无法修复或卸载需要重新下载；空间大时可谨慎清，但建议保留。",
        recommendation="caution", risk="medium",
    ),
    dict(
        id="sys_old", name="Windows.old（旧系统备份）",
        category="system_temp", app="", app_attached=False,
        path="%SystemDrive%\\Windows.old",
        description="升级/重装系统时备份的旧 Windows，通常体积巨大（10-30GB）。",
        delete_impact="删除后无法回滚到旧系统；确认新系统稳定后可在「存储-临时文件」中清理，可释放大量空间。",
        recommendation="caution", risk="medium",
    ),
    dict(
        id="sys_winstbt", name="$Windows.~BT / ~WS（升级残留）",
        category="system_temp", app="", app_attached=False,
        path="%SystemDrive%\\$Windows.~BT",
        description="Windows 升级过程的临时安装文件，升级完成后应被自动清理，异常时残留。",
        delete_impact="删除安全，释放可达数 GB；若正在升级中请勿操作。",
        recommendation="recommend", risk="medium",
    ),
    dict(
        id="sys_memdmp", name="Memory.dmp（内存转储）",
        category="system_cache", app="", app_attached=False,
        path="%SystemRoot%\\MEMORY.DMP",
        description="系统崩溃时的完整内存转储，单文件可达数 GB。",
        delete_impact="删除安全；若近期蓝屏频发建议先保留排障。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_installer", name="C:\\Windows\\Installer",
        category="system_cache", app="", app_attached=False,
        path="%SystemRoot%\\Installer",
        description="MSI 安装程序缓存与补丁注册信息，软件卸载/修复必需。",
        delete_impact="直接删除会导致已装软件无法卸载/修复；必须用专用清理工具，强烈建议不动。",
        recommendation="system", risk="high",
    ),
    dict(
        id="sys_webcache", name="WebCache（搜索索引缓存）",
        category="system_cache", app="", app_attached=False,
        path="%LOCALAPPDATA%\\Microsoft\\Windows\\WebCache",
        description="Windows 搜索/Edge 的索引数据库。",
        delete_impact="删除后搜索索引重建，个别情况下需重新索引，安全但收益低。",
        recommendation="caution", risk="medium",
    ),
    dict(
        id="sys_dtscache", name="Windows.old 数据扫描缓存",
        category="system_cache", app="", app_attached=False,
        path="%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer\\thumbnailcache",
        description="系统级缩略图缓存变体，文件多时占用明显。",
        delete_impact="删除后缩略图重建，安全。",
        recommendation="recommend", risk="low",
    ),

    # ================= 浏览器缓存（依附于浏览器） =================
    dict(
        id="br_chrome", name="Chrome 浏览器缓存",
        category="app_cache", app="Chrome 浏览器", app_attached=True,
        path="%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Cache",
        description="Chrome 的网页/图片/脚本缓存，依附于 Chrome，卸载 Chrome 会一并删除。",
        delete_impact="删除后网页首次访问稍慢，重新加载后恢复；不丢书签/密码/历史。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="br_edge", name="Microsoft Edge 缓存",
        category="app_cache", app="Microsoft Edge", app_attached=True,
        path="%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\Cache",
        description="Edge 的网页缓存，依附于 Edge。",
        delete_impact="删除后首次访问稍慢，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="br_firefox", name="Firefox 缓存",
        category="app_cache", app="Firefox 浏览器", app_attached=True,
        path="%LOCALAPPDATA%\\Mozilla\\Firefox\\Profiles",
        description="Firefox 各配置文件的缓存目录（cache2 等），依附于 Firefox。",
        delete_impact="删除后首次访问稍慢；注意 Profiles 里还有书签/设置，只清缓存子目录。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="br_brave", name="Brave 浏览器缓存",
        category="app_cache", app="Brave 浏览器", app_attached=True,
        path="%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data\\Default\\Cache",
        description="Brave 的网页缓存，依附于 Brave。",
        delete_impact="删除后首次访问稍慢，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="br_opera", name="Opera 浏览器缓存",
        category="app_cache", app="Opera 浏览器", app_attached=True,
        path="%APPDATA%\\Opera Software\\Opera Stable\\Cache",
        description="Opera 的网页缓存，依附于 Opera。",
        delete_impact="删除后首次访问稍慢，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="br_360se", name="360 浏览器缓存",
        category="app_cache", app="360 浏览器", app_attached=True,
        path="%APPDATA%\\360se6\\User Data",
        description="360 安全浏览器的缓存，依附于 360 浏览器。",
        delete_impact="删除后首次访问稍慢，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="br_qqbrowser", name="QQ 浏览器缓存",
        category="app_cache", app="QQ 浏览器", app_attached=True,
        path="%APPDATA%\\Tencent\\QQBrowser",
        description="QQ 浏览器的缓存目录，依附于 QQ 浏览器。",
        delete_impact="删除后首次访问稍慢，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="br_sogou", name="搜狗浏览器缓存",
        category="app_cache", app="搜狗浏览器", app_attached=True,
        path="%LOCALAPPDATA%\\SogouExplorer",
        description="搜狗浏览器的缓存目录，依附于搜狗浏览器。",
        delete_impact="删除后首次访问稍慢，安全。",
        recommendation="recommend", risk="low",
    ),

    # ================= 聊天/办公软件缓存（依附于应用） =================
    dict(
        id="ap_wechat_files", name="微信文件与缓存（WeChat Files）",
        category="app_data", app="微信", app_attached=True,
        path="%LOCALAPPDATA%\\Tencent\\WeChat Files",
        description="微信的聊天记录、图片、视频、接收文件，依附于微信；注意：里面是真实聊天数据，不是纯缓存。",
        delete_impact="删除会导致聊天图片/文件永久丢失；只建议清理其中 xwechat_files 下的临时缓存（FileStorage\\Cache 等），切勿整目录删除。",
        recommendation="caution", risk="high",
    ),
    dict(
        id="ap_wechat_tmp", name="微信临时/缓存（Temp/Cache）",
        category="app_cache", app="微信", app_attached=True,
        path="%LOCALAPPDATA%\\Tencent\\WeChatTemp",
        description="微信收发文件、图片时的临时缓存，依附于微信，可安全清理。",
        delete_impact="删除安全，微信会重新生成；聊天记录不受影响。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="ap_qq_files", name="QQ 文件与缓存（Tencent Files）",
        category="app_data", app="QQ", app_attached=True,
        path="%LOCALAPPDATA%\\Tencent\\QQ",
        description="QQ 的聊天记录、接收文件与缓存，依附于 QQ。",
        delete_impact="整目录删除会丢聊天文件；建议只清子目录里的 Cache/Image/Temp 等缓存部分。",
        recommendation="caution", risk="medium",
    ),
    dict(
        id="ap_dingtalk", name="钉钉缓存",
        category="app_cache", app="钉钉", app_attached=True,
        path="%APPDATA%\\DingTalk",
        description="钉钉的缓存与部分数据，依附于钉钉。",
        delete_impact="仅清其中 Cache/tmp 类目录；整目录删除会丢配置与部分文件。",
        recommendation="caution", risk="medium",
    ),
    dict(
        id="ap_feishu", name="飞书缓存",
        category="app_cache", app="飞书", app_attached=True,
        path="%APPDATA%\\Feishu",
        description="飞书的缓存与本地数据，依附于飞书。",
        delete_impact="仅清 Cache 类子目录；整目录删除会丢配置与本地文档缓存。",
        recommendation="caution", risk="medium",
    ),
    dict(
        id="ap_wps_cache", name="WPS Office 缓存",
        category="app_cache", app="WPS Office", app_attached=True,
        path="%APPDATA%\\Kingsoft\\WPS Office",
        description="WPS 的界面缓存、备份文件目录，依附于 WPS。",
        delete_impact="其中 backup 目录保存文档备份，删除会丢自动备份；只建议清 cache/temp 子目录。",
        recommendation="caution", risk="medium",
    ),
    dict(
        id="ap_wps_cloud", name="WPS 云文档缓存",
        category="app_data", app="WPS Office", app_attached=True,
        path="%LOCALAPPDATA%\\Kingsoft\\WPS Cloud Files",
        description="WPS 网盘文件的本地同步缓存（可能含未同步的新内容）。",
        delete_impact="删除前务必确认云端已同步，否则可能丢文档；谨慎。",
        recommendation="caution", risk="high",
    ),
    dict(
        id="ap_office_cache", name="Microsoft Office 缓存",
        category="app_cache", app="Microsoft Office", app_attached=True,
        path="%LOCALAPPDATA%\\Microsoft\\Office",
        description="Office 的最近文档、缓存与崩溃修复数据，依附于 Office。",
        delete_impact="Recent 子目录是最近文档快捷方式，删除不影响原文件；缓存部分可清。",
        recommendation="caution", risk="medium",
    ),

    # ================= 开发工具缓存（依附于开发工具） =================
    dict(
        id="dev_npm", name="npm 缓存",
        category="app_cache", app="Node.js / npm", app_attached=True,
        path="%LOCALAPPDATA%\\npm-cache",
        description="npm 下载的包缓存，依附于 Node 生态，可安全清理并可用 npm cache clean 重建。",
        delete_impact="删除后下次安装包需重新下载，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="dev_pnpm", name="pnpm 缓存",
        category="app_cache", app="Node.js / pnpm", app_attached=True,
        path="%LOCALAPPDATA%\\pnpm-cache",
        description="pnpm 的包缓存（store），体积可能很大。",
        delete_impact="删除后重新安装时需重新下载，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="dev_yarn", name="Yarn 缓存",
        category="app_cache", app="Node.js / Yarn", app_attached=True,
        path="%LOCALAPPDATA%\\Yarn\\Cache",
        description="Yarn 的包缓存。",
        delete_impact="删除后重新下载依赖，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="dev_pip", name="pip 缓存",
        category="app_cache", app="Python / pip", app_attached=True,
        path="%LOCALAPPDATA%\\pip\\cache",
        description="pip 安装包时的下载缓存。",
        delete_impact="删除后用 pip cache purge 重建，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="dev_gradle", name="Gradle 构建缓存",
        category="app_cache", app="Gradle", app_attached=True,
        path="%USERPROFILE%\\.gradle\\caches",
        description="Gradle 的依赖与构建缓存，Android/Java 项目常见，可能占用数 GB。",
        delete_impact="删除后重新构建时重新下载依赖，安全但构建变慢。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="dev_maven", name="Maven 本地仓库",
        category="app_cache", app="Maven", app_attached=True,
        path="%USERPROFILE%\\.m2\\repository",
        description="Maven 下载的依赖包本地仓库，Java 项目必需。",
        delete_impact="删除后需重新下载依赖（可能非常大）；建议保留或仅清过期版本。",
        recommendation="caution", risk="medium",
    ),
    dict(
        id="dev_nuget", name="NuGet 包缓存",
        category="app_cache", app=".NET / NuGet", app_attached=True,
        path="%USERPROFILE%\\.nuget\\packages",
        description="NuGet 的全局包缓存，.NET 项目构建复用。",
        delete_impact="删除后重新还原 NuGet 包；离线构建会失败，谨慎。",
        recommendation="caution", risk="medium",
    ),
    dict(
        id="dev_jetbrains", name="JetBrains IDE 缓存",
        category="app_cache", app="JetBrains IDE（IDEA/PyCharm 等）", app_attached=True,
        path="%LOCALAPPDATA%\\JetBrains",
        description="JetBrains 全家桶的索引/缓存，依附于对应 IDE。",
        delete_impact="删除后 IDE 会重新建立索引，首次打开稍慢；安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="dev_go", name="Go 模块缓存",
        category="app_cache", app="Go", app_attached=True,
        path="%USERPROFILE%\\go\\pkg\\mod",
        description="Go 语言的模块缓存。",
        delete_impact="删除后需重新下载模块；安全。",
        recommendation="caution", risk="low",
    ),
    dict(
        id="dev_vscode", name="VS Code 缓存",
        category="app_cache", app="Visual Studio Code", app_attached=True,
        path="%APPDATA%\\Code\\Cache",
        description="VS Code 的界面/扩展缓存，依附于 VS Code。",
        delete_impact="删除后 VS Code 重建缓存，安全；不要删整个 Code 目录（含设置）。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="dev_rust", name="Cargo 注册表缓存",
        category="app_cache", app="Rust / Cargo", app_attached=True,
        path="%USERPROFILE%\\.cargo\\registry",
        description="Cargo 下载的 crate 注册表缓存。",
        delete_impact="删除后重新下载 crate；安全。",
        recommendation="caution", risk="low",
    ),
    dict(
        id="dev_pycharm", name="PyCharm 缓存",
        category="app_cache", app="JetBrains PyCharm", app_attached=True,
        path="%LOCALAPPDATA%\\JetBrains\\PyCharm",
        description="PyCharm 的索引与缓存，依附于 PyCharm。",
        delete_impact="删除后重建索引，安全。",
        recommendation="recommend", risk="low",
    ),

    # ================= 游戏/显卡缓存（依附于应用/硬件） =================
    dict(
        id="gpu_nvidia", name="NVIDIA 显卡缓存",
        category="app_cache", app="NVIDIA 显卡驱动", app_attached=True,
        path="%LOCALAPPDATA%\\NVIDIA",
        description="NVIDIA 驱动的着色器/GL 缓存，依附于 NVIDIA 驱动。",
        delete_impact="删除后驱动重建缓存，个别游戏首次启动会卡顿，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="gpu_dx", name="DirectX 着色器缓存",
        category="app_cache", app="DirectX", app_attached=True,
        path="%LOCALAPPDATA%\\D3DSCache",
        description="DirectX 编译的游戏着色器缓存。",
        delete_impact="删除后游戏首开需重新编译着色器（卡一下），安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="gpu_amd", name="AMD 显卡缓存",
        category="app_cache", app="AMD 显卡驱动", app_attached=True,
        path="%LOCALAPPDATA%\\AMD",
        description="AMD 驱动的缓存与配置，依附于 AMD 驱动。",
        delete_impact="删除后驱动重建，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="gpu_intel", name="Intel 显卡缓存",
        category="app_cache", app="Intel 显卡驱动", app_attached=True,
        path="%LOCALAPPDATA%\\Intel",
        description="Intel 核显驱动缓存。",
        delete_impact="删除后驱动重建，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="game_steam_shader", name="Steam 着色器缓存",
        category="app_cache", app="Steam", app_attached=True,
        path="%ProgramFiles(x86)%\\Steam\\steamapps\\shadercache",
        description="Steam 游戏预编译的着色器缓存，依附于 Steam。",
        delete_impact="删除后游戏重新编译着色器（首开卡顿），可安全清理以释放空间。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="game_steam_html", name="Steam 内置浏览器缓存",
        category="app_cache", app="Steam", app_attached=True,
        path="%LOCALAPPDATA%\\Steam\\htmlcache",
        description="Steam 商店/社区内置浏览器的网页缓存。",
        delete_impact="删除后重新加载页面，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="game_epic", name="Epic Games 缓存",
        category="app_cache", app="Epic Games 启动器", app_attached=True,
        path="%LOCALAPPDATA%\\Epic Games",
        description="Epic 启动器的下载/网页缓存，依附于 Epic 启动器。",
        delete_impact="删除后启动器重建缓存，安全；不要删游戏本体所在目录。",
        recommendation="recommend", risk="low",
    ),

    # ================= 系统/应用杂项（谨慎） =================
    dict(
        id="sys_recent", name="最近使用（Recent）",
        category="system_cache", app="", app_attached=False,
        path="%APPDATA%\\Microsoft\\Windows\\Recent",
        description="「最近使用」列表的快捷方式，只记录路径，不含文件本体。",
        delete_impact="删除后最近列表清空，不影响文件本身，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_crashdumps", name="应用崩溃转储（App Crash Dumps）",
        category="system_cache", app="", app_attached=False,
        path="%LOCALAPPDATA%\\CrashDumps",
        description="应用崩溃时生成的转储文件，排障用，可能占数百 MB。",
        delete_impact="删除安全，仅丢失崩溃调试数据。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_wer_user", name="用户错误报告（WER）",
        category="system_cache", app="", app_attached=False,
        path="%LOCALAPPDATA%\\Microsoft\\Windows\\WER",
        description="用户级程序崩溃/错误报告。",
        delete_impact="删除安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_downloads", name="下载目录（Downloads）",
        category="user_data", app="", app_attached=False,
        path="%USERPROFILE%\\Downloads",
        description="浏览器/软件的默认下载保存位置，属于你的真实文件。",
        delete_impact="里面是用户文件，删除前务必逐项确认；这是你的资料不是缓存。",
        recommendation="keep", risk="medium",
    ),
    dict(
        id="sys_desktop", name="桌面（Desktop）",
        category="user_data", app="", app_attached=False,
        path="%USERPROFILE%\\Desktop",
        description="桌面上的所有文件与快捷方式，属于用户数据。",
        delete_impact="删除会导致桌面文件/快捷方式丢失，禁止批量清理。",
        recommendation="keep", risk="high",
    ),
    dict(
        id="sys_documents", name="文档（Documents）",
        category="user_data", app="", app_attached=False,
        path="%USERPROFILE%\\Documents",
        description="文档、笔记、项目等用户数据。",
        delete_impact="删除会丢资料，禁止批量清理。",
        recommendation="keep", risk="high",
    ),
    dict(
        id="sys_appdata_roaming", name="AppData\\Roaming",
        category="app_data", app="", app_attached=False,
        path="%APPDATA%",
        description="软件的可漫游数据：配置、账号、缓存混在一起，多为各应用私有目录。",
        delete_impact="里面每个子目录对应一个应用；删除某个子目录=重置该应用设置/登录态。切勿整体删除。",
        recommendation="keep", risk="high",
    ),
    dict(
        id="sys_appdata_local", name="AppData\\Local",
        category="app_data", app="", app_attached=False,
        path="%LOCALAPPDATA%",
        description="软件的本地数据与缓存：包含大量 Cache/Temp（可清）与配置/数据库（要留）。",
        delete_impact="只建议清理其中明确的 Cache/Temp 子目录，整体删除会破坏所有软件。",
        recommendation="caution", risk="high",
    ),
    dict(
        id="sys_packages", name="Packages（微软商店应用）",
        category="app_data", app="微软商店应用", app_attached=True,
        path="%LOCALAPPDATA%\\Packages",
        description="UWP/商店应用的本地数据与缓存，每个应用一个子目录。",
        delete_impact="删除某子目录=重置对应商店应用；不要整体删除。",
        recommendation="caution", risk="medium",
    ),
    dict(
        id="sys_wer_local", name="Local\\Temp（用户临时）",
        category="system_temp", app="", app_attached=False,
        path="%LOCALAPPDATA%\\Temp",
        description="与 %TEMP% 同源的用户临时目录，安装/解压/软件运行时写入。",
        delete_impact="删除占用外的临时文件安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="sys_jumplist", name="任务栏跳转列表（Jump Lists）",
        category="system_cache", app="", app_attached=False,
        path="%APPDATA%\\Microsoft\\Windows\\Recent\\AutomaticDestinations",
        description="任务栏右键「最近打开」跳转列表，只存路径快捷方式。",
        delete_impact="删除后跳转列表清空，不影响文件本身，安全。",
        recommendation="recommend", risk="low",
    ),
    dict(
        id="ap_adobe", name="Adobe 缓存",
        category="app_cache", app="Adobe", app_attached=True,
        path="%APPDATA%\\Adobe",
        description="Adobe 系软件（PS/AI/PR）的缓存与首选项，依附于 Adobe。",
        delete_impact="缓存可清；但里面也有首选项（如 PS 工作区），整目录删除会重置设置。",
        recommendation="caution", risk="medium",
    ),
    dict(
        id="ap_autodesk", name="Autodesk 缓存",
        category="app_cache", app="Autodesk", app_attached=True,
        path="%LOCALAPPDATA%\\Autodesk",
        description="AutoCAD 等 Autodesk 软件的缓存与配置。",
        delete_impact="缓存可清；配置删除会重置软件设置。",
        recommendation="caution", risk="medium",
    ),
    dict(
        id="ap_thumbnail", name="桌面图标缓存（IconCache）",
        category="system_cache", app="", app_attached=False,
        path="%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer\\iconcache",
        description="桌面与文件资源管理器图标缓存。",
        delete_impact="删除后图标缓存重建，安全。",
        recommendation="recommend", risk="low",
    ),
]

# 分类 -> 显示名
CATEGORY_LABELS: Dict[str, str] = {
    "system_core": "系统核心（必留）",
    "system_cache": "系统缓存",
    "system_temp": "系统临时/日志",
    "app_cache": "软件缓存（依附于应用）",
    "app_data": "软件数据（依附于应用）",
    "user_data": "用户文件",
}

RECOMMENDATION_LABELS: Dict[str, str] = {
    "recommend": "推荐清理",
    "caution": "谨慎清理",
    "keep": "建议保留",
    "system": "系统必留",
}

RISK_LABELS: Dict[str, str] = {
    "low": "低风险",
    "medium": "中风险",
    "high": "高风险",
}


def _expand(path: str) -> str:
    """展开环境变量路径模板（%...%），返回空串表示关键变量缺失。"""
    if not path:
        return ""
    try:
        expanded = os.path.expandvars(path)
    except Exception:  # noqa: BLE001
        return ""
    # 若还有未展开的 %XXX%，说明关键变量缺失
    if "%" in expanded:
        return ""
    return expanded


def kb_entries(only_existing: bool = False) -> List[dict]:
    """返回知识库条目。

    - 每条附带 resolved_path（本机真实路径，解析失败为空串）
    - exists 标记本机是否存在
    - only_existing=True 时仅返回 exists=True 的条目
    """
    out = []
    for entry in _KB:
        item = dict(entry)
        resolved = _expand(item["path"])
        item["resolved_path"] = resolved
        try:
            item["exists"] = bool(resolved) and os.path.exists(resolved)
        except OSError:
            item["exists"] = False
        out.append(item)
    if only_existing:
        out = [i for i in out if i["exists"]]
    return out


def cache_candidates_from_kb() -> List[dict]:
    """从知识库中提取「可一键清理」且本机存在的路径。

    仅收录缓存/临时类目录（app_cache / system_cache / system_temp），
    并且 recommendation in (recommend, caution)。
    系统核心（system_core）、用户文件（user_data）、软件数据（app_data，
    如整个 AppData\\Local、微信聊天文件、UWP Packages 等）绝不进入一键清理候选，
    它们只作为知识库条目供用户查看学习。
    """
    allowed_cats = {"app_cache", "system_cache", "system_temp"}
    out = []
    for item in kb_entries(only_existing=True):
        if item["category"] not in allowed_cats:
            continue
        if item["recommendation"] not in ("recommend", "caution"):
            continue
        resolved = item.get("resolved_path", "")
        if not resolved or not os.path.isdir(resolved):
            continue
        # 防止指向用户/系统根的危险路径
        if len(os.path.normpath(resolved)) <= 3:
            continue
        out.append({
            "id": item["id"],
            "label": item["name"],
            "path": resolved,
            "app": item["app"],
            "app_attached": item["app_attached"],
            "description": item["description"],
            "delete_impact": item["delete_impact"],
            "recommendation": item["recommendation"],
            "risk": item["risk"],
            "category": item["category"],
            "bytes": 0,  # 由上层统计
        })
    return out
