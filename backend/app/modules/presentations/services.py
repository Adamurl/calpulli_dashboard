from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.presentations.email_service import recommend_state
from app.modules.presentations.models import PresentationActivity, PresentationRequest
from app.modules.presentations.schemas import NewPresentation, PresentationPatch


class PresentationNotFound(Exception):
    pass


class PresentationConflict(Exception):
    pass


def get_presentation(session: Session, request_id: UUID) -> PresentationRequest:
    result = session.get(PresentationRequest, request_id)
    if result is None:
        raise PresentationNotFound
    return result


def list_presentations(
    session: Session, *, limit: int, offset: int, source: str | None, status: str | None
) -> list[PresentationRequest]:
    query = select(PresentationRequest)
    if source is not None:
        query = query.where(PresentationRequest.source == source)
    if status is not None:
        query = query.where(PresentationRequest.status == status)
    return list(
        session.scalars(
            query.order_by(PresentationRequest.created_at.desc(), PresentationRequest.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )


def create_presentation(
    session: Session,
    payload: NewPresentation,
    *,
    source: str = "manual",
    source_key: str | None = None,
    external_id: str | None = None,
) -> tuple[PresentationRequest, bool]:
    if source not in {"manual", "wix"}:
        raise ValueError("New presentations require a manual or Wix source")
    if source == "wix" and (not source_key or not external_id):
        raise ValueError("Wix submissions require source_key and external_id")
    snapshot = payload.model_dump(mode="json")
    values = payload.model_dump()
    values.update(
        id=uuid4(),
        source=source,
        source_key=source_key,
        external_id=external_id,
        form_version="presentation_v2",
        status="new",
        received_at=datetime.now(UTC),
        contact_full_name=f"{payload.contact_first_name} {payload.contact_last_name}",
        original_fields=snapshot,
    )
    try:
        statement = insert(PresentationRequest).values(**values)
        if source_key is not None and external_id is not None:
            statement = statement.on_conflict_do_nothing(
                constraint="uq_presentation_source_identity"
            )
        created_id = session.scalar(statement.returning(PresentationRequest.id))
        if created_id is None:
            existing = session.scalar(
                select(PresentationRequest).where(
                    PresentationRequest.source == source,
                    PresentationRequest.source_key == source_key,
                    PresentationRequest.external_id == external_id,
                )
            )
            if existing is None or existing.original_fields != snapshot:
                raise PresentationConflict
            session.commit()
            return existing, False
        session.add(PresentationActivity(request_id=created_id, kind="created", new_status="new"))
        recommend_state(session, get_presentation(session, created_id))
        session.commit()
        return get_presentation(session, created_id), True
    except Exception:
        session.rollback()
        raise


def update_presentation(
    session: Session,
    request_id: UUID,
    payload: PresentationPatch,
    *,
    actor_id: str | None = None,
    recommend_email: bool = True,
) -> PresentationRequest:
    try:
        request = session.scalar(
            select(PresentationRequest)
            .where(PresentationRequest.id == request_id)
            .with_for_update()
        )
        if request is None:
            raise PresentationNotFound
        if payload.status is not None:
            if request.status != payload.expected_current_status:
                raise PresentationConflict
            if request.status != payload.status:
                session.add(
                    PresentationActivity(
                        request_id=request_id,
                        kind="status_changed",
                        previous_status=request.status,
                        new_status=payload.status,
                        actor_id=actor_id,
                    )
                )
                request.status = payload.status
                if recommend_email:
                    recommend_state(session, request)
        if payload.internal_notes is not None:
            request.internal_notes = payload.internal_notes
            session.add(
                PresentationActivity(
                    request_id=request_id,
                    kind="note_added",
                    note=payload.internal_notes,
                    actor_id=actor_id,
                )
            )
        session.commit()
        session.refresh(request)
        return request
    except Exception:
        session.rollback()
        raise


def list_activities(
    session: Session, request_id: UUID, *, limit: int, offset: int
) -> list[PresentationActivity]:
    get_presentation(session, request_id)
    return list(
        session.scalars(
            select(PresentationActivity)
            .where(PresentationActivity.request_id == request_id)
            .order_by(PresentationActivity.created_at.desc(), PresentationActivity.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )
