"""Explicit Wix Automation Choose fields contract; verify a real preview before activation."""

import json
import logging
from secrets import compare_digest
from typing import Annotated, Any, Literal, get_args
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import Field, ValidationError, field_validator
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db.session import get_session
from app.modules.presentations.email_service import dispatch_automatic
from app.modules.presentations.schemas import EventType, NewPresentation, ReferralSource
from app.modules.presentations.services import PresentationConflict, create_presentation

router = APIRouter(prefix="/integrations/wix", tags=["wix"])
MAX_BODY_BYTES = 65536
MAX_LOGGED_ERRORS = 25
logger = logging.getLogger("calpulli.wix")
EVENT_TYPE_CHOICES = {
    **{value: value for value in get_args(EventType)},
    "k-12 school": "k12_school",
    "college / university": "college_university",
    "non-profit organization": "nonprofit",
    "city / government": "government",
    "corporate event": "corporate",
    "cultural organization": "cultural_organization",
    "grand opening": "grand_opening",
}
REFERRAL_CHOICES = {
    **{value: value for value in get_args(ReferralSource)},
    "tik-tok": "tiktok",
    "word of mouth": "word_of_mouth",
    "mexica new year": "mexica_new_year",
    "previous performance": "previous_performance",
}


def normalize_choice(value: Any, choices: dict[str, str]) -> Any:
    if isinstance(value, str):
        value = value.strip()
        return choices.get(value.casefold(), value)
    return value


class WixFields(NewPresentation):
    form_id: str = Field(min_length=1, max_length=200)
    submission_id: str = Field(min_length=1, max_length=200)

    @field_validator("event_access", "event_setting", "audience_distance_12ft", mode="before")
    @classmethod
    def normalize_single_choice(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip().casefold()
            return "unsure" if value == "not sure yet" else value
        return value

    @field_validator("event_types", mode="before")
    @classmethod
    def normalize_event_types(cls, value: Any) -> Any:
        if isinstance(value, list):
            normalized = [normalize_choice(item, EVENT_TYPE_CHOICES) for item in value]
            if all(isinstance(item, str) for item in normalized):
                return list(dict.fromkeys(normalized))
            return normalized
        return value

    @field_validator("referral_sources", mode="before")
    @classmethod
    def normalize_referrals(cls, value: Any) -> Any:
        if isinstance(value, list):
            return [normalize_choice(item, REFERRAL_CHOICES) for item in value]
        return value


def rejection(
    request: Request, status: int, reason: str, validation: ValidationError | None = None
) -> HTTPException:
    details: dict[str, object] = {
        "request_id": request.state.request_id,
        "status_code": status,
        "webhook_reason": reason,
    }
    if validation is not None:
        errors = validation.errors(include_input=False, include_context=False, include_url=False)
        safe_errors = []
        for error in errors[:MAX_LOGGED_ERRORS]:
            location = error["loc"]
            field = "<model>"
            if location:
                field = location[0] if location[0] in WixFields.model_fields else "<unknown>"
            safe_errors.append({"field": f"data.{field}", "code": error["type"]})
        details["validation_errors"] = safe_errors
        details["validation_error_count"] = len(errors)
    logger.warning("wix_webhook_rejected", extra=details)
    return HTTPException(
        status, "Database unavailable" if reason == "database_unavailable" else reason
    )


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
        raise rejection(request, 503, "webhook_not_configured")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_BODY_BYTES:
            raise rejection(request, 413, "body_too_large")
        body.extend(chunk)
    try:
        envelope = json.loads(body)
    except (ValueError, UnicodeError):
        raise rejection(request, 400, "invalid_json") from None
    data = envelope.get("data") if isinstance(envelope, dict) else None
    if not isinstance(data, dict):
        raise rejection(request, 422, "expected_data_object")
    token = data.pop("webhook_token", None)
    if not isinstance(token, str) or not compare_digest(
        token.encode(), config.wix_webhook_token.get_secret_value().encode()
    ):
        raise rejection(request, 401, "invalid_webhook_token")
    try:
        submission = WixFields.model_validate(data)
    except ValidationError as exc:
        raise rejection(request, 422, "invalid_submission", exc) from None
    if submission.form_id != config.wix_form_id:
        raise rejection(request, 403, "unexpected_form")
    try:
        request_id, created = await run_in_threadpool(persist_submission, session, submission)
    except PresentationConflict:
        raise rejection(request, 409, "submission_conflict") from None
    except SQLAlchemyError:
        raise rejection(request, 503, "database_unavailable") from None
    if created:
        await run_in_threadpool(
            dispatch_automatic, session, request_id, request.app.state.email_provider
        )
    response.status_code = 201 if created else 200
    return {"id": request_id, "status": "created" if created else "duplicate"}
