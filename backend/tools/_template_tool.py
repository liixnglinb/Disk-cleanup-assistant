"""NEW TOOL TEMPLATE (backend side).

Copy to backend/tools/<your_tool_id>.py and implement your FastAPI routes.
The platform auto-discovers any module-level ``TOOL`` below.

Note: files starting with ``_`` are ignored so this template is NOT loaded.
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..platform import ToolSpec

__version__ = "0.1.0"

router = APIRouter(prefix="/api/<your_tool_id>", tags=["<your_tool_id>"])


@router.get("/hello")
def hello():
    return {"tool": "<your_tool_id>", "message": "hi from your new tool"}


def _routers():
    return [router]


TOOL = ToolSpec(
    id="<your_tool_id>",
    name="<Your Tool Name>",
    description="Short description of your tool.",
    icon="??",
    version=__version__,
    frontend_panel="<your_tool_id>",
    include_router=_routers,
)
