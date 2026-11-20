from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.security import require_staff_access
from app.db.session import get_session
from app.modules.mny.models import VendorApplication

router = APIRouter(
    prefix="/mny/vendors", tags=["mny"], dependencies=[Depends(require_staff_access)]
)
DbSession = Annotated[Session, Depends(get_session)]
EventYear = Annotated[int, Query(ge=2000, le=9999)]


class VendorSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_year: int
    source: Literal["form_csv", "legacy_vendor"]
    business_name: str | None
    category: str | None
    submitted_at: datetime | None
    follower_count: int | None


class VendorDetail(VendorSummary):
    contact_name: str | None
    email: str | None
    phone: str | None
    follower_response: str | None
    responses: dict[str, Any]


class VendorList(BaseModel):
    items: list[VendorSummary]
    limit: int
    offset: int


@router.get("")
def list_vendors(
    session: DbSession,
    event_year: EventYear,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=2147483647)] = 0,
) -> VendorList:
    try:
        records = session.scalars(
            select(VendorApplication)
            .where(VendorApplication.event_year == event_year)
            .order_by(VendorApplication.business_name, VendorApplication.id)
            .limit(limit)
            .offset(offset)
        ).all()
    except OperationalError:
        raise HTTPException(503, "Database unavailable") from None
    return VendorList(
        items=[VendorSummary.model_validate(record) for record in records],
        limit=limit,
        offset=offset,
    )


@router.get("/{vendor_id}")
def get_vendor(vendor_id: UUID, session: DbSession, event_year: EventYear) -> VendorDetail:
    try:
        record = session.scalar(
            select(VendorApplication).where(
                VendorApplication.id == vendor_id, VendorApplication.event_year == event_year
            )
        )
    except OperationalError:
        raise HTTPException(503, "Database unavailable") from None
    if record is None:
        raise HTTPException(404)
    return VendorDetail.model_validate(record)
