"""AI 辅助分析 API（元信息分析，不传文件本体）。"""
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core import ai_analysis

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AnalyzeRequest(BaseModel):
    paths: List[str] = Field(..., min_length=1, max_length=200)
    with_signature: bool = False


class ConfigRequest(BaseModel):
    endpoint: str = Field(default="", max_length=400)
    api_key: str = Field(default="", max_length=400)
    model: str = Field(default="", max_length=200)
    timeout_s: int = Field(default=30, ge=10, le=120)
    # 留空 api_key 是"不改动 Key"，清空必须显式带这个标志（界面有单独的清除按钮）
    clear_key: bool = False


@router.get("/config")
def get_config():
    return ai_analysis.get_config()


@router.get("/presets")
def presets():
    """供应商预设模板列表（参考 ccSwitch 预设思路）。"""
    return {"items": ai_analysis.list_presets()}


@router.post("/config")
def set_config(payload: ConfigRequest):
    # endpoint 校验不过、或配置文件写不下去，都必须让界面看到失败，
    # 而不是显示"已保存"（旧实现把异常全吞了，Key 根本没落盘）。
    try:
        return ai_analysis.set_config(
            payload.endpoint, payload.api_key, payload.model, payload.timeout_s,
            clear_key=payload.clear_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"配置保存失败：{exc.strerror or exc}")


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
