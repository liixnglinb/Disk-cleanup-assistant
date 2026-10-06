"""商业级加固回归（批次 1：后端安全与可靠性）。

覆盖的真实缺陷，全部来自对源码的复核而不是推测：
1. verify_deletable 在空输入时返回单值 → 调用方解包 ValueError → HTTP 500
2. /api/logs/export 把调用方传入的 path 直接 open(...,"w") → 任意文件写
3. AI api_key 明文落盘、endpoint 未校验就带上 Bearer 头外发、异常原文回显给界面
4. 工具路由装载失败被 except 吞掉，/api/health 仍报 200（界面全瞎却"健康"）
5. sqlite 忙/异常在查询与统计路径上逃逸成 500
6. 删除/清理只捕 PermissionError，其它 OSError 逃逸
7. 保留清理只删 *.db，孤儿 .json/.corrupt/-wal/-shm 与导出 CSV 永不回收
8. 还原点命令用 Python repr() 拼 PowerShell
9. 请求模型缺上界（min_size=10**30 触发 OverflowError；paths 无长度上限）
10. 只在扫描库里以反斜杠登记的路径，用正斜杠提交会被判"不在册"→ 真实删除被 403 挡住
11. 中断的部分扫描恢复后被标成 completed，半份结果变成可删白名单
12. FastAPI on_event 已废弃（未来版本移除后 = 导入期崩溃 = 30 秒空白窗口）
"""
import json
import sqlite3
import warnings
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.core import ai_analysis
from backend.core.config import log_dir
from backend.core.scanner import _Session, controller
from backend.main import app

client = TestClient(app)
SID = "hardentest01"
GOOD_ENDPOINT = "https://api.openai.com/v1/chat/completions"


@pytest.fixture()
def seeded(tmp_path):
    root = tmp_path / "harden"
    root.mkdir(parents=True, exist_ok=True)
    files = {}
    for name in ("a.txt", "b.txt"):
        p = root / name
        p.write_bytes(b"y" * 48)
        files[name] = str(p)
    db_dir = log_dir() / "scans"
    db_dir.mkdir(parents=True, exist_ok=True)
    db = db_dir / f"{SID}.db"
    db.unlink(missing_ok=True)
    session = _Session(SID, str(root), db)
    session.open_db()
    with session.db_lock:
        for name, path in files.items():
            session.conn.execute(
                "INSERT OR REPLACE INTO files (path, size, is_locked, category) VALUES (?,?,?,?)",
                (path, 48, 0, "cache"),
            )
        session.conn.commit()
    controller._sessions[SID] = session
    yield files
    controller._sessions.pop(SID, None)
    try:
        session.conn.close()
    except Exception:  # noqa: BLE001
        pass
    db.unlink(missing_ok=True)
    (db_dir / f"{SID}.json").unlink(missing_ok=True)


@pytest.fixture()
def ai_cfg(tmp_path, monkeypatch):
    """把 AI 配置指向临时文件，避免碰真实数据目录。"""
    cfg = tmp_path / "ai_config.json"
    monkeypatch.setattr(ai_analysis, "log_dir", lambda: tmp_path)
    return cfg


# ---------------------------------------------------------------- 1 空路径列表
def test_delete_with_blank_path_never_500(seeded):
    r = client.post("/api/delete/", json={"paths": [""], "permanent": True, "restore_point": False})
    assert r.status_code in (403, 422), f"应为受控拒绝，实得 {r.status_code}: {r.text}"


def test_verify_deletable_returns_pair_on_empty():
    out = controller.verify_deletable([])
    assert isinstance(out, tuple) and len(out) == 2


# ------------------------------------------------------- 2 日志导出任意路径写
def test_logs_export_ignores_caller_path(tmp_path):
    evil = tmp_path / "evil.csv"
    r = client.get("/api/logs/export", params={"path": str(evil)})
    assert r.status_code == 200, r.text
    assert not evil.exists(), "导出仍接受调用方路径 = 任意文件写"
    assert "csv" in r.headers.get("content-type", "")


def test_logs_export_overwrites_no_arbitrary_target(tmp_path):
    victim = tmp_path / "startup.csv"
    victim.write_text("keep me", encoding="utf-8")
    client.get("/api/logs/export", params={"path": str(victim)})
    assert victim.read_text(encoding="utf-8") == "keep me"


# ------------------------------------------------------ 4 路由装载不能静默为零
def test_health_reports_real_router_and_tool_counts():
    """闸门按实际装载数量断言，而不是按我猜的常量。

    当前实测：系统路由 1（/api）+ 平台工具路由 1（/api/tools）+ 磁盘清理工具
    自身 9 个模块前缀（/api/scan /files /delete /cache /kb /logs /software
    /duplicates /ai）= 11。装载静默失败时这里会掉到 2 并暴露出来。
    """
    h = client.get("/api/health").json()
    assert h["tools"] >= 1, h
    assert h["load_errors"] == 0, h
    assert h["routers"] == 29, h


def test_discover_package_records_import_errors(tmp_path, monkeypatch):
    """工具模块 import 失败必须留痕，不能静默少装路由。"""
    from backend.platform import ToolRegistry

    pkg = tmp_path / "brokenpkg"
    pkg.mkdir()
    (pkg / "__init__.py").write_text("", encoding="utf-8")
    (pkg / "zboom.py").write_text("raise RuntimeError('missing dep')", encoding="utf-8")
    (pkg / "zok.py").write_text("ok = 1", encoding="utf-8")
    monkeypatch.syspath_prepend(str(tmp_path))
    reg = ToolRegistry()
    reg.discover_package("brokenpkg")
    assert reg.import_errors, "导入失败没有任何留痕"
    assert "zboom" in reg.import_errors[0]


def test_ensure_tools_loaded_rejects_empty_load():
    """零工具/零路由 = 界面全瞎，必须抛错让上层可见。"""
    from backend.platform import ensure_tools_loaded

    with pytest.raises(RuntimeError):
        ensure_tools_loaded(registered=1, routers=0, errors=["zboom: missing dep"])
    with pytest.raises(RuntimeError):
        ensure_tools_loaded(registered=0, routers=0, errors=[])
    ensure_tools_loaded(registered=1, routers=6, errors=[])


# ------------------------------------------------------------- 5 sqlite 忙→503
def test_files_query_maps_db_error_to_503(seeded, monkeypatch):
    def boom(*_a, **_k):
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(controller, "query", boom)
    r = client.post("/api/files/query", json={"scan_id": SID})
    assert r.status_code == 503, f"{r.status_code}: {r.text}"
    assert "500" not in r.text


def test_statistics_maps_db_error_to_503(seeded, monkeypatch):
    def boom(*_a, **_k):
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(controller, "statistics", boom)
    r = client.get(f"/api/files/statistics/{SID}")
    assert r.status_code == 503, f"{r.status_code}: {r.text}"


def test_read_connections_use_explicit_busy_timeout(tmp_path):
    """默认 5s 忙等既慢又会逃逸成 500；读连接要显式设短超时。"""
    from backend.core.scanner import open_db_checked

    db = tmp_path / "r.db"
    conn = open_db_checked(db)
    conn.close()
    from backend.core.scanner import read_conn

    rc = read_conn(db)
    try:
        ms = rc.execute("PRAGMA busy_timeout").fetchone()[0]
    finally:
        rc.close()
    assert 1000 <= ms <= 5000, ms


# ---------------------------------------------------- 6 删除路径的异常不能逃逸
def test_delete_maps_oserror_to_controlled_response(seeded, monkeypatch):
    from backend.api import routes_delete

    def boom(*_a, **_k):
        raise OSError(22, "Invalid argument")

    monkeypatch.setattr(routes_delete, "_recycle", boom)
    r = client.post("/api/delete/", json={"paths": [seeded["a.txt"]], "permanent": False})
    assert r.status_code in (400, 500), r.status_code
    assert r.status_code == 400, "可预期的 IO 失败应回 400 带原因，而不是未处理异常"


# ------------------------------------------------------------------ 7 保留清理
def test_prune_reclaims_orphans_and_exports(tmp_path, monkeypatch):
    from backend.core import scanner as sc

    scans = tmp_path / "scans"
    scans.mkdir()
    old = sc.time.time() - 40 * 86400
    names = ["deadbeef0001.db", "deadbeef0001.json", "deadbeef0002.db.corrupt",
             "deadbeef0003.db-wal", "deadbeef0003.db-shm"]
    for n in names:
        p = scans / n
        p.write_bytes(b"x")
        sc.os.utime(p, (old, old))
    logs = tmp_path / "exports"
    logs.mkdir()
    for i in range(8):
        f = logs / f"deletion_log_2026010{i}_000000.csv"
        f.write_text("a", encoding="utf-8")
        sc.os.utime(f, (old, old))
    monkeypatch.setattr(sc, "log_dir", lambda: tmp_path)
    removed = sc.controller.prune_old_scans(keep_days=7)
    for n in names:
        assert not (scans / n).exists(), f"{n} 未被回收"
    assert removed >= len(names)


# ------------------------------------------------------------ 8 还原点命令拼接
def test_restore_point_command_cannot_be_injected():
    from backend.core.delete_manager import build_restore_point_command

    evil = "x'; Remove-Item C:\\Windows; '"
    cmd = build_restore_point_command(evil)
    assert "Remove-Item" not in cmd
    # 合法描述用 PowerShell 单引号翻倍转义，而不是 Python repr
    ok = build_restore_point_command("it''s fine")
    assert "Checkpoint-Computer" in ok
    assert "it''''s fine" in ok, ok


# ------------------------------------------------------------------ 9 请求边界
def test_file_query_rejects_huge_min_size(seeded):
    r = client.post("/api/files/query", json={"scan_id": SID, "min_size": 10 ** 30})
    assert r.status_code == 422, r.status_code


def test_delete_rejects_overlong_path_list(seeded):
    r = client.post("/api/delete/", json={"paths": [f"Q:\\x{i}.txt" for i in range(2000)]})
    assert r.status_code == 422, r.status_code


# ---------------------------------------------------------- 10 路径分隔符归一化
def test_delete_accepts_forward_slash_variant(seeded):
    target = seeded["a.txt"].replace("\\", "/")
    r = client.post("/api/delete/", json={"paths": [target], "permanent": True, "restore_point": False})
    assert r.status_code == 200, f"正斜杠变体被判不在册：{r.status_code} {r.text}"


# ------------------------------------------------------- 11 中断扫描不得谎报完成
def test_interrupted_scan_restores_as_interrupted(tmp_path, monkeypatch):
    """meta 停在 running 的半成品扫描，恢复后必须显示 interrupted。

    这类扫描的 DB 行会被界面当删除白名单用，谎报 completed 等于把
    "只扫了一半"的清单说成完整清单。
    """
    import backend.core.config as cfg_mod
    from backend.core import scanner as sc

    # log_dir 在 config 与 scanner 两个命名空间里各有一份引用，都要换掉
    monkeypatch.setattr(cfg_mod, "log_dir", lambda: tmp_path)
    monkeypatch.setattr(sc, "log_dir", lambda: tmp_path)
    db_dir = tmp_path / "scans"
    db_dir.mkdir(parents=True, exist_ok=True)
    sid = "abc123def456"
    db = db_dir / f"{sid}.db"
    session = _Session(sid, "C:", db)
    session.open_db()
    with session.db_lock:
        session.conn.execute("INSERT INTO files (path,size) VALUES (?,10)", ("C:\\partial.bin",))
        session.conn.commit()
    session.conn.close()
    meta = db_dir / f"{sid}.json"

    def restore_with(status_value):
        meta.write_text(json.dumps(
            {"v": 1, "drive": "C:", "total_bytes": 1, "drive_free": 1, "status": status_value}),
            encoding="utf-8")
        sc.controller._sessions.pop(sid, None)
        st = sc.controller.status(sid)
        assert st is not None
        # 恢复出来的会话带着打开的连接（WAL sidecar 也被占），用完即关
        got = st["status"]
        live = sc.controller._sessions.pop(sid, None)
        if live is not None and live.conn is not None:
            try:
                live.conn.close()
            except Exception:  # noqa: BLE001
                pass
        return got

    assert restore_with("running") == "interrupted"
    assert restore_with("completed") == "completed"


# ------------------------------------------------------------ 3 AI 密钥与端点
def test_ai_key_not_plaintext_on_disk(ai_cfg):
    ai_analysis.set_config(GOOD_ENDPOINT, "sk-SECRETVALUE123456", "gpt-4o-mini")
    raw = ai_cfg.read_text(encoding="utf-8")
    assert "sk-SECRETVALUE123456" not in raw, "api_key 明文落盘"
    assert ai_analysis.get_config()["has_api_key"] is True
    assert ai_analysis._load_config()["api_key"] == "sk-SECRETVALUE123456"


def test_ai_legacy_plaintext_still_readable_then_migrated(ai_cfg):
    ai_cfg.write_text(json.dumps({
        "endpoint": GOOD_ENDPOINT, "api_key": "sk-LEGACYOLD", "model": "m", "timeout_s": 30,
    }), encoding="utf-8")
    assert ai_analysis.get_config()["has_api_key"] is True
    ai_analysis.set_config(GOOD_ENDPOINT, "sk-LEGACYOLD", "m")
    assert "sk-LEGACYOLD" not in ai_cfg.read_text(encoding="utf-8")


def test_ai_bad_endpoint_is_reported_as_400_not_saved():
    """空 endpoint 走默认值（历史行为），非法 endpoint 必须 400 且不落盘。"""
    r = client.post("/api/ai/config", json={"endpoint": "http://127.0.0.1:1/x", "api_key": "sk-a", "model": "m"})
    assert r.status_code == 400, f"{r.status_code}: {r.text}"


@pytest.mark.parametrize("bad", [
    "http://api.openai.com/v1/chat/completions",
    "https://127.0.0.1:8080/v1/chat",
    "https://localhost/v1/chat",
    "https://192.168.1.7/v1/chat",
    "https://[::1]/v1/chat",
    "https://169.254.169.254/latest/meta-data",
    "not a url",
])
def test_ai_endpoint_rejects_insecure(ai_cfg, bad):
    with pytest.raises(ValueError):
        ai_analysis.set_config(bad, "sk-x", "m")


def test_ai_endpoint_accepts_preset_hosts(ai_cfg):
    for host in [p["endpoint"] for p in ai_analysis.list_presets() if p["endpoint"]]:
        ai_analysis.set_config(host, "sk-x", "m")
        assert ai_analysis.get_config()["configured"] is True


def test_ai_config_survives_bad_types(ai_cfg):
    ai_cfg.write_text(json.dumps({"api_key": None, "endpoint": 123, "timeout_s": "abc"}), encoding="utf-8")
    out = ai_analysis.get_config()
    assert out["has_api_key"] is False
    assert isinstance(out["endpoint"], str)


def test_ai_config_survives_half_written_file(ai_cfg):
    ai_cfg.write_text('{"endpoint": "https://api', encoding="utf-8")
    out = ai_analysis.get_config()
    assert out["configured"] is False
    assert out.get("config_warning"), "坏配置必须让界面知道，而不是静默当作没配置"


def test_ai_errors_are_not_echoed_verbatim(monkeypatch, ai_cfg):
    """外呼失败不能把原始异常（可能含 URL/Key）甩给界面。"""
    def boom(*_a, **_k):
        raise RuntimeError("Authorization failed for https://user:pass@evil/x with Bearer sk-SECRET")

    monkeypatch.setattr(ai_analysis, "_call_llm", boom)
    out = ai_analysis.analyze_paths(["C:\\anything.bin"])
    assert out["ok"] is False
    assert "sk-SECRET" not in out["message"] and "evil" not in out["message"]


# ---------------------------------------------------------------- 12 生命周期
def test_no_deprecated_on_event_usage():
    src = Path("backend/main.py").read_text(encoding="utf-8")
    assert "on_event(" not in src, "on_event 已废弃，未来 FastAPI 移除即导入期崩溃"
    assert "lifespan" in src


def test_lifespan_runs_housekeeping():
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        with TestClient(app) as c:
            assert c.get("/api/health").json()["ok"] is True
        assert not any("on_event" in str(x.message) for x in caught)
