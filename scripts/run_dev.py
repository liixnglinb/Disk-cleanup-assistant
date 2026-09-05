"""Dev server: pick a free port and start uvicorn."""
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


def main():
    from backend.main import app
    import uvicorn
    port = _pick_port()
    print("listening on", port)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()