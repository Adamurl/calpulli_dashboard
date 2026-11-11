from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.security import require_internal_access
from app.db.session import get_session
from app.modules.presentations import services
from app.modules.presentations.email_router import router as email_router
from app.modules.presentations.email_service import dispatch_automatic
from app.modules.presentations.schemas import (
    ActivityList,
    ActivityRead,
    NewPresentation,
    PresentationList,
    PresentationPatch,
    PresentationRead,
    PresentationSource,
    PresentationStatus,
    PresentationSummary,
)

router = APIRouter(
    prefix="/presentations", tags=["presentations"], dependencies=[Depends(require_internal_access)]
)
router.include_router(email_router)
DbSession = Annotated[Session, Depends(get_session)]
PageLimit = Annotated[int, Query(ge=1, le=100)]
PageOffset = Annotated[int, Query(ge=0)]


@router.get("", response_model=PresentationList)
def list_requests(
    session: DbSession,
    limit: PageLimit = 25,
    offset: PageOffset = 0,
    source: PresentationSource | None = None,
    status: PresentationStatus | None = None,
) -> PresentationList:
    records = services.list_presentations(
        session, limit=limit, offset=offset, source=source, status=status
    )
    return PresentationList(
        items=[PresentationSummary.model_validate(record) for record in records],
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=PresentationRead, status_code=201)
def create_request(
    payload: NewPresentation, session: DbSession, http_request: Request
) -> PresentationRead:
    request, _ = services.create_presentation(session, payload)
    dispatch_automatic(session, request.id, http_request.app.state.email_provider)
    return PresentationRead.model_validate(request)


@router.get("/{request_id}", response_model=PresentationRead)
def get_request(request_id: UUID, session: DbSession) -> PresentationRead:
    try:
        return PresentationRead.model_validate(services.get_presentation(session, request_id))
    except services.PresentationNotFound:
        raise HTTPException(404, "Presentation not found") from None


@router.patch("/{request_id}", response_model=PresentationRead)
def update_request(
    request_id: UUID, payload: PresentationPatch, session: DbSession, http_request: Request
) -> PresentationRead:
    try:
        record = services.update_presentation(session, request_id, payload)
        dispatch_automatic(session, request_id, http_request.app.state.email_provider)
        return PresentationRead.model_validate(record)
    except services.PresentationNotFound:
        raise HTTPException(404, "Presentation not found") from None
    except services.PresentationConflict:
        raise HTTPException(409, "Presentation status changed; reload before updating") from None


@router.get("/{request_id}/activities", response_model=ActivityList)
def get_activities(
    request_id: UUID, session: DbSession, limit: PageLimit = 25, offset: PageOffset = 0
) -> ActivityList:
    try:
        records = services.list_activities(session, request_id, limit=limit, offset=offset)
    except services.PresentationNotFound:
        raise HTTPException(404, "Presentation not found") from None
    return ActivityList(
        items=[ActivityRead.model_validate(record) for record in records],
        limit=limit,
        offset=offset,
    )
