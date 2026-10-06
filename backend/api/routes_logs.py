"""删除日志 API（P1）：列表 + 导出 CSV。"""
from fastapi import APIRouter
from fastapi.responses import FileResponse, PlainTextResponse

from ..core.audit_log import export_csv, list_logs

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("/")
def get_logs():
    rows = list_logs()
    return {"items": rows, "total": len(rows)}


@router.get("/export")
def export():
    """导出到数据目录下的固定文件名并回传。

    这个接口以前收调用方的 path 参数并直接 open(...,"w")：本地任何能连到
    后端的进程都能把内容写到用户可写的任意位置（例如「启动」文件夹）。
    导出目标属于服务端自己的数据目录，不由请求方决定；连参数一起删掉，
    旧客户端多带的 ?path= 会被 FastAPI 忽略，不会报错。
    """
    target = export_csv(None)
    return FileResponse(target, filename="删除日志.csv", media_type="text/csv")
