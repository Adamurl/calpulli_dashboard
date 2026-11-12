"""Service/API behavior tests; PostgreSQL migration tests remain separate."""

import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, event, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_session
from app.integrations.gmail import MockEmailProvider, ProviderError
from app.main import create_app
from app.modules.presentations import email_registry
from app.modules.presentations import email_service as workflow
from app.modules.presentations.email_models import EmailMessage, EmailStaffTask, EmailTemplate
from app.modules.presentations.email_registry import (
    STATE_EVENTS,
    WORKFLOWS,
    EmailEvent,
    SendingRule,
    render_template,
)
from app.modules.presentations.email_schemas import DraftEdit, EventInput, TemplateEdit
from app.modules.presentations.models import (
    PresentationActivity,
    PresentationImportBatch,
    PresentationRequest,
)
from app.modules.presentations.schemas import NewPresentation, PresentationPatch
from app.modules.presentations.services import create_presentation, update_presentation

TOKEN = "fictional-email-staff-access-token-32-characters"
RESEND_TOKEN = "fictional-email-resend-access-token-32-characters"
UNAVAILABLE_URL = "postgresql+psycopg://test@127.0.0.1:1/calpulli_test"


@compiles(JSONB, "sqlite")
def sqlite_jsonb(type_, compiler, **kwargs):
    return "JSON"


@pytest.fixture
def engine():
    db = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})

    @event.listens_for(db, "connect")
    def json_functions(connection, record):
        connection.create_function(
            "jsonb_typeof",
            1,
            lambda value: "array" if isinstance(json.loads(value), list) else "object",
        )
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(
        db,
        tables=[
            PresentationImportBatch.__table__,
            PresentationRequest.__table__,
            EmailTemplate.__table__,
            EmailMessage.__table__,
            EmailStaffTask.__table__,
            PresentationActivity.__table__,
        ],
    )
    seeds = json.loads(
        (
            Path(email_registry.__file__).parents[3] / "alembic/data/email_templates_v1.json"
        ).read_text()
    )
    with Session(db) as session:
        session.add_all(EmailTemplate(**{**item, "ready_for_use": True}) for item in seeds)
        session.commit()
    yield db
    db.dispose()


@pytest.fixture
def session(engine):
    with Session(engine, expire_on_commit=False) as value:
        yield value


@pytest.fixture
def inquiry(session):
    record = PresentationRequest(
        source="manual",
        form_version="presentation_v2",
        status="new",
        event_date=date(2027, 12, 20),
        contact_first_name="Test",
        contact_full_name="Test Contact",
        contact_email="client@example.org",
        venue_address="Fictional community center",
    )
    session.add(record)
    session.commit()
    return record


def prepare(session, inquiry, email_event=EmailEvent.INQUIRY_CREATED, **kwargs):
    workflow.lock_inquiry(session, inquiry.id)
    message = workflow.recommend(session, inquiry, EventInput(event=email_event, **kwargs))
    session.commit()
    return message


def kinds(session, message):
    return list(
        session.scalars(
            select(PresentationActivity.kind).where(
                PresentationActivity.email_message_id == message.id
            )
        )
    )


@pytest.mark.parametrize(
    "email_event,key,rule",
    [
        (EmailEvent.INQUIRY_CREATED, "inquiry_received", SendingRule.AUTOMATIC),
        (EmailEvent.MISSING_INFORMATION, "more_information_needed", SendingRule.APPROVAL),
        (EmailEvent.APPROVED_FOR_CALL, "schedule_call", SendingRule.APPROVAL),
        (EmailEvent.CALL_BOOKED, "meeting_confirmation", SendingRule.AUTOMATIC),
        (EmailEvent.CALL_REMINDER_DUE, "meeting_reminder", SendingRule.AUTOMATIC),
        (EmailEvent.CALL_COMPLETED, "conversation_follow_up", SendingRule.APPROVAL),
        (EmailEvent.CONTRACT_READY, "contract_and_payment", SendingRule.APPROVAL),
        (EmailEvent.SIGNED_AND_PAID, "booking_confirmed", SendingRule.AUTOMATIC),
        (EmailEvent.FINAL_LOGISTICS_NEEDED, "final_logistics_request", SendingRule.AUTOMATIC),
        (EmailEvent.EVENT_DETAILS_COMPLETE, "final_confirmation", SendingRule.APPROVAL),
        (EmailEvent.PRESENTATION_COMPLETED, "thank_you_feedback", SendingRule.AUTOMATIC),
        (EmailEvent.BALANCE_OVERDUE, "payment_reminder", SendingRule.APPROVAL),
        (EmailEvent.INQUIRY_DECLINED, "decline_or_referral", SendingRule.APPROVAL),
        (EmailEvent.SPECIAL_SITUATION, "custom_follow_up", SendingRule.MANUAL),
    ],
)
def test_event_policy(email_event, key, rule):
    selected = WORKFLOWS[email_event]
    assert (selected.template_key, selected.sending_rule) == (key, rule)


def test_new_inquiry_hook_creates_received_email(session):
    payload = NewPresentation(
        event_date="2027-03-20",
        start_time="14:00",
        end_time="15:00",
        event_types=["cultural_organization"],
        event_purpose="Cultural education",
        venue_address="Fictional community center",
        estimated_guests=50,
        audience_distance_12ft="yes",
        unavailable_logistics="None",
        contact_first_name="Test",
        contact_last_name="Contact",
        contact_email="client@example.org",
        contact_phone="5550100",
    )
    record, created = create_presentation(session, payload)
    assert created
    message = session.scalar(select(EmailMessage).where(EmailMessage.inquiry_id == record.id))
    assert message.template_key == "inquiry_received"
    assert message.status == "APPROVED"
    assert not message.requires_approval
    assert STATE_EVENTS["new"] == EmailEvent.INQUIRY_CREATED


def test_declined_state_creates_approval_draft(session, inquiry):
    update_presentation(
        session, inquiry.id, PresentationPatch(status="declined", expected_current_status="new")
    )
    message = session.scalar(select(EmailMessage).where(EmailMessage.inquiry_id == inquiry.id))
    assert message.template_key == "decline_or_referral"
    assert message.status == "PENDING_APPROVAL"
    assert message.requires_approval
    assert "email_recommended" in kinds(session, message)


def test_state_without_rule_creates_no_email(session, inquiry):
    update_presentation(
        session, inquiry.id, PresentationPatch(status="reviewing", expected_current_status="new")
    )
    assert session.scalar(select(EmailMessage.id)) is None


def test_missing_variables_block_send_and_create_task(session, inquiry):
    message = prepare(session, inquiry, EmailEvent.APPROVED_FOR_CALL)
    assert message.status == "DRAFT"
    assert message.missing_variables == ["Booking Link"]
    provider = MockEmailProvider()
    with pytest.raises(workflow.EmailConflict):
        workflow.send(session, inquiry.id, message.id, provider)
    assert not provider.messages
    assert "email_blocked" in kinds(session, message)
    task = session.scalar(
        select(EmailStaffTask).where(EmailStaffTask.email_message_id == message.id)
    )
    assert not task.resolved
    assert "Booking Link" in task.summary


def test_reference_template_needs_review_before_send(session, inquiry):
    template = session.get(EmailTemplate, "inquiry_received")
    template.ready_for_use = False
    session.commit()
    message = prepare(session, inquiry)
    assert "Template ready for use" in message.missing_variables
    assert message.status == "DRAFT"


def test_automatic_message_sends_once_and_event_replay_returns_original(session, inquiry):
    provider = MockEmailProvider()
    message = prepare(session, inquiry)
    workflow.dispatch_automatic(session, inquiry.id, provider)
    workflow.dispatch_automatic(session, inquiry.id, provider)
    assert workflow.send(session, inquiry.id, message.id, provider).status == "SENT"
    repeated = prepare(session, inquiry)
    assert repeated.id == message.id
    assert len(provider.messages) == 1
    assert message.provider_message_id.startswith("mock-")
    assert kinds(session, message).count("email_sent") == 1
    assert message.sent_at is not None


def test_staff_approval_is_required_and_allows_send(session, inquiry):
    provider = MockEmailProvider()
    message = prepare(session, inquiry, EmailEvent.INQUIRY_DECLINED)
    workflow.dispatch_automatic(session, inquiry.id, provider)
    with pytest.raises(workflow.EmailConflict):
        workflow.send(session, inquiry.id, message.id, provider)
    assert not provider.messages
    workflow.approve(session, message)
    session.commit()
    assert message.approved_by == workflow.ACTOR
    assert message.approved_at is not None
    assert workflow.send(session, inquiry.id, message.id, provider).status == "SENT"
    assert "email_approved" in kinds(session, message)


def test_edit_resets_approval_and_variable_edits_rerender_source(session, inquiry):
    message = prepare(session, inquiry, EmailEvent.INQUIRY_DECLINED)
    workflow.approve(session, message)
    session.commit()
    workflow.edit_draft(session, message, DraftEdit(variables={"Name": "Changed"}))
    session.commit()
    assert message.status == "PENDING_APPROVAL"
    assert message.approved_at is None
    assert message.approved_by is None
    assert "Hello Changed" in message.body_text
    workflow.edit_draft(session, message, DraftEdit(variables={"Name": "Second"}))
    assert "Hello Second" in message.body_text


def test_missing_data_task_resolves_after_edit(session, inquiry):
    message = prepare(session, inquiry, EmailEvent.APPROVED_FOR_CALL)
    workflow.edit_draft(
        session, message, DraftEdit(variables={"Booking Link": "https://example.org/book"})
    )
    session.commit()
    assert message.status == "PENDING_APPROVAL"
    assert message.missing_variables == []
    assert session.scalar(select(EmailStaffTask)).resolved


class FailingProvider:
    def __init__(self, *, retryable=True, unknown=False):
        self.retryable = retryable
        self.unknown = unknown
        self.calls = 0

    def send_email(self, message):
        self.calls += 1
        raise ProviderError(
            "fictional_failure", "Email service unavailable", self.retryable, self.unknown
        )

    def send_reply(self, message):
        return self.send_email(message)


def test_provider_failure_records_timeline_and_safe_retry(session, inquiry):
    message = prepare(session, inquiry)
    failing = FailingProvider()
    workflow.send(session, inquiry.id, message.id, failing)
    assert message.status == "FAILED"
    assert "email_send_failed" in kinds(session, message)
    assert session.scalar(select(EmailStaffTask)).code == "delivery_failure"
    good = MockEmailProvider()
    workflow.send(session, inquiry.id, message.id, good, retry=True)
    workflow.send(session, inquiry.id, message.id, good, retry=True)
    assert message.status == "SENT"
    assert message.attempts == 2
    assert len(good.messages) == 1
    assert "email_send_retried" in kinds(session, message)


@pytest.mark.parametrize("retryable,unknown", [(False, False), (True, True)])
def test_permanent_and_unknown_failures_cannot_retry(session, inquiry, retryable, unknown):
    message = prepare(session, inquiry)
    provider = FailingProvider(retryable=retryable, unknown=unknown)
    workflow.send(session, inquiry.id, message.id, provider)
    with pytest.raises(workflow.EmailConflict):
        workflow.send(session, inquiry.id, message.id, provider, retry=True)
    assert provider.calls == 1
    assert not message.retryable
    assert message.delivery_unknown == unknown


def test_retries_are_bounded(session, inquiry):
    message = prepare(session, inquiry)
    provider = FailingProvider()
    workflow.send(session, inquiry.id, message.id, provider)
    workflow.send(session, inquiry.id, message.id, provider, retry=True)
    workflow.send(session, inquiry.id, message.id, provider, retry=True)
    with pytest.raises(workflow.EmailConflict):
        workflow.send(session, inquiry.id, message.id, provider, retry=True)
    assert provider.calls == message.attempts == 3


def test_stale_session_cannot_send_an_already_sent_message(engine, session, inquiry):
    message = prepare(session, inquiry)
    provider = MockEmailProvider()
    with Session(engine, expire_on_commit=False) as other:
        stale = other.get(EmailMessage, message.id)
        other.commit()
        assert stale.status == "APPROVED"
        workflow.send(session, inquiry.id, message.id, provider)
        assert stale.status == "APPROVED"
        workflow.send(other, inquiry.id, message.id, provider)
        assert stale.status == "SENT"
        assert len(provider.messages) == 1


def test_cancel_and_explicit_send_again_require_new_approval(session, inquiry):
    original = prepare(session, inquiry)
    provider = MockEmailProvider()
    workflow.send(session, inquiry.id, original.id, provider)
    repeated = workflow.send_again(session, original)
    session.commit()
    assert repeated.id != original.id
    assert repeated.resend_of_id == original.id
    assert repeated.status == "PENDING_APPROVAL"
    with pytest.raises(workflow.EmailConflict):
        workflow.send(session, inquiry.id, repeated.id, provider)
    workflow.cancel(session, repeated)
    session.commit()
    assert repeated.status == "CANCELLED"
    assert "email_cancelled" in kinds(session, repeated)
    with pytest.raises(workflow.EmailConflict):
        workflow.send(session, inquiry.id, repeated.id, provider)
    assert len(provider.messages) == 1


def test_manual_only_never_dispatches_automatically_even_after_approval(session, inquiry):
    message = prepare(
        session,
        inquiry,
        EmailEvent.SPECIAL_SITUATION,
        variables={"Presentation Details": "Staff prepared follow-up"},
    )
    provider = MockEmailProvider()
    workflow.approve(session, message)
    session.commit()
    workflow.dispatch_automatic(session, inquiry.id, provider)
    assert not provider.messages
    with pytest.raises(workflow.EmailConflict):
        workflow.send(session, inquiry.id, message.id, provider, automatic=True)
    workflow.send(session, inquiry.id, message.id, provider)
    assert len(provider.messages) == 1


def test_reply_preserves_subject_and_thread(session, inquiry):
    provider = MockEmailProvider()
    original = prepare(session, inquiry)
    workflow.send(session, inquiry.id, original.id, provider)
    reply = prepare(session, inquiry, EmailEvent.INQUIRY_DECLINED)
    workflow.edit_draft(session, reply, DraftEdit(reply_to_id=original.id))
    workflow.approve(session, reply)
    session.commit()
    workflow.send(session, inquiry.id, reply.id, provider)
    assert provider.messages[-1].subject == original.subject
    assert provider.messages[-1].thread_id == original.provider_thread_id
    assert provider.messages[-1].in_reply_to == original.rfc_message_id
    assert reply.provider_thread_id == original.provider_thread_id


def test_call_email_uses_call_time_not_presentation_date(session, inquiry):
    call_at = datetime(2027, 3, 1, 10, 30, tzinfo=UTC)
    message = prepare(
        session,
        inquiry,
        EmailEvent.CALL_BOOKED,
        call_at=call_at,
        variables={
            "Google Meet Link": "https://meet.google.com/example",
            "Reschedule Link": "https://example.org/reschedule",
        },
    )
    assert message.variables["Requested Date"] == "2027-03-01"
    assert message.variables["Time"] == "10:30"
    assert message.variables["Time Zone"] == "UTC"
    assert "2027-12-20" not in message.body_text


def test_reminder_only_eligible_in_the_next_24_hours(session, inquiry):
    with pytest.raises(workflow.EmailConflict):
        prepare(
            session,
            inquiry,
            EmailEvent.CALL_REMINDER_DUE,
            call_at=datetime.now(UTC) + timedelta(hours=25),
        )
    assert session.scalar(select(EmailMessage)) is None


@pytest.mark.parametrize(
    "contract_signed,payment_received", [(False, False), (True, False), (False, True)]
)
def test_booking_confirmation_requires_signature_and_payment(contract_signed, payment_received):
    with pytest.raises(ValidationError):
        EventInput(
            event=EmailEvent.SIGNED_AND_PAID,
            contract_signed=contract_signed,
            payment_received=payment_received,
        )


def test_named_variables_render_and_escape_html():
    subject, text, html = render_template(
        "Hello [Name]",
        "[Organization] on [Requested Date]",
        {"Name": "Test", "Organization": "<Test & Co>", "Requested Date": "2027-03-20"},
    )
    assert subject == "Hello Test"
    assert text == "<Test & Co> on 2027-03-20"
    assert "&lt;Test &amp; Co&gt;" in html


@pytest.mark.parametrize(
    "subject,body,variables",
    [
        ("[Unknown]", "Hello", {}),
        ("Hello", "[Name]", {}),
        ("[Name]", "Hello", {"Name": "Header\r\nInjected: true"}),
    ],
)
def test_invalid_template_render_fails(subject, body, variables):
    with pytest.raises(ValueError):
        render_template(subject, body, variables)


def test_unknown_variable_rejected_on_template_and_event_inputs():
    with pytest.raises(ValidationError):
        TemplateEdit(subject="Hello", body_text="[Unknown]")
    with pytest.raises(ValidationError):
        EventInput(event=EmailEvent.INQUIRY_CREATED, variables={"Unknown": "value"})


@pytest.fixture
def api_client(session, staff_auth):
    app = create_app(
        Settings(
            _env_file=None,
            app_env="test",
            database_url=UNAVAILABLE_URL,
            **staff_auth(TOKEN),
            email_send_again_token=RESEND_TOKEN,
            email_test_recipient="reviewer@example.org",
        )
    )

    def override_session():
        yield session

    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as client:
        yield client, app


def test_email_api_requires_staff_and_extra_resend_authorization(api_client, inquiry):
    client, app = api_client
    path = f"/api/v1/presentations/{inquiry.id}"
    assert client.get(path + "/emails").status_code == 401
    headers = {"Authorization": f"Bearer {TOKEN}"}
    panel = client.get(path + "/emails", headers=headers)
    assert panel.status_code == 200
    event_result = client.post(
        path + "/email-events", headers=headers, json={"event": "inquiry_created"}
    )
    assert event_result.status_code == 200
    message = event_result.json()
    assert message["status"] == "SENT"
    assert app.state.email_provider.messages[0].recipient_email == "reviewer@example.org"
    assert app.state.email_provider.messages[0].original_recipient == "client@example.org"
    resend_path = path + "/emails/" + message["id"] + "/send-again"
    assert client.post(resend_path, headers=headers).status_code == 403
    allowed = client.post(resend_path, headers={**headers, "X-Email-Resend-Token": RESEND_TOKEN})
    assert allowed.status_code == 200
    assert allowed.json()["status"] == "PENDING_APPROVAL"
    other = client.post(
        f"/api/v1/presentations/{uuid4()}/emails/{message['id']}/approve", headers=headers
    )
    assert other.status_code == 404


def test_template_editor_rejects_unknown_variables_and_keeps_reference_disabled(api_client):
    client, _ = api_client
    headers = {"Authorization": f"Bearer {TOKEN}"}
    path = "/api/v1/presentations/email-templates/inquiry_received"
    assert (
        client.put(
            path, headers=headers, json={"subject": "Hello", "body_text": "[Unknown]"}
        ).status_code
        == 422
    )
    response = client.put(
        path, headers=headers, json={"subject": "Hello [Name]", "body_text": "Reference copy"}
    )
    assert response.status_code == 200
    assert response.json()["ready_for_use"] is False
    assert response.json()["updated_by"] == workflow.ACTOR


def test_uncertain_resend_blocks_further_send_again(session, inquiry):
    original = prepare(session, inquiry)
    workflow.send(session, inquiry.id, original.id, MockEmailProvider())
    repeated = workflow.send_again(session, original)
    workflow.approve(session, repeated)
    session.commit()
    workflow.send(session, inquiry.id, repeated.id, FailingProvider(unknown=True))
    assert repeated.delivery_unknown
    with pytest.raises(workflow.EmailConflict):
        workflow.send_again(session, original)


def test_email_activity_exposes_inquiry_and_message_identifiers(session, inquiry):
    from app.modules.presentations.schemas import ActivityRead

    message = prepare(session, inquiry)
    activity = session.scalar(
        select(PresentationActivity).where(PresentationActivity.email_message_id == message.id)
    )
    data = ActivityRead.model_validate(activity)
    assert data.inquiry_id == data.request_id == inquiry.id
    assert data.email_message_id == message.id
    assert data.actor_id
    assert data.summary


def test_sent_original_cannot_mask_another_resend_in_progress(session, inquiry):
    original = prepare(session, inquiry)
    provider = MockEmailProvider()
    workflow.send(session, inquiry.id, original.id, provider)
    first_resend = workflow.send_again(session, original)
    workflow.approve(session, first_resend)
    session.commit()
    workflow.send(session, inquiry.id, first_resend.id, FailingProvider())
    second_resend = workflow.send_again(session, original)
    workflow.approve(session, second_resend)
    second_resend.status = "SENDING"
    session.commit()
    with pytest.raises(workflow.EmailConflict):
        workflow.send(session, inquiry.id, first_resend.id, provider, retry=True)
    assert len(provider.messages) == 1
