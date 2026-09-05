"""Smoke test for the packaged single-file backend exe.

PyInstaller --onefile runs the server in a CHILD process, so we terminate the
whole tree with taskkill before and after to avoid stale servers / file locks.
"""
import json
import subprocess
import sys
import time
import urllib.request

EXE = r"backend_dist/disk_cleanup_backend.exe"
PORT = 17902


def kill_backend_tree():
    subprocess.run(
        ["taskkill", "/F", "/IM", "disk_cleanup_backend.exe", "/T"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.6)


def main():
    kill_backend_tree()
    proc = subprocess.Popen(
        [EXE, "--port=" + str(PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    ok = False
    try:
        for _ in range(60):
            time.sleep(0.5)
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{PORT}/api/health", timeout=2
                ) as r:
                    data = json.load(r)
                    print("health=", data)
                    ok = data.get("ok", False) and data.get("tools", 0) >= 1
                    break
            except Exception:
                pass
    finally:
        kill_backend_tree()
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(6)
            except Exception:
                proc.kill()
    print("exe-ok=", ok)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()