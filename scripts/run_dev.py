"""Dev server: pick a free port and start uvicorn."""
import os
import sys

# 以 `python scripts/run_dev.py` 直接运行时，sys.path[0] 是 scripts/ 目录本身，
# 会导致 import backend 失败（ModuleNotFoundError）。这里把项目根目录补进去。
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def _pick_port():
    for arg in sys.argv[1:]:
        if arg.startswith("--port="):
            try:
                return int(arg.split("=", 1)[1])
            except ValueError:
                break
    from backend.core.config import find_free_port
    return find_free_port()


def main():
    from backend.main import app
    import uvicorn
    port = _pick_port()
    print("listening on", port)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()