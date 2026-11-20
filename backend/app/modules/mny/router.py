from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.security import require_staff_access
from app.db.session import get_session
from app.modules.mny.legacy import LegacyVendorFacts
from app.modules.mny.models import VendorApplication
from app.modules.mny.stage import VendorStage, vendor_stage

router = APIRouter(
    prefix="/mny/vendors", tags=["mny"], dependencies=[Depends(require_staff_access)]
)
DbSession = Annotated[Session, Depends(get_session)]
EventYear = Annotated[int, Query(ge=2000, le=9999)]


class VendorSummary(BaseModel):
    id: UUID
    event_year: int
    source: Literal["form_csv", "legacy_vendor"]
    business_name: str | None
    category: str | None
    submitted_at: datetime | None
    follower_count: int | None
    contact_name: str | None
    requested_spot_count: int | None
    assigned_spot_labels: list[str] | None
    paid_before_deadline: bool | None
    stage: VendorStage

    @classmethod
    def from_record(cls, record: VendorApplication, stage: VendorStage) -> "VendorSummary":
        facts = LegacyVendorFacts.from_snapshot(
            record.responses.get("legacy_vendor"), record.responses.get("linked_spots")
        )
        return cls(
            id=record.id,
            event_year=record.event_year,
            source=record.source,
            business_name=record.business_name,
            category=record.category,
            submitted_at=record.submitted_at,
            follower_count=record.follower_count,
            contact_name=record.contact_name,
            requested_spot_count=facts.requested_spot_count,
            assigned_spot_labels=facts.assigned_spot_labels,
            paid_before_deadline=facts.paid_before_deadline,
            stage=stage,
        )


class VendorDetail(VendorSummary):
    email: str | None
    phone: str | None
    follower_response: str | None
    responses: dict[str, Any]
    previous_id: UUID | None
    next_id: UUID | None


ProfileText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class VendorPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    business_name: ProfileText | None = None
    category: ProfileText | None = None
    contact_name: ProfileText | None = None
    email: ProfileText | None = None
    phone: ProfileText | None = None
    requested_space: ProfileText | None = None
    website: ProfileText | None = None
    instagram: ProfileText | None = None
    facebook: ProfileText | None = None
    staff_note: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=10000)] | None
    ) = None


class VendorCommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)]


class VendorComment(VendorCommentCreate):
    id: UUID
    created_at: datetime


class VendorList(BaseModel):
    items: list[VendorSummary]
    limit: int
    offset: int
    total: int


class VendorStatistics(BaseModel):
    total_vendors: int
    total_paid: float | None
    requested_spots: int | None
    assigned_spots: int | None


@router.get("")
def list_vendors(
    session: DbSession,
    event_year: EventYear,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=2147483647)] = 0,
    q: Annotated[str, Query(max_length=200)] = "",
    stage: VendorStage | None = None,
    sort: Literal["name", "received", "contact", "category", "stage"] = "name",
    direction: Literal["asc", "desc"] = "asc",
) -> VendorList:
    stage_value = vendor_stage()
    matching = select(VendorApplication, stage_value).where(
        VendorApplication.event_year == event_year
    )
    if stage is not None:
        matching = matching.where(stage_value == stage.value)
    if term := q.strip():
        matching = matching.where(
            or_(
                VendorApplication.business_name.icontains(term, autoescape=True),
                VendorApplication.contact_name.icontains(term, autoescape=True),
                VendorApplication.category.icontains(term, autoescape=True),
            )
        )
    order_column = {
        "name": VendorApplication.business_name,
        "received": VendorApplication.submitted_at,
        "contact": func.lower(func.nullif(func.btrim(VendorApplication.contact_name), "")),
        "category": func.lower(func.nullif(func.btrim(VendorApplication.category), "")),
        "stage": case(
            {
                value.value: index
                for index, value in enumerate(VendorStage)
                if value != VendorStage.UNKNOWN
            },
            value=stage_value,
        ),
    }[sort]
    order = order_column.asc() if direction == "asc" else order_column.desc()
    try:
        total = session.scalar(select(func.count()).select_from(matching.subquery()))
        records = session.execute(
            matching.order_by(order.nulls_last(), VendorApplication.id).limit(limit).offset(offset)
        ).all()
    except OperationalError:
        raise HTTPException(503, "Database unavailable") from None
    return VendorList(
        items=[VendorSummary.from_record(record, VendorStage(value)) for record, value in records],
        limit=limit,
        offset=offset,
        total=total or 0,
    )


@router.get("/statistics")
def get_statistics(session: DbSession, event_year: EventYear) -> VendorStatistics:
    try:
        rows = session.execute(
            select(
                VendorApplication.responses["legacy_vendor"],
                VendorApplication.responses["linked_spots"],
            ).where(VendorApplication.event_year == event_year)
        )
        total_vendors = 0
        total_paid: Decimal | None = None
        requested_spots: int | None = None
        assigned_spots: int | None = None
        for vendor, links in rows:
            total_vendors += 1
            facts = LegacyVendorFacts.from_snapshot(vendor, links)
            if facts.amount_paid is not None:
                total_paid = (total_paid or Decimal(0)) + facts.amount_paid
            if facts.requested_count is not None:
                requested_spots = (requested_spots or 0) + facts.requested_count
            if facts.assigned_count is not None:
                assigned_spots = (assigned_spots or 0) + facts.assigned_count
    except OperationalError:
        raise HTTPException(503, "Database unavailable") from None
    return VendorStatistics(
        total_vendors=total_vendors,
        total_paid=float(total_paid) if total_paid is not None else None,
        requested_spots=requested_spots,
        assigned_spots=assigned_spots,
    )


def vendor_record(
    vendor_id: UUID, session: Session, event_year: int, *, lock: bool = False
) -> VendorApplication:
    query = select(VendorApplication).where(
        VendorApplication.id == vendor_id, VendorApplication.event_year == event_year
    )
    record = session.scalar(query.with_for_update() if lock else query)
    if record is None:
        raise HTTPException(404)
    return record


def vendor_detail(record: VendorApplication, session: Session) -> VendorDetail:
    order = (VendorApplication.business_name, VendorApplication.id)
    neighbors = (
        select(
            VendorApplication.id,
            func.lag(VendorApplication.id).over(order_by=order).label("previous_id"),
            func.lead(VendorApplication.id).over(order_by=order).label("next_id"),
        )
        .where(VendorApplication.event_year == record.event_year)
        .subquery()
    )
    previous_id, next_id, stage = session.execute(
        select(neighbors.c.previous_id, neighbors.c.next_id, vendor_stage())
        .select_from(neighbors)
        .join(VendorApplication, VendorApplication.id == neighbors.c.id)
        .where(neighbors.c.id == record.id)
    ).one()
    return VendorDetail(
        **VendorSummary.from_record(record, VendorStage(stage)).model_dump(),
        email=record.email,
        phone=record.phone,
        follower_response=record.follower_response,
        responses=record.responses,
        previous_id=previous_id,
        next_id=next_id,
    )


@router.get("/{vendor_id}")
def get_vendor(vendor_id: UUID, session: DbSession, event_year: EventYear) -> VendorDetail:
    try:
        return vendor_detail(vendor_record(vendor_id, session, event_year), session)
    except OperationalError:
        raise HTTPException(503, "Database unavailable") from None


@router.patch("/{vendor_id}")
def update_vendor(
    vendor_id: UUID, payload: VendorPatch, session: DbSession, event_year: EventYear
) -> VendorDetail:
    try:
        with session.begin():
            record = vendor_record(vendor_id, session, event_year, lock=True)
            changes = payload.model_dump(exclude_unset=True)
            for field in ("business_name", "category", "contact_name", "email", "phone"):
                if field in changes:
                    setattr(record, field, changes.pop(field) or None)
            if changes:
                staff_details = record.responses.get("staff_details", {})
                record.responses = {
                    **record.responses,
                    "staff_details": {
                        **staff_details,
                        **{field: value or None for field, value in changes.items()},
                    },
                }
            session.flush()
            return vendor_detail(record, session)
    except OperationalError:
        raise HTTPException(503, "Database unavailable") from None


@router.post("/{vendor_id}/comments", status_code=201)
def add_vendor_comment(
    vendor_id: UUID, payload: VendorCommentCreate, session: DbSession, event_year: EventYear
) -> VendorComment:
    comment = VendorComment(id=uuid4(), body=payload.body, created_at=datetime.now(UTC))
    try:
        with session.begin():
            record = vendor_record(vendor_id, session, event_year, lock=True)
            record.responses = {
                **record.responses,
                "comments": [
                    *record.responses.get("comments", []),
                    comment.model_dump(mode="json"),
                ],
            }
    except OperationalError:
        raise HTTPException(503, "Database unavailable") from None
    return comment
