from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.security import require_staff_access
from app.db.session import get_session
from app.integrations.supabase_auth import AuthenticatedUser
from app.modules.presentations import index_service, operations_service, services
from app.modules.presentations.email_router import router as email_router
from app.modules.presentations.email_service import dispatch_automatic
from app.modules.presentations.index_schemas import (
    PresentationIndex,
    PresentationStatistics,
    ReceiptSort,
)
from app.modules.presentations.operations_schemas import OperationsRead
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
    prefix="/presentations", tags=["presentations"], dependencies=[Depends(require_staff_access)]
)
router.include_router(email_router)
DbSession = Annotated[Session, Depends(get_session)]
PageLimit = Annotated[int, Query(ge=1, le=100)]
PageOffset = Annotated[int, Query(ge=0)]
Staff = Annotated[AuthenticatedUser, Depends(require_staff_access)]


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


@router.get("/index", response_model=PresentationIndex)
def presentation_index(
    session: DbSession,
    limit: PageLimit = 10,
    offset: PageOffset = 0,
    q: Annotated[str, Query(max_length=200)] = "",
    status: PresentationStatus | None = None,
    sort: ReceiptSort = "received_desc",
) -> PresentationIndex:
    return index_service.read_index(
        session, limit=limit, offset=offset, q=q, status=status, sort=sort
    )


@router.get("/statistics", response_model=PresentationStatistics)
def presentation_statistics(
    session: DbSession, days: Annotated[int, Query(ge=1, le=30)] = 1
) -> PresentationStatistics:
    if days not in {1, 7, 30}:
        raise HTTPException(422, "Choose 1, 7, or 30 days")
    return index_service.read_statistics(session, days=days)


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


@router.patch("/{request_id}/workspace", response_model=PresentationRead)
def update_workspace_request(
    request_id: UUID, payload: PresentationPatch, session: DbSession, staff: Staff
) -> PresentationRead:
    try:
        record = services.update_presentation(
            session,
            request_id,
            payload,
            actor_id=str(staff.id),
            recommend_email=False,
        )
        return PresentationRead.model_validate(record)
    except services.PresentationNotFound:
        raise HTTPException(404, "Presentation not found") from None
    except services.PresentationConflict:
        raise HTTPException(409, "Presentation status changed; reload before updating") from None


@router.get("/{request_id}/operations", response_model=OperationsRead)
def get_operations(request_id: UUID, session: DbSession) -> OperationsRead:
    try:
        return operations_service.read_operations(session, request_id)
    except operations_service.ImportRecordNotFound:
        raise HTTPException(404, "Presentation operations not found") from None
