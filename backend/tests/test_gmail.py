import base64
import json
from dataclasses import replace
from email import policy
from email.parser import BytesParser
from types import SimpleNamespace
from urllib.parse import parse_qs

import pytest

from app.integrations.gmail import (
    GMAIL_SEND_SCOPE,
    SEND_URL,
    TOKEN_URL,
    GmailProvider,
    HttpResult,
    MockEmailProvider,
    OutgoingEmail,
    ProviderError,
    build_mime,
    make_provider,
)


class Secret:
    def __init__(self, value):
        self.value = value

    def get_secret_value(self):
        return self.value


@pytest.fixture
def settings():
    return SimpleNamespace(
        app_env="development",
        email_provider="gmail",
        email_test_mode=False,
        email_test_recipient=None,
        google_client_id="fictional-client",
        google_client_secret=Secret("fictional-secret"),
        google_redirect_uri="http://localhost/callback",
        google_refresh_token=Secret("fictional-refresh"),
        gmail_sender_email="sender@example.org",
        gmail_sender_name="Calpulli",
    )


@pytest.fixture
def message():
    return OutgoingEmail(
        recipient_email="client@example.org",
        recipient_name="Test Contact",
        subject="Your presentation",
        body_text="Hello, Test",
        body_html="<p>Hello, Test</p>",
        message_id="<fictional-1@example.org>",
    )


class RecordingTransport:
    def __init__(self, result=None):
        self.calls = []
        self.result = result or HttpResult(200, b'{"id":"gmail-1","threadId":"thread-1"}')

    def post(self, url, *, headers, data):
        self.calls.append((url, headers, data))
        if url == TOKEN_URL:
            return HttpResult(200, b'{"access_token":"fictional-access"}')
        if isinstance(self.result, Exception):
            raise self.result
        return self.result

    def payload(self):
        return json.loads(self.calls[-1][2])

    def mime(self):
        return BytesParser(policy=policy.default).parsebytes(
            base64.urlsafe_b64decode(self.payload()["raw"])
        )


def test_send_uses_mime_base64url_and_narrow_scope(settings, message):
    transport = RecordingTransport()
    result = GmailProvider(settings, transport).send_email(message)
    assert (result.message_id, result.thread_id) == ("gmail-1", "thread-1")
    token_url, _, form = transport.calls[0]
    assert token_url == TOKEN_URL
    assert parse_qs(form.decode())["scope"] == [GMAIL_SEND_SCOPE]
    assert transport.calls[1][0] == SEND_URL
    assert transport.calls[1][1]["Authorization"] == "Bearer fictional-access"
    mime = transport.mime()
    assert mime["To"].addresses[0].addr_spec == "client@example.org"
    assert mime["From"].addresses[0].addr_spec == "sender@example.org"
    assert mime["Subject"] == "Your presentation"
    assert mime["Message-ID"] == message.message_id
    assert mime.get_content_type() == "multipart/alternative"
    assert mime.get_body(preferencelist=("plain",)).get_content().strip() == "Hello, Test"
    assert mime.get_body(preferencelist=("html",)).get_content().strip() == "<p>Hello, Test</p>"


def test_reply_preserves_thread_subject_and_rfc_headers(settings, message):
    transport = RecordingTransport()
    reply = replace(
        message,
        thread_id="existing-thread",
        in_reply_to="<parent@example.org>",
        references="<root@example.org> <parent@example.org>",
    )
    GmailProvider(settings, transport).send_reply(reply)
    assert transport.payload()["threadId"] == "existing-thread"
    mime = transport.mime()
    assert mime["Subject"] == message.subject
    assert mime["In-Reply-To"] == "<parent@example.org>"
    assert mime["References"] == "<root@example.org> <parent@example.org>"


def test_test_mode_redirects_and_records_original_recipient_header(settings, message):
    settings.email_test_mode = True
    settings.email_test_recipient = "reviewer@example.org"
    transport = RecordingTransport()
    GmailProvider(settings, transport).send_email(message)
    mime = transport.mime()
    assert mime["To"].addresses[0].addr_spec == "reviewer@example.org"
    assert mime["X-Calpulli-Original-Recipient"] == "client@example.org"
    assert mime["Cc"] is None
    assert mime["Bcc"] is None


def test_test_reply_cannot_add_test_recipient_to_client_thread(settings, message):
    settings.email_test_mode = True
    settings.email_test_recipient = "reviewer@example.org"
    transport = RecordingTransport()
    GmailProvider(settings, transport).send_reply(
        replace(
            message,
            thread_id="client-thread",
            in_reply_to="<client-message@example.org>",
        )
    )
    assert "threadId" not in transport.payload()
    assert transport.mime()["In-Reply-To"] is None
    assert transport.mime()["References"] is None


def test_test_mode_without_recipient_blocks_before_network(settings, message):
    settings.email_test_mode = True
    transport = RecordingTransport()
    with pytest.raises(ProviderError) as captured:
        GmailProvider(settings, transport).send_email(message)
    assert captured.value.code == "test_recipient_required"
    assert not transport.calls


@pytest.mark.parametrize(
    "field,value",
    [
        ("recipient_email", "client@example.org\r\nBcc: attacker@example.org"),
        ("recipient_name", "Name\nBcc: attacker@example.org"),
        ("subject", "Subject\r\nBcc: attacker@example.org"),
        ("message_id", "gmail-api-id-instead-of-rfc-message-id"),
        ("recipient_email", "client@example.org,second@example.org"),
    ],
)
def test_header_injection_and_invalid_identity_are_rejected(settings, message, field, value):
    transport = RecordingTransport()
    with pytest.raises(ProviderError):
        GmailProvider(settings, transport).send_email(replace(message, **{field: value}))
    assert not transport.calls


@pytest.mark.parametrize(
    "status,code,retryable,unknown",
    [
        (400, "gmail_rejected", False, False),
        (401, "gmail_permission_denied", False, False),
        (403, "gmail_permission_denied", False, False),
        (429, "gmail_rate_limited", True, False),
        (500, "gmail_unavailable", True, True),
    ],
)
def test_http_failures_are_safe_and_classified(settings, message, status, code, retryable, unknown):
    transport = RecordingTransport(HttpResult(status, b'{"error":"private server text"}'))
    with pytest.raises(ProviderError) as captured:
        GmailProvider(settings, transport).send_email(message)
    error = captured.value
    assert error.code == code
    assert error.retryable is retryable
    assert error.delivery_unknown is unknown
    assert "private" not in str(error)
    assert "fictional-secret" not in str(error)


def test_timeout_after_send_must_not_be_blindly_retried(settings, message):
    transport = RecordingTransport(TimeoutError("private connection details"))
    with pytest.raises(ProviderError) as captured:
        GmailProvider(settings, transport).send_email(message)
    assert captured.value.delivery_unknown
    assert not captured.value.retryable
    assert "private" not in str(captured.value)


def test_invalid_success_response_requires_delivery_review(settings, message):
    transport = RecordingTransport(HttpResult(200, b'{"unexpected":"private"}'))
    with pytest.raises(ProviderError) as captured:
        GmailProvider(settings, transport).send_email(message)
    assert captured.value.delivery_unknown
    assert not captured.value.retryable


def test_app_test_environment_forces_mock(settings, message):
    settings.app_env = "test"
    provider = make_provider(settings)
    assert isinstance(provider, MockEmailProvider)
    assert provider.send_email(message).message_id.startswith("mock-")
    assert provider.messages == [message]
    with pytest.raises(ProviderError) as captured:
        GmailProvider(settings).send_email(message)
    assert captured.value.code == "real_email_disabled"


def test_mock_uses_same_recipient_safety_rules(settings, message):
    settings.email_provider = "mock"
    settings.email_test_mode = True
    settings.email_test_recipient = "reviewer@example.org"
    provider = make_provider(settings)
    provider.send_email(message)
    assert provider.messages[0].recipient_email == "reviewer@example.org"
    assert provider.messages[0].original_recipient == "client@example.org"


def test_reply_needs_thread_and_rfc_parent(settings, message):
    transport = RecordingTransport()
    with pytest.raises(ProviderError):
        GmailProvider(settings, transport).send_reply(message)
    assert not transport.calls


def test_plain_text_message_is_valid(message):
    mime = BytesParser(policy=policy.default).parsebytes(
        build_mime(
            replace(message, body_html=None),
            "sender@example.org",
            "Calpulli",
        )
    )
    assert mime.get_content_type() == "text/plain"
