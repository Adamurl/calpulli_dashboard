from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import Date, case, cast, func, or_, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.reporting import MAX_REPORTING_DAYS, REPORTING_ZONE
from app.core.security import require_staff_access
from app.db.session import get_session
from app.modules.mny.legacy import LegacyVendorFacts, requested_spot_count
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
            requested_spot_count=requested_spot_count(record.responses, facts.requested_spot_count),
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


class VendorDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["accepted", "declined"]


class VendorBulkEditItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    expected_stage: VendorStage
    expected_category: str | None
    stage: Literal["applied", "accepted", "declined"] | None = None
    category: ProfileText | None = None

    @model_validator(mode="after")
    def validate_changes(self):
        if not self.model_fields_set.intersection({"stage", "category"}):
            raise ValueError("At least one change is required")
        if "stage" in self.model_fields_set and self.stage is None:
            raise ValueError("Stage cannot be null")
        return self


class VendorBulkEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[VendorBulkEditItem] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({item.id for item in self.items}) != len(self.items):
            raise ValueError("Duplicate vendor IDs")
        return self


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


class VendorActivity(BaseModel):
    current: list[int]
    previous: list[int]


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


@router.get("/categories")
def vendor_categories(session: DbSession) -> list[str]:
    try:
        categories = session.scalars(
            select(VendorApplication.category)
            .where(VendorApplication.category.is_not(None))
            .distinct()
            .order_by(VendorApplication.category)
        ).all()
        return [category for category in categories if category and category.strip()]
    except OperationalError:
        raise HTTPException(503, "Database unavailable") from None


@router.post("/bulk-edit")
def bulk_edit_vendors(
    payload: VendorBulkEdit, session: DbSession, event_year: EventYear
) -> dict[str, int]:
    try:
        with session.begin():
            ids = [item.id for item in payload.items]
            records = session.scalars(
                select(VendorApplication)
                .where(VendorApplication.event_year == event_year, VendorApplication.id.in_(ids))
                .order_by(VendorApplication.id)
                .with_for_update()
            ).all()
            if len(records) != len(ids):
                raise HTTPException(404, "A selected vendor was not found in this event year")
            by_id = {record.id: record for record in records}
            stages = dict(
                session.execute(
                    select(VendorApplication.id, vendor_stage()).where(
                        VendorApplication.id.in_(ids)
                    )
                ).all()
            )
            for item in payload.items:
                record = by_id[item.id]
                if (
                    stages[item.id] != item.expected_stage.value
                    or record.category != item.expected_category
                ):
                    raise HTTPException(
                        409, "A selected vendor changed. Refresh the list and try again."
                    )
            for item in payload.items:
                record = by_id[item.id]
                if "category" in item.model_fields_set:
                    record.category = item.category or None
                if item.stage is not None and item.stage != stages[item.id]:
                    record.responses = {
                        **record.responses,
                        "decision": {
                            "status": item.stage,
                            "created_at": datetime.now(UTC).isoformat(),
                        },
                    }
        return {"updated": len(records)}
    except OperationalError:
        raise HTTPException(503, "Database unavailable") from None


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


@router.get("/activity")
def get_vendor_activity(
    session: DbSession,
    event_year: EventYear,
    days: Annotated[int, Query(ge=1, le=MAX_REPORTING_DAYS)] = 30,
) -> VendorActivity:
    today = datetime.now(REPORTING_ZONE).date()
    earliest = today - timedelta(days=days * 2 - 1)
    start = datetime.combine(earliest, time.min, tzinfo=REPORTING_ZONE)
    end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=REPORTING_ZONE)
    local_date = cast(func.timezone(REPORTING_ZONE.key, VendorApplication.submitted_at), Date)
    try:
        rows = session.execute(
            select(local_date, func.count())
            .where(
                VendorApplication.event_year == event_year,
                VendorApplication.submitted_at >= start,
                VendorApplication.submitted_at < end,
            )
            .group_by(local_date)
        )
        counts = [0] * (days * 2)
        for submitted_date, count in rows:
            counts[(submitted_date - earliest).days] = count
    except OperationalError:
        raise HTTPException(503, "Database unavailable") from None
    return VendorActivity(current=counts[days:], previous=counts[:days])


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


@router.post("/{vendor_id}/decision")
def decide_vendor(
    vendor_id: UUID, payload: VendorDecision, session: DbSession, event_year: EventYear
) -> VendorDetail:
    try:
        with session.begin():
            record = vendor_record(vendor_id, session, event_year, lock=True)
            current = session.scalar(
                select(vendor_stage()).where(VendorApplication.id == record.id)
            )
            decision = record.responses.get("decision")
            if isinstance(decision, dict) and decision.get("status") == payload.status:
                return vendor_detail(record, session)
            if current != VendorStage.APPLIED.value:
                raise HTTPException(409, "This application is no longer awaiting a decision")
            record.responses = {
                **record.responses,
                "decision": {"status": payload.status, "created_at": datetime.now(UTC).isoformat()},
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
