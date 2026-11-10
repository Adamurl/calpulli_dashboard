"""Explicit Wix Automation Choose fields contract; verify a real preview before activation."""

import json
from secrets import compare_digest
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import Field, ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db.session import get_session
from app.modules.presentations.schemas import NewPresentation
from app.modules.presentations.services import PresentationConflict, create_presentation

router = APIRouter(prefix="/integrations/wix", tags=["wix"])
MAX_BODY_BYTES = 65536


class WixFields(NewPresentation):
    form_id: str = Field(min_length=1, max_length=200)
    submission_id: str = Field(min_length=1, max_length=200)


def persist_submission(session: Session, submission: WixFields) -> tuple[UUID, bool]:
    payload = NewPresentation.model_validate(
        submission.model_dump(exclude={"form_id", "submission_id"})
    )
    record, created = create_presentation(
        session,
        payload,
        source="wix",
        source_key=submission.form_id,
        external_id=submission.submission_id,
    )
    return record.id, created


@router.post("/presentations", status_code=201)
async def receive_presentation(
    request: Request, response: Response, session: Annotated[Session, Depends(get_session)]
) -> dict[str, UUID | Literal["created", "duplicate"]]:
    config = request.app.state.settings
    if config.wix_webhook_token is None or config.wix_form_id is None:
        raise HTTPException(503, "Webhook is not configured")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_BODY_BYTES:
            raise HTTPException(413, "Request body too large")
        body.extend(chunk)
    try:
        envelope = json.loads(body)
    except (ValueError, UnicodeError):
        raise HTTPException(400, "Invalid JSON") from None
    data = envelope.get("data") if isinstance(envelope, dict) else None
    if not isinstance(data, dict):
        raise HTTPException(422, "Expected data object")
    token = data.pop("webhook_token", None)
    if not isinstance(token, str) or not compare_digest(
        token.encode(), config.wix_webhook_token.get_secret_value().encode()
    ):
        raise HTTPException(401, "Webhook authentication required")
    try:
        submission = WixFields.model_validate(data)
    except ValidationError:
        raise HTTPException(422, "Invalid presentation submission") from None
    if submission.form_id != config.wix_form_id:
        raise HTTPException(403, "Unexpected form")
    try:
        request_id, created = await run_in_threadpool(persist_submission, session, submission)
    except PresentationConflict:
        raise HTTPException(409, "Submission ID already has different content") from None
    except SQLAlchemyError:
        raise HTTPException(503, "Database unavailable") from None
    response.status_code = 201 if created else 200
    return {"id": request_id, "status": "created" if created else "duplicate"}
