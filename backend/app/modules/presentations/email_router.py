from contextlib import contextmanager
from secrets import compare_digest
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.modules.presentations import email_service as service
from app.modules.presentations.email_models import EmailMessage, EmailStaffTask, EmailTemplate
from app.modules.presentations.email_registry import (
    AUTO_POPULATED_VARIABLES,
    STATE_EVENTS,
    VARIABLES,
    WORKFLOWS,
)
from app.modules.presentations.email_schemas import (
    DraftEdit,
    EmailRead,
    EventInput,
    ManualDraftCreate,
    TaskRead,
    TemplateEdit,
    TemplateRead,
)

router = APIRouter()
Db = Annotated[Session, Depends(get_session)]


@contextmanager
def email_errors(session: Session):
    try:
        yield
    except service.EmailNotFound:
        session.rollback()
        raise HTTPException(404, "Email or inquiry not found") from None
    except (service.EmailConflict, ValueError):
        session.rollback()
        raise HTTPException(409, "Email action is not eligible; refresh the panel") from None


@router.get("/email-capabilities")
def capabilities(
    request: Request,
    authorization: Annotated[str | None, Header(alias="X-Email-Resend-Token")] = None,
):
    config = request.app.state.settings
    configured = config.email_send_again_token
    allowed = bool(
        configured
        and authorization
        and compare_digest(configured.get_secret_value().encode(), authorization.encode())
    )
    mode = (
        "Mock delivery: no real email is sent"
        if config.app_env == "test" or config.email_provider == "mock"
        else (
            "Test delivery: mail is redirected to the test recipient"
            if config.email_test_mode
            else "Live Gmail delivery"
        )
    )
    return {"can_send_again": allowed, "delivery_mode": mode}


@router.get("/email-templates", response_model=list[TemplateRead])
def templates(session: Db):
    return list(session.scalars(select(EmailTemplate).order_by(EmailTemplate.key)))


@router.get("/email-template-variables")
def template_variables():
    return {
        "available": sorted(VARIABLES),
        "auto_populated": sorted(AUTO_POPULATED_VARIABLES),
        "staff_provided": sorted(VARIABLES - AUTO_POPULATED_VARIABLES),
        "workflows": [
            {
                "event": event.value,
                "template_key": rule.template_key,
                "sending_rule": rule.sending_rule.value,
                "reason": rule.reason,
                "required_variables": list(rule.required_variables),
            }
            for event, rule in WORKFLOWS.items()
        ],
    }


@router.put("/email-templates/{key}", response_model=TemplateRead)
def update_template(key: str, payload: TemplateEdit, session: Db):
    with email_errors(session):
        return service.edit_template(session, key, payload)


@router.get("/{inquiry_id}/emails")
def panel(inquiry_id: UUID, session: Db):
    with email_errors(session):
        inquiry = session.get(service.PresentationRequest, inquiry_id)
        if inquiry is None:
            raise service.EmailNotFound
        event = STATE_EVENTS.get(inquiry.status)
        rule = WORKFLOWS.get(event) if event is not None else None
        messages = session.scalars(
            select(EmailMessage)
            .where(EmailMessage.inquiry_id == inquiry_id)
            .order_by(EmailMessage.created_at.desc())
        )
        tasks = session.scalars(
            select(EmailStaffTask).where(
                EmailStaffTask.inquiry_id == inquiry_id, EmailStaffTask.resolved.is_(False)
            )
        )
        return {
            "state": inquiry.status,
            "recommended_email": rule.template_key if rule else None,
            "reason": rule.reason if rule else "This state has no automatic recommendation.",
            "events": [
                {
                    "event": event.value,
                    "template_key": rule.template_key,
                    "sending_rule": rule.sending_rule.value,
                    "reason": rule.reason,
                }
                for event, rule in WORKFLOWS.items()
            ],
            "messages": [
                {
                    **EmailRead.model_validate(m).model_dump(),
                    "source_subject": m.source_subject,
                    "source_body": m.source_body,
                    "reply_to_id": m.reply_to_id,
                    "reason": WORKFLOWS[service.EmailEvent(m.state_trigger)].reason,
                }
                for m in messages
            ],
            "tasks": [TaskRead.model_validate(t) for t in tasks],
        }


@router.post("/{inquiry_id}/emails", response_model=EmailRead)
def create_manual_email(inquiry_id: UUID, payload: ManualDraftCreate, session: Db):
    with email_errors(session):
        message = service.create_manual_draft(
            session,
            inquiry_id,
            template_key=payload.template_key,
            variables=payload.variables,
            reply_to_id=payload.reply_to_id,
        )
        session.commit()
        return EmailRead.model_validate(message)


@router.post("/{inquiry_id}/email-events", response_model=EmailRead)
def record_event(inquiry_id: UUID, payload: EventInput, session: Db, request: Request):
    with email_errors(session):
        inquiry = service.lock_inquiry(session, inquiry_id)
        message = service.recommend(session, inquiry, payload)
        session.commit()
        service.dispatch_automatic(session, inquiry_id, request.app.state.email_provider)
        return EmailRead.model_validate(message)


@router.patch("/{inquiry_id}/emails/{message_id}", response_model=EmailRead)
def edit(inquiry_id: UUID, message_id: UUID, payload: DraftEdit, session: Db):
    with email_errors(session):
        service.lock_inquiry(session, inquiry_id)
        message = service.get_message(session, inquiry_id, message_id)
        service.edit_draft(session, message, payload)
        session.commit()
        return EmailRead.model_validate(message)


@router.post("/{inquiry_id}/emails/{message_id}/refresh", response_model=EmailRead)
def refresh(inquiry_id: UUID, message_id: UUID, session: Db):
    with email_errors(session):
        service.lock_inquiry(session, inquiry_id)
        message = service.get_message(session, inquiry_id, message_id)
        if message.attempts or message.status not in {"DRAFT", "PENDING_APPROVAL", "APPROVED"}:
            raise service.EmailConflict
        message.source_subject = None
        message.source_body = None
        message.approved_by = None
        message.approved_at = None
        service.refresh_preview(session, message)
        session.commit()
        return EmailRead.model_validate(message)


@router.post("/{inquiry_id}/emails/{message_id}/approve", response_model=EmailRead)
def approve(inquiry_id: UUID, message_id: UUID, session: Db):
    with email_errors(session):
        service.lock_inquiry(session, inquiry_id)
        message = service.get_message(session, inquiry_id, message_id)
        service.approve(session, message)
        session.commit()
        return EmailRead.model_validate(message)


@router.post("/{inquiry_id}/emails/{message_id}/cancel", response_model=EmailRead)
def cancel(inquiry_id: UUID, message_id: UUID, session: Db):
    with email_errors(session):
        service.lock_inquiry(session, inquiry_id)
        message = service.get_message(session, inquiry_id, message_id)
        service.cancel(session, message)
        session.commit()
        return EmailRead.model_validate(message)


@router.post("/{inquiry_id}/emails/{message_id}/send", response_model=EmailRead)
def send(inquiry_id: UUID, message_id: UUID, session: Db, request: Request):
    with email_errors(session):
        return EmailRead.model_validate(
            service.send(session, inquiry_id, message_id, request.app.state.email_provider)
        )


@router.post("/{inquiry_id}/emails/{message_id}/retry", response_model=EmailRead)
def retry(inquiry_id: UUID, message_id: UUID, session: Db, request: Request):
    with email_errors(session):
        return EmailRead.model_validate(
            service.send(
                session, inquiry_id, message_id, request.app.state.email_provider, retry=True
            )
        )


@router.post("/{inquiry_id}/emails/{message_id}/send-again", response_model=EmailRead)
def send_again(
    inquiry_id: UUID,
    message_id: UUID,
    session: Db,
    request: Request,
    authorization: Annotated[str | None, Header(alias="X-Email-Resend-Token")] = None,
):
    configured = request.app.state.settings.email_send_again_token
    if (
        configured is None
        or authorization is None
        or not compare_digest(configured.get_secret_value().encode(), authorization.encode())
    ):
        raise HTTPException(403, "Send-again authorization required")
    with email_errors(session):
        service.lock_inquiry(session, inquiry_id)
        message = service.send_again(session, service.get_message(session, inquiry_id, message_id))
        session.commit()
        return EmailRead.model_validate(message)
