from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "build" / "icons" / "icon-1024.png"
ICONS = ROOT / "build" / "icons"


def main():
    """从 1024px 源图重建磁盘清理助手全部图标产物。

    源图由 build/icons/icon.svg 经 Playwright 截图得到（见 render_icon.mjs），
    这里只做等比缩存 —— 图标必须是矢量源缩出来的，不是手工放大的位图。
    """
    image = Image.open(SOURCE).convert("RGBA")

    # 站点 favicon 与窗口图标同源；安装器/资源文件只要 .ico
    image.save(ICONS / "icon.png", format="PNG", optimize=True)
    image.resize((256, 256), Image.Resampling.LANCZOS).save(
        ICONS / "icon-256.png", format="PNG", optimize=True
    )
    image.resize((256, 256), Image.Resampling.LANCZOS).save(
        ROOT / "public" / "icon.png", format="PNG", optimize=True
    )
    image.save(
        ICONS / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48),
               (64, 64), (128, 128), (256, 256)],
    )
    print("OK", image.size)


if __name__ == "__main__":
    main()
