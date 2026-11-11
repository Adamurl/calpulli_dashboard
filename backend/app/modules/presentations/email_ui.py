from pathlib import Path
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(include_in_schema=False)


@router.get("/staff/presentations/{inquiry_id}", response_class=HTMLResponse)
def inquiry_email_page(inquiry_id: UUID) -> HTMLResponse:
    return HTMLResponse(
        Path(__file__).with_name("email_panel.html").read_text(),
        headers={
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        },
    )
