"""AI 辅助文件分析（元信息分析，绝不传输文件本体）。

设计红线：
- 只把文件的【路径、扩展名、大小、时间戳、所在目录、数字签名发布者】发给大模型
- ❌ 绝不读取、上传文件的二进制内容（隐私 / 流量 / 成本）
- AI 结果仅作参考，删除权限永远在用户手里

三分类（与用户方案对齐）：
- A 类：系统文件/浏览器缓存/微信缓存等 → 本地规则直接打标签，不走 AI
- B 类：存疑未知文件（扫描时 needs_ai=1）→ 批量交 AI
- C 类：用户手动选中的某个文件/文件夹 → 点「AI 分析此文件」单独交 AI
"""
import json
import os
import re
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import List, Optional

from .config import log_dir

# ---------------------------------------------------------------------------
# 配置存储（endpoint / api_key / model）
# ---------------------------------------------------------------------------
_CONFIG_PATH = Path(log_dir()) / "ai_config.json"

# 供应商预设模板（OpenAI 兼容 chat/completions）——参考 ccSwitch 预设思路：
# 选预设自动填充 endpoint + 默认模型，用户只需填 API Key
_PROVIDER_PRESETS = [
    {"id": "openai", "name": "OpenAI 官方", "endpoint": "https://api.openai.com/v1/chat/completions", "model": "gpt-4o-mini"},
    {"id": "deepseek", "name": "DeepSeek", "endpoint": "https://api.deepseek.com/v1/chat/completions", "model": "deepseek-chat"},
    {"id": "zhipu", "name": "智谱 GLM", "endpoint": "https://open.bigmodel.cn/api/paas/v4/chat/completions", "model": "glm-4-flash"},
    {"id": "kimi", "name": "月之暗面 Kimi", "endpoint": "https://api.moonshot.cn/v1/chat/completions", "model": "moonshot-v1-8k"},
    {"id": "qwen", "name": "阿里云百炼", "endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "model": "qwen-plus"},
    {"id": "ark", "name": "火山方舟", "endpoint": "https://ark.cn-beijing.volces.com/api/v3/chat/completions", "model": "doubao-lite-32k"},
    {"id": "siliconflow", "name": "硅基流动", "endpoint": "https://api.siliconflow.cn/v1/chat/completions", "model": "Qwen/Qwen2.5-7B-Instruct"},
    {"id": "custom", "name": "自定义", "endpoint": "", "model": ""},
]

_DEFAULTS = {
    "endpoint": "https://api.openai.com/v1/chat/completions",
    "api_key": "",
    "model": "gpt-4o-mini",
    "timeout_s": 30,
}


def list_presets() -> list:
    """返回供应商预设列表。"""
    return [dict(p) for p in _PROVIDER_PRESETS]


def _load_config() -> dict:
    cfg = dict(_DEFAULTS)
    try:
        if _CONFIG_PATH.exists():
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved, dict):
                cfg.update(saved)
    except Exception:
        pass
    return cfg


def _save_config(cfg: dict) -> None:
    try:
        _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def get_config() -> dict:
    """返回配置状态；api_key 脱敏，只回传是否已配置。"""
    cfg = _load_config()
    key = cfg.get("api_key", "")
    return {
        "configured": bool(key and cfg.get("endpoint") and cfg.get("model")),
        "endpoint": cfg.get("endpoint", ""),
        "model": cfg.get("model", ""),
        "has_api_key": bool(key),
        "api_key_hint": (key[:4] + "****" + key[-4:]) if len(key) >= 8 else ("****" if key else ""),
    }


def set_config(endpoint: str, api_key: str, model: str, timeout_s: int = 30) -> dict:
    """保存配置。api_key 为空时清除。"""
    cfg = _load_config()
    cfg["endpoint"] = endpoint.strip() or _DEFAULTS["endpoint"]
    cfg["model"] = model.strip() or _DEFAULTS["model"]
    cfg["timeout_s"] = max(10, min(120, int(timeout_s or 30)))
    if api_key.strip():
        cfg["api_key"] = api_key.strip()
    else:
        cfg["api_key"] = ""
    _save_config(cfg)
    return get_config()


def test_connection(endpoint: str, api_key: str, model: str, timeout_s: int = 15) -> dict:
    """连接测试：发一条最小消息，返回成功/失败与延迟（毫秒）。

    参考 ccSwitch 的「Test / 测速」交互：绿色=成功并显示延迟。
    不保存配置，只做连通性验证。endpoint 为空时用已保存的配置。
    """
    cfg = _load_config()
    endpoint = (endpoint or "").strip() or cfg.get("endpoint", "")
    api_key = (api_key or "").strip() or cfg.get("api_key", "")
    model = (model or "").strip() or cfg.get("model", "")
    if not endpoint:
        return {"ok": False, "message": "请先填写 API 端点"}
    if not api_key:
        return {"ok": False, "message": "请先填写 API Key"}
    if not model:
        return {"ok": False, "message": "请先填写模型名称"}

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 5,
    }
    try:
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            resp.read()
        latency = int((time.time() - t0) * 1000)
        return {"ok": True, "latency_ms": latency, "message": f"连接成功 · {latency}ms"}
    except urllib.error.HTTPError as exc:
        # 尝试读取错误详情
        detail = ""
        try:
            detail = exc.read().decode("utf-8", "replace")[:200]
        except Exception:
            pass
        return {"ok": False, "message": f"HTTP {exc.code}：{detail or exc.reason}"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": f"连接失败：{exc}"}


# ---------------------------------------------------------------------------
# 元信息收集（绝不读文件内容）
# ---------------------------------------------------------------------------
def _file_meta(path: str, with_signature: bool = False) -> dict:
    p = Path(path)
    meta = {
        "path": path,
        "name": p.name,
        "ext": p.suffix.lower(),
        "size": 0,
        "mtime": None,
        "ctime": None,
        "dir": str(p.parent),
    }
    try:
        st = p.stat()
        meta["size"] = st.st_size
        meta["mtime"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime))
        meta["ctime"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_ctime))
    except OSError:
        pass
    if with_signature:
        meta["signature"] = _signature_publisher(path)
    return meta


def _signature_publisher(path: str) -> str:
    """读取文件的数字签名发布者（仅对 C 类单文件，代价高，不做全盘）。"""
    try:
        ps = (
            "$sig = Get-AuthenticodeSignature -LiteralPath '{p}'; "
            "if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '' }"
        ).replace("{p}", path.replace("'", "''"))
        out = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
            capture_output=True, text=True, timeout=15,
        )
        subject = (out.stdout or "").strip()
        if not subject:
            return ""
        # 从 Subject 提取 CN（通用名）
        m = re.search(r"CN=([^,]+)", subject, re.IGNORECASE)
        return m.group(1).strip() if m else subject[:80]
    except Exception:
        return ""


def _is_dir(path: str) -> bool:
    return os.path.isdir(path)


def collect_meta(paths: List[str], with_signature: bool = False) -> List[dict]:
    """收集一组路径的元信息；目录只取目录本身信息。"""
    metas = []
    for path in paths:
        path = path.strip()
        if not path:
            continue
        if _is_dir(path):
            metas.append({
                "path": path, "name": os.path.basename(path.rstrip("\\/")),
                "ext": "", "size": 0, "mtime": None, "ctime": None,
                "dir": str(Path(path).parent), "is_dir": True,
            })
        else:
            m = _file_meta(path, with_signature=with_signature)
            m["is_dir"] = False
            metas.append(m)
    return metas


# ---------------------------------------------------------------------------
# 大模型调用（urllib 实现 OpenAI 兼容接口）
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = (
    "你是 Windows 文件用途分析助手。用户会给你一批文件的【元信息】（路径、扩展名、大小、"
    "修改/创建时间、所在目录、可能还有数字签名发布者），不会给你文件内容。"
    "请根据这些元信息，结合 Windows 软件的常见目录与文件命名惯例，推断每个文件的来源、用途、"
    "风险等级与是否建议删除。只输出 JSON，不要输出任何解释文字。"
    'JSON 格式：{"files":[{"path":"...","source":"来源推测","purpose":"用途说明",'
    '"risk":"low|medium|high","suggest_delete":"yes|no|caution","detail":"详细说明"}]}'
)


def _call_llm(metas: List[dict]) -> dict:
    cfg = _load_config()
    if not (cfg.get("api_key") and cfg.get("endpoint") and cfg.get("model")):
        raise RuntimeError("AI 未配置：请在设置中填写 API 端点、Key 与模型")

    user_prompt = json.dumps({"files": metas}, ensure_ascii=False, indent=2)
    payload = {
        "model": cfg["model"],
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
    }
    req = urllib.request.Request(
        cfg["endpoint"],
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['api_key']}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=cfg["timeout_s"]) as resp:
        body = resp.read().decode("utf-8", "replace")
    data = json.loads(body)
    content = data["choices"][0]["message"]["content"]
    return _parse_llm_json(content)


def _parse_llm_json(text: str) -> dict:
    """从 LLM 输出中稳健提取 JSON（容忍 markdown 代码围栏与前后杂质）。"""
    # 去掉 ```json ... ``` 围栏
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    # 找到第一个 { 到最后一个 }
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise RuntimeError("AI 返回格式无法解析")
    try:
        obj = json.loads(cleaned[start:end + 1])
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"AI 返回 JSON 解析失败: {exc}")
    if not isinstance(obj, dict) or "files" not in obj:
        raise RuntimeError("AI 返回缺少 files 字段")
    return obj


def analyze_paths(paths: List[str], with_signature: bool = False) -> dict:
    """对外主入口：收集元信息 → 调大模型 → 返回结构化结果。"""
    if not paths:
        return {"ok": False, "message": "请选择要分析的文件"}
    metas = collect_meta(paths, with_signature=with_signature)
    try:
        result = _call_llm(metas)
        return {"ok": True, "items": result.get("files", []), "analyzed": len(metas)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": str(exc), "items": []}
