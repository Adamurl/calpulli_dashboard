"""Durable application drafts and explicit delivery; no queue or scheduler."""

import re
from datetime import UTC, datetime, timedelta
from email.headerregistry import Address
from typing import TypeGuard
from uuid import UUID, uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.integrations.gmail import EmailProvider, OutgoingEmail, ProviderError
from app.modules.presentations.email_models import EmailMessage, EmailStaffTask, EmailTemplate
from app.modules.presentations.email_registry import (
    STATE_EVENTS,
    WORKFLOWS,
    EmailEvent,
    SendingRule,
    render_template,
    template_variables,
)
from app.modules.presentations.email_schemas import DraftEdit, EventInput, TemplateEdit
from app.modules.presentations.models import PresentationActivity, PresentationRequest

ACTOR = "internal-staff"


class EmailConflict(Exception):
    pass


class EmailNotFound(Exception):
    pass


def lock_inquiry(session: Session, inquiry_id: UUID) -> PresentationRequest:
    inquiry = session.scalar(
        select(PresentationRequest).where(PresentationRequest.id == inquiry_id).with_for_update()
    )
    if inquiry is None:
        raise EmailNotFound
    return inquiry


def activity(
    session: Session, message: EmailMessage, kind: str, summary: str, actor: str = ACTOR
) -> None:
    session.add(
        PresentationActivity(
            request_id=message.inquiry_id,
            email_message_id=message.id,
            actor_id=actor,
            kind=kind,
            summary=summary,
        )
    )


def task(session: Session, message: EmailMessage, code: str, summary: str) -> None:
    existing = session.scalar(
        select(EmailStaffTask).where(
            EmailStaffTask.email_message_id == message.id, EmailStaffTask.code == code
        )
    )
    if existing:
        existing.resolved = False
        existing.summary = summary
    else:
        session.add(
            EmailStaffTask(
                inquiry_id=message.inquiry_id,
                email_message_id=message.id,
                code=code,
                summary=summary,
            )
        )


def valid_recipient(value: str | None) -> TypeGuard[str]:
    if not value or any(c in value for c in "\r\n\x00"):
        return False
    try:
        address = Address(addr_spec=value)
        return bool(address.username and "." in address.domain and address.addr_spec == value)
    except (ValueError, IndexError):
        return False


def inquiry_variables(inquiry: PresentationRequest) -> dict[str, str]:
    presentation_details = inquiry.event_purpose or ", ".join(inquiry.event_types)
    values = {
        "Name": inquiry.contact_first_name or inquiry.contact_full_name,
        "Organization": inquiry.organization_name,
        "Event Description": inquiry.event_purpose,
        "Presentation Details": presentation_details,
        "Requested Date": str(inquiry.event_date) if inquiry.event_date else None,
        "Time": str(inquiry.start_time) if inquiry.start_time else None,
        "Time Zone": inquiry.event_timezone,
        "Location": inquiry.venue_address,
    }
    return {k: v for k, v in values.items() if v}


def create_manual_draft(
    session: Session,
    inquiry_id: UUID,
    *,
    template_key: str,
    variables: dict[str, str],
    reply_to_id: UUID | None = None,
) -> EmailMessage:
    inquiry = lock_inquiry(session, inquiry_id)
    template = session.get(EmailTemplate, template_key)
    if template is None:
        raise EmailNotFound
    parent = get_message(session, inquiry_id, reply_to_id) if reply_to_id else None
    if parent and (
        parent.status != "SENT"
        or not parent.provider_thread_id
        or parent.recipient_email != inquiry.contact_email
    ):
        raise EmailConflict("A reply requires a sent message in the same customer thread")
    message_id = uuid4()
    message = EmailMessage(
        id=message_id,
        inquiry_id=inquiry.id,
        presentation_id=inquiry.id,
        template_key=template.key,
        state_trigger=EmailEvent.SPECIAL_SITUATION.value,
        triggering_event=f"manual:{message_id}",
        recipient_email=inquiry.contact_email,
        recipient_name=inquiry.contact_full_name,
        variables={**inquiry_variables(inquiry), **variables},
        requires_approval=True,
        rfc_message_id=f"<{message_id}@calpulli.invalid>",
        reply_to_id=parent.id if parent else None,
    )
    session.add(message)
    session.flush()
    if parent:
        message.source_subject = parent.subject
    refresh_preview(session, message)
    activity(session, message, "email_draft_created", "Staff created an email draft")
    return message


def refresh_preview(
    session: Session, message: EmailMessage, *, subject: str | None = None, body: str | None = None
) -> None:
    template = session.get(EmailTemplate, message.template_key)
    if template is None:
        raise EmailConflict("Template is unavailable")
    source_subject = subject if subject is not None else message.source_subject or template.subject
    source_body = body if body is not None else message.source_body or template.body_text
    message.source_subject = source_subject
    message.source_body = source_body
    rule = WORKFLOWS[EmailEvent(message.state_trigger)]
    required = template_variables(source_subject, source_body)
    if not message.triggering_event.startswith("manual:"):
        required |= set(rule.required_variables)
    missing = sorted(key for key in required if not message.variables.get(key, "").strip())
    if template is None or not template.ready_for_use:
        missing.append("Template ready for use")
    if not valid_recipient(message.recipient_email):
        missing.append("Recipient email")
    message.missing_variables = missing
    if missing:
        message.subject = source_subject
        message.body_text = source_body
        message.body_html = ""
        message.status = "DRAFT"
        task(
            session, message, "missing_data", "Complete required email data: " + ", ".join(missing)
        )
        activity(session, message, "email_blocked", "Email blocked because data is missing")
        return
    try:
        message.subject, message.body_text, message.body_html = render_template(
            source_subject, source_body, message.variables
        )
    except ValueError as exc:
        raise EmailConflict(str(exc)) from None
    message.status = "PENDING_APPROVAL" if message.requires_approval else "APPROVED"
    for item in session.scalars(
        select(EmailStaffTask).where(
            EmailStaffTask.email_message_id == message.id, EmailStaffTask.code == "missing_data"
        )
    ):
        item.resolved = True


def recommend(
    session: Session, inquiry: PresentationRequest, payload: EventInput, *, actor: str = ACTOR
) -> EmailMessage:
    """Caller owns the inquiry lock and transaction."""
    if payload.event == EmailEvent.CALL_REMINDER_DUE:
        now = datetime.now(UTC)
        assert payload.call_at is not None
        if not now < payload.call_at <= now + timedelta(hours=24):
            raise EmailConflict(
                "The call reminder is only eligible within 24 hours before the call"
            )
    rule = WORKFLOWS[payload.event]
    existing = session.scalar(
        select(EmailMessage).where(
            EmailMessage.inquiry_id == inquiry.id,
            EmailMessage.template_key == rule.template_key,
            EmailMessage.triggering_event == payload.event.value,
        )
    )
    if existing is not None:
        return existing
    variables = {**inquiry_variables(inquiry), **payload.variables}
    if payload.event in {EmailEvent.CALL_BOOKED, EmailEvent.CALL_REMINDER_DUE}:
        assert payload.call_at is not None
        variables.update(
            {
                "Requested Date": payload.call_at.date().isoformat(),
                "Time": payload.call_at.strftime("%H:%M"),
                "Time Zone": str(payload.call_at.tzinfo),
            }
        )
    message_id = uuid4()
    message = EmailMessage(
        id=message_id,
        inquiry_id=inquiry.id,
        presentation_id=inquiry.id,
        template_key=rule.template_key,
        state_trigger=payload.event.value,
        triggering_event=payload.event.value,
        recipient_email=inquiry.contact_email,
        recipient_name=inquiry.contact_full_name,
        variables=variables,
        requires_approval=rule.sending_rule != SendingRule.AUTOMATIC,
        rfc_message_id=f"<{message_id}@calpulli.invalid>",
    )
    session.add(message)
    session.flush()
    activity(
        session, message, "email_recommended", "Email recommended: " + rule.template_key, actor
    )
    refresh_preview(session, message)
    activity(session, message, "email_draft_created", "Email draft created", actor)
    return message


def recommend_state(session: Session, inquiry: PresentationRequest) -> None:
    event = STATE_EVENTS.get(inquiry.status)
    if event is not None:
        recommend(session, inquiry, EventInput(event=event), actor="system")


def get_message(session: Session, inquiry_id: UUID, message_id: UUID) -> EmailMessage:
    message = session.scalar(
        select(EmailMessage)
        .execution_options(populate_existing=True)
        .where(EmailMessage.id == message_id, EmailMessage.inquiry_id == inquiry_id)
    )
    if message is None:
        raise EmailNotFound
    return message


def edit_draft(session: Session, message: EmailMessage, edit: DraftEdit) -> None:
    if message.status not in {"DRAFT", "PENDING_APPROVAL", "APPROVED"} or message.attempts:
        raise EmailConflict("Only unsent drafts can be edited")
    message.variables = {**message.variables, **edit.variables}
    if edit.recipient_email is not None:
        if not valid_recipient(edit.recipient_email):
            raise EmailConflict("A valid recipient is required")
        message.recipient_email = edit.recipient_email
    if edit.reply_to_id is not None:
        parent = get_message(session, message.inquiry_id, edit.reply_to_id)
        if parent.status != "SENT" or not parent.provider_thread_id:
            raise EmailConflict("Reply target must be a sent message with a thread")
        if parent.recipient_email != message.recipient_email:
            raise EmailConflict("A reply must have the same recipient")
        message.reply_to_id = parent.id
        edit.subject = parent.subject
    elif message.reply_to_id:
        edit.subject = get_message(session, message.inquiry_id, message.reply_to_id).subject
    message.approved_at = None
    message.approved_by = None
    message.requires_approval = True
    refresh_preview(session, message, subject=edit.subject, body=edit.body_text)
    activity(session, message, "email_draft_updated", "Staff updated an email draft")


def approve(session: Session, message: EmailMessage) -> None:
    if message.status != "PENDING_APPROVAL" or message.missing_variables:
        raise EmailConflict("A complete draft awaiting approval is required")
    template = session.get(EmailTemplate, message.template_key)
    if template is None or not template.ready_for_use:
        raise EmailConflict("Template is not ready for use")
    message.status = "APPROVED"
    message.approved_by = ACTOR
    message.approved_at = datetime.now(UTC)
    activity(session, message, "email_approved", "Email approved")


def cancel(session: Session, message: EmailMessage) -> None:
    if message.status in {"SENT", "SENDING", "CANCELLED"} or message.delivery_unknown:
        raise EmailConflict("This email cannot be cancelled")
    message.status = "CANCELLED"
    for item in session.scalars(
        select(EmailStaffTask).where(EmailStaffTask.email_message_id == message.id)
    ):
        item.resolved = True
    activity(session, message, "email_cancelled", "Email cancelled")


def send(
    session: Session,
    inquiry_id: UUID,
    message_id: UUID,
    provider: EmailProvider,
    *,
    retry: bool = False,
    automatic: bool = False,
) -> EmailMessage:
    lock_inquiry(session, inquiry_id)
    message = get_message(session, inquiry_id, message_id)
    if message.status == "SENT":
        session.commit()
        return message
    if message.status == "SENDING" or message.delivery_unknown:
        raise EmailConflict("Delivery may already have occurred; staff reconciliation is required")
    if retry:
        if message.status != "FAILED" or not message.retryable or message.attempts >= 3:
            raise EmailConflict("This delivery cannot be retried")
    elif message.status != "APPROVED":
        raise EmailConflict("Approve a complete draft before sending")
    if message.requires_approval and not message.approved_at:
        raise EmailConflict("Staff approval is required")
    if automatic and (
        message.requires_approval
        or WORKFLOWS[EmailEvent(message.state_trigger)].sending_rule != SendingRule.AUTOMATIC
    ):
        raise EmailConflict("Automatic delivery is forbidden for this message")
    if message.missing_variables or not valid_recipient(message.recipient_email):
        raise EmailConflict("Required email data is missing")
    template = session.get(EmailTemplate, message.template_key)
    if template is None or not template.ready_for_use:
        raise EmailConflict("Template is not ready for use")
    # All senders serialize on the inquiry, including resends and retries.
    if not message.triggering_event.startswith("manual:"):
        processing = session.scalar(
            select(EmailMessage.id).where(
                EmailMessage.inquiry_id == inquiry_id,
                EmailMessage.template_key == message.template_key,
                EmailMessage.status == "SENDING",
                EmailMessage.id != message.id,
            )
        )
        if processing:
            raise EmailConflict("An equivalent workflow email is already sending")
        previous = session.scalar(
            select(EmailMessage.id).where(
                EmailMessage.inquiry_id == inquiry_id,
                EmailMessage.template_key == message.template_key,
                EmailMessage.status == "SENT",
                EmailMessage.id != message.id,
            )
        )
        if previous and not message.resend_of_id:
            raise EmailConflict("An equivalent workflow email has already been sent or is sending")
        uncertain = session.scalar(
            select(EmailMessage.id).where(
                EmailMessage.inquiry_id == inquiry_id,
                EmailMessage.template_key == message.template_key,
                EmailMessage.delivery_unknown.is_(True),
                EmailMessage.id != message.id,
            )
        )
        if uncertain:
            raise EmailConflict(
                "Reconcile uncertain delivery before sending another workflow email"
            )
    if re.search(r"\[[^\[\]]+\]", message.subject + message.body_text):
        raise EmailConflict("Unrendered template variables remain")
    parent = get_message(session, inquiry_id, message.reply_to_id) if message.reply_to_id else None
    if parent and (
        parent.subject != message.subject or parent.recipient_email != message.recipient_email
    ):
        raise EmailConflict("Reply subject and recipient must match the conversation")
    outgoing = OutgoingEmail(
        recipient_email=message.recipient_email,
        recipient_name=message.recipient_name or "",
        subject=message.subject,
        body_text=message.body_text,
        body_html=message.body_html,
        message_id=message.rfc_message_id,
        thread_id=parent.provider_thread_id if parent else None,
        in_reply_to=parent.rfc_message_id if parent else None,
        references=parent.rfc_message_id if parent else None,
    )
    if retry:
        activity(session, message, "email_send_retried", "Email send retried")
    message.status = "SENDING"
    message.attempts += 1
    message.sent_by = "system" if automatic else ACTOR
    message.error_code = None
    message.error_message = None
    activity(session, message, "email_send_started", "Email send started", message.sent_by)
    session.commit()
    # Persist the claim before network I/O. A crash leaves SENDING for manual reconciliation.
    try:
        result = provider.send_reply(outgoing) if parent else provider.send_email(outgoing)
    except ProviderError as error:
        lock_inquiry(session, inquiry_id)
        message.status = "FAILED"
        message.error_code = error.code
        message.error_message = error.safe_message
        message.retryable = error.retryable and not error.delivery_unknown
        message.delivery_unknown = error.delivery_unknown
        activity(session, message, "email_send_failed", "Email send failed")
        task(session, message, "delivery_failure", "Review email delivery before retrying")
    else:
        lock_inquiry(session, inquiry_id)
        message.status = "SENT"
        message.sent_at = datetime.now(UTC)
        message.provider_message_id = result.message_id
        message.provider_thread_id = result.thread_id
        message.retryable = False
        activity(session, message, "email_sent", "Email sent", message.sent_by)
        for item in session.scalars(
            select(EmailStaffTask).where(EmailStaffTask.email_message_id == message.id)
        ):
            item.resolved = True
    session.commit()
    return message


def dispatch_automatic(session: Session, inquiry_id: UUID, provider: EmailProvider) -> None:
    ids = list(
        session.scalars(
            select(EmailMessage.id).where(
                EmailMessage.inquiry_id == inquiry_id,
                EmailMessage.status == "APPROVED",
                EmailMessage.requires_approval.is_(False),
            )
        )
    )
    for message_id in ids:
        try:
            send(session, inquiry_id, message_id, provider, automatic=True)
        except EmailConflict:
            session.rollback()


def send_again(session: Session, original: EmailMessage) -> EmailMessage:
    if original.status != "SENT":
        raise EmailConflict("Only a successfully sent email may be sent again")
    active = session.scalar(
        select(EmailMessage).where(
            EmailMessage.inquiry_id == original.inquiry_id,
            EmailMessage.template_key == original.template_key,
            or_(
                EmailMessage.status.in_(["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENDING"]),
                EmailMessage.delivery_unknown.is_(True),
            ),
        )
    )
    if active:
        raise EmailConflict("Another draft or delivery for this workflow is already active")
    new_id = uuid4()
    message = EmailMessage(
        id=new_id,
        inquiry_id=original.inquiry_id,
        presentation_id=original.presentation_id,
        template_key=original.template_key,
        state_trigger=original.state_trigger,
        triggering_event=(
            f"manual:{new_id}"
            if original.triggering_event.startswith("manual:")
            else f"resend:{new_id}"
        ),
        recipient_email=original.recipient_email,
        recipient_name=original.recipient_name,
        variables=dict(original.variables),
        requires_approval=True,
        resend_of_id=original.id,
        rfc_message_id=f"<{new_id}@calpulli.invalid>",
    )
    session.add(message)
    session.flush()
    refresh_preview(session, message)
    activity(session, message, "email_draft_created", "Staff requested a send-again draft")
    return message


def edit_template(session: Session, key: str, payload: TemplateEdit) -> EmailTemplate:
    template = session.get(EmailTemplate, key)
    if template is None:
        raise EmailNotFound
    template.subject = payload.subject
    template.body_text = payload.body_text
    template.ready_for_use = payload.ready_for_use
    template.updated_by = ACTOR
    session.commit()
    session.refresh(template)
    return template
