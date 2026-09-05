"""AI 辅助分析 API（元信息分析，不传文件本体）。"""
from typing import List

from fastapi import APIRouter
from pydantic import BaseModel

from ..core import ai_analysis

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AnalyzeRequest(BaseModel):
    paths: List[str]
    with_signature: bool = False


class ConfigRequest(BaseModel):
    endpoint: str = ""
    api_key: str = ""
    model: str = ""
    timeout_s: int = 30


@router.get("/config")
def get_config():
    return ai_analysis.get_config()


@router.get("/presets")
def presets():
    """供应商预设模板列表（参考 ccSwitch 预设思路）。"""
    return {"items": ai_analysis.list_presets()}


@router.post("/config")
def set_config(payload: ConfigRequest):
    return ai_analysis.set_config(
        payload.endpoint, payload.api_key, payload.model, payload.timeout_s
    )


@router.post("/test")
def test(payload: ConfigRequest):
    """连接测试：发一条最小请求验证 endpoint/key/model 是否可用。"""
    return ai_analysis.test_connection(
        payload.endpoint, payload.api_key, payload.model,
        payload.timeout_s if payload.timeout_s else 15,
    )


@router.post("/analyze")
def analyze(payload: AnalyzeRequest):
    """分析一组文件/文件夹（只发元信息，不发文件内容）。"""
    return ai_analysis.analyze_paths(payload.paths, with_signature=payload.with_signature)
