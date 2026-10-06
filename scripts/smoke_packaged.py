"""Smoke test for the packaged single-file backend exe.

PyInstaller --onefile runs the server in a CHILD process, so cleanup has to take
the whole tree down. Two rules this script exists to respect:

1. Never kill by image name. The installed app ships the very same
   ``disk_cleanup_backend.exe``; ``taskkill /IM`` would take the user's running
   app down with our test process. We only ever kill PIDs we started, plus
   leftovers whose executable path is inside ``backend_dist``.
2. Never write into the user's real data directory. ``DISK_CLEANUP_LOG_DIR``
   redirects everything (scan DBs, AI config, deletion log) to a temp dir.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

EXE = os.path.normpath("backend_dist/disk_cleanup_backend.exe")
PORT = 17902


def _ps(script: str) -> str:
    return subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        capture_output=True, text=True,
    ).stdout or ""


def kill_our_tree(root_pid: int | None) -> None:
    """Kill the tree we started, then any backend_dist leftovers, by PID only."""
    if root_pid:
        subprocess.run(
            ["taskkill", "/PID", str(root_pid), "/T", "/F"],
            capture_output=True,
        )
    names = _ps(
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "
        "'disk_cleanup_backend.exe' -and $_.ExecutablePath -like "
        "'*backend_dist*' } | ForEach-Object { $_.ProcessId }"
    )
    for pid in names.split():
        subprocess.run(["taskkill", "/PID", pid, "/T", "/F"], capture_output=True)
    time.sleep(0.5)


def main() -> int:
    if not os.path.exists(EXE):
        print("missing", EXE, "- run: npm run build:backend")
        return 1
    data_dir = tempfile.mkdtemp(prefix="dca_smoke_")
    env = {**os.environ, "DISK_CLEANUP_LOG_DIR": data_dir, "PYTHONIOENCODING": "utf-8"}
    proc = subprocess.Popen(
        [EXE, "--port=" + str(PORT)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env,
    )
    failures: list[str] = []
    try:
        data = None
        for _ in range(60):
            time.sleep(0.5)
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{PORT}/api/health", timeout=2
                ) as r:
                    data = json.load(r)
                    break
            except Exception:
                if proc.poll() is not None:
                    print("backend exited early with code", proc.returncode)
                    return 1
        if data is None:
            print("health never came up")
            return 1
        print("health=", data)
        # 冻结版最容易出的事是"起来了但工具没装载上"：界面会一片空白却没人报错
        if not data.get("ok"):
            failures.append("health.ok 不为真")
        if data.get("tools", 0) < 1:
            failures.append(f"tools={data.get('tools')} 应为 >=1")
        if data.get("load_errors", 1) != 0:
            failures.append(f"load_errors={data.get('load_errors')} 应为 0")
        if data.get("routers", 0) < 20:
            failures.append(f"routers={data.get('routers')} 明显偏少（真实约 29）")
        if data.get("version") != _expected_version():
            failures.append(f"version={data.get('version')} != {_expected_version()}")
    finally:
        kill_our_tree(proc.pid)
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(6)
            except Exception:
                proc.kill()
        shutil.rmtree(data_dir, ignore_errors=True)

    print("exe-ok=", not failures, *(["| " + f for f in failures] if failures else []))
    return 0 if not failures else 1


def _expected_version() -> str:
    with open("package.json", encoding="utf-8") as f:
        return json.load(f)["version"]


if __name__ == "__main__":
    sys.exit(main())
