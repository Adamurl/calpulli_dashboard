from datetime import date, datetime, time, timedelta

from sqlalchemy import Date, Text, cast, func, or_, select
from sqlalchemy.orm import Session

from app.core.reporting import REPORTING_ZONE
from app.modules.presentations.index_schemas import (
    PresentationIndex,
    PresentationSort,
    PresentationStatistics,
    StatisticSeries,
)
from app.modules.presentations.models import PresentationRequest
from app.modules.presentations.schemas import PresentationStatus, PresentationSummary


def read_index(
    session: Session,
    *,
    limit: int,
    offset: int,
    q: str,
    status: PresentationStatus | None,
    sort: PresentationSort,
) -> PresentationIndex:
    predicates = []
    if status is not None:
        predicates.append(PresentationRequest.status == status)
    if query := q.strip():
        predicates.append(
            or_(
                *[
                    field.icontains(query, autoescape=True)
                    for field in (
                        PresentationRequest.contact_full_name,
                        PresentationRequest.organization_name,
                        PresentationRequest.contact_email,
                        PresentationRequest.event_purpose,
                        PresentationRequest.venue_address,
                        func.replace(cast(PresentationRequest.event_types, Text), "_", " "),
                    )
                ]
            )
        )
    count = select(func.count()).select_from(PresentationRequest)
    total = session.scalar(count.where(*predicates)) or 0
    total_all = (session.scalar(count) or 0) if predicates else total
    field, direction = sort.rsplit("_", 1)
    sort_columns = {
        "received": PresentationRequest.received_at,
        "date": PresentationRequest.event_date,
        "name": func.lower(func.nullif(func.trim(PresentationRequest.contact_full_name), "")),
        "organization": func.lower(
            func.nullif(func.trim(PresentationRequest.organization_name), "")
        ),
        "guests": PresentationRequest.estimated_guests,
        "status": PresentationRequest.status,
    }
    column = sort_columns[field]
    order = column.asc() if direction == "asc" else column.desc()
    columns = [getattr(PresentationRequest, name) for name in PresentationSummary.model_fields]
    rows = session.execute(
        select(*columns)
        .where(*predicates)
        .order_by(
            order.nulls_last(),
            PresentationRequest.created_at.desc(),
            PresentationRequest.id.desc(),
        )
        .limit(limit)
        .offset(offset)
    ).mappings()
    return PresentationIndex(
        items=[PresentationSummary.model_validate(row) for row in rows],
        limit=limit,
        offset=offset,
        total=total,
        total_all=total_all,
    )


def read_statistics(
    session: Session, *, days: int, today: date | None = None
) -> PresentationStatistics:
    end_date = today if today is not None else datetime.now(REPORTING_ZONE).date()
    first_day = end_date - timedelta(days=days * 2 - 1)
    lower = datetime.combine(first_day, time.min, tzinfo=REPORTING_ZONE)
    upper = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=REPORTING_ZONE)
    local_day = cast(func.timezone(REPORTING_ZONE.key, PresentationRequest.received_at), Date)
    rows = session.execute(
        select(local_day, PresentationRequest.status, func.count())
        .where(PresentationRequest.received_at >= lower, PresentationRequest.received_at < upper)
        .group_by(local_day, PresentationRequest.status)
    )
    metrics = [
        StatisticSeries(key=key, current=[0] * days, previous=[0] * days)
        for key in ("presentations", "reviewing", "booked", "completed")
    ]
    for received_day, status, count in rows:
        position = (received_day - first_day).days
        for metric in metrics:
            if metric.key == "presentations" or metric.key == status:
                values = metric.previous if position < days else metric.current
                values[position % days] += count
    return PresentationStatistics(
        days=days,
        start_date=end_date - timedelta(days=days - 1),
        end_date=end_date,
        metrics=metrics,
    )
