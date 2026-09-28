"""Standalone launcher for the FastAPI backend (used by PyInstaller exe / dev)."""
import os
import sys

def _pick_port():
    for arg in sys.argv[1:]:
        if arg.startswith("--port="):
            try:
                return int(arg.split("=", 1)[1])
            except ValueError:
                break
    from backend.core.config import find_free_port
    return find_free_port()


def _pick_parent_pid():
    for arg in sys.argv[1:]:
        if arg.startswith("--parent-pid="):
            try:
                return int(arg.split("=", 1)[1])
            except ValueError:
                return 0
    return 0


def main():
    # make sure our package can be found when running from source
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    from backend.core.config import find_free_port
    from backend.core.watchdog import start_parent_watchdog
    from backend.main import app
    import uvicorn

    start_parent_watchdog(_pick_parent_pid())

    port = _pick_port()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()