"""Gmail delivery boundary. Application approval remains outside the provider."""

import base64
import json
import re
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from email import policy
from email.headerregistry import Address
from email.message import EmailMessage
from email.utils import format_datetime
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
MESSAGE_ID = re.compile(r"<[^<>\s@]+@[^<>\s@]+>")


@dataclass(frozen=True)
class OutgoingEmail:
    recipient_email: str
    recipient_name: str
    subject: str
    body_text: str
    body_html: str | None
    message_id: str
    thread_id: str | None = None
    in_reply_to: str | None = None
    references: str | None = None
    original_recipient: str | None = None


@dataclass(frozen=True)
class SendResult:
    message_id: str
    thread_id: str


class ProviderError(Exception):
    def __init__(
        self,
        code: str,
        safe_message: str,
        retryable: bool,
        delivery_unknown: bool = False,
    ) -> None:
        super().__init__(safe_message)
        self.code = code
        self.safe_message = safe_message
        self.retryable = retryable
        self.delivery_unknown = delivery_unknown


class EmailProvider(Protocol):
    def send_email(self, message: OutgoingEmail) -> SendResult: ...

    def send_reply(self, message: OutgoingEmail) -> SendResult: ...


class SecretValue(Protocol):
    def get_secret_value(self) -> str: ...


class GmailSettings(Protocol):
    @property
    def app_env(self) -> str: ...

    @property
    def email_provider(self) -> str: ...

    @property
    def email_test_mode(self) -> bool: ...

    @property
    def email_test_recipient(self) -> str | None: ...

    @property
    def google_client_id(self) -> str | None: ...

    @property
    def google_client_secret(self) -> SecretValue | None: ...

    @property
    def google_redirect_uri(self) -> str | None: ...

    @property
    def google_refresh_token(self) -> SecretValue | None: ...

    @property
    def gmail_sender_email(self) -> str | None: ...

    @property
    def gmail_sender_name(self) -> str: ...


@dataclass(frozen=True)
class HttpResult:
    status: int
    body: bytes


class Transport(Protocol):
    def post(self, url: str, *, headers: dict[str, str], data: bytes) -> HttpResult: ...


class UrllibTransport:
    def post(self, url: str, *, headers: dict[str, str], data: bytes) -> HttpResult:
        request = Request(url, data=data, headers=headers, method="POST")
        try:
            with urlopen(request, timeout=15) as response:
                return HttpResult(response.status, response.read(1_000_000))
        except HTTPError as error:
            return HttpResult(error.code, error.read(1_000_000))


def _configuration_error() -> ProviderError:
    return ProviderError("email_configuration", "Email delivery is not configured", False)


def _address(value: str, display_name: str = "") -> str:
    if not value or any(c in value + display_name for c in "\r\n\x00"):
        raise ProviderError("invalid_recipient", "A valid email address is required", False)
    try:
        parsed = Address(addr_spec=value)
        if not parsed.username or "." not in parsed.domain or parsed.addr_spec != value:
            raise ValueError
        return str(Address(display_name=display_name, addr_spec=value))
    except (ValueError, IndexError):
        raise ProviderError(
            "invalid_recipient", "A valid email address is required", False
        ) from None


def _prepare(message: OutgoingEmail, settings: GmailSettings) -> OutgoingEmail:
    _address(message.recipient_email, message.recipient_name)
    if not settings.email_test_mode:
        return message
    target = settings.email_test_recipient
    if not target:
        raise ProviderError("test_recipient_required", "Configure the email test recipient", False)
    _address(target)
    return replace(
        message,
        recipient_email=target,
        recipient_name="Email test recipient",
        original_recipient=message.recipient_email,
        # A test recipient must never be added to a real client's Gmail conversation.
        thread_id=None,
        in_reply_to=None,
        references=None,
    )


def build_mime(message: OutgoingEmail, sender_email: str, sender_name: str) -> bytes:
    headers = [message.subject, message.message_id]
    headers.extend(x for x in [message.in_reply_to, message.references] if x is not None)
    if any(any(c in value for c in "\r\n\x00") for value in headers):
        raise ProviderError("invalid_headers", "Email headers are invalid", False)
    if not MESSAGE_ID.fullmatch(message.message_id):
        raise ProviderError("invalid_headers", "Email message identity is invalid", False)
    if message.in_reply_to and not MESSAGE_ID.fullmatch(message.in_reply_to):
        raise ProviderError("invalid_headers", "Reply message identity is invalid", False)
    if message.references and not all(MESSAGE_ID.fullmatch(x) for x in message.references.split()):
        raise ProviderError("invalid_headers", "Reply references are invalid", False)
    mime = EmailMessage(policy=policy.SMTP)
    mime["To"] = _address(message.recipient_email, message.recipient_name)
    mime["From"] = _address(sender_email, sender_name)
    mime["Subject"] = message.subject
    mime["Message-ID"] = message.message_id
    mime["Date"] = format_datetime(datetime.now(UTC))
    if message.in_reply_to:
        mime["In-Reply-To"] = message.in_reply_to
        mime["References"] = message.references or message.in_reply_to
    if message.original_recipient:
        _address(message.original_recipient)
        mime["X-Calpulli-Original-Recipient"] = message.original_recipient
    mime.set_content(message.body_text)
    if message.body_html is not None:
        mime.add_alternative(message.body_html, subtype="html")
    return mime.as_bytes()


def _json(result: HttpResult, *, sending: bool) -> dict[str, object]:
    if not 200 <= result.status < 300:
        if result.status == 429:
            raise ProviderError("gmail_rate_limited", "Email service is rate limited", True)
        if result.status >= 500:
            raise ProviderError(
                "gmail_unavailable",
                "Email service is temporarily unavailable",
                True,
                delivery_unknown=sending,
            )
        code = "gmail_permission_denied" if result.status in {401, 403} else "gmail_rejected"
        raise ProviderError(
            code, "Email service rejected the request; staff review required", False
        )
    try:
        payload = json.loads(result.body)
        if not isinstance(payload, dict):
            raise ValueError
        return payload
    except (ValueError, UnicodeDecodeError):
        raise ProviderError(
            "gmail_invalid_response",
            "Email service returned an invalid response",
            False,
            delivery_unknown=sending,
        ) from None


class GmailProvider:
    def __init__(self, settings: GmailSettings, transport: Transport | None = None) -> None:
        self.settings = settings
        self.transport = transport or UrllibTransport()

    def send_email(self, message: OutgoingEmail) -> SendResult:
        if message.thread_id or message.in_reply_to or message.references:
            raise ProviderError("invalid_reply", "Use reply delivery for a conversation", False)
        return self._send(message)

    def send_reply(self, message: OutgoingEmail) -> SendResult:
        if not message.thread_id or not message.in_reply_to:
            raise ProviderError(
                "invalid_reply", "A reply requires a thread and message identity", False
            )
        return self._send(message)

    def _send(self, message: OutgoingEmail) -> SendResult:
        settings = self.settings
        if settings.app_env == "test":
            raise ProviderError(
                "real_email_disabled", "Real delivery is disabled during tests", False
            )
        prepared = _prepare(message, settings)
        client_id = settings.google_client_id
        client_secret = settings.google_client_secret
        refresh_token = settings.google_refresh_token
        sender = settings.gmail_sender_email
        if not client_id or client_secret is None or refresh_token is None or not sender:
            raise _configuration_error()
        raw = build_mime(prepared, sender, settings.gmail_sender_name)
        form = urlencode(
            {
                "client_id": client_id,
                "client_secret": client_secret.get_secret_value(),
                "refresh_token": refresh_token.get_secret_value(),
                "grant_type": "refresh_token",
                "scope": GMAIL_SEND_SCOPE,
            }
        ).encode("ascii")
        token = _json(
            self._post(
                TOKEN_URL,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data=form,
                sending=False,
            ),
            sending=False,
        )
        access_token = token.get("access_token")
        if (
            not isinstance(access_token, str)
            or not access_token
            or any(c in access_token for c in "\r\n\x00")
        ):
            raise _configuration_error()
        payload = {"raw": base64.urlsafe_b64encode(raw).decode("ascii")}
        if prepared.thread_id:
            payload["threadId"] = prepared.thread_id
        response = _json(
            self._post(
                SEND_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                data=json.dumps(payload).encode("utf-8"),
                sending=True,
            ),
            sending=True,
        )
        message_id, thread_id = response.get("id"), response.get("threadId")
        if (
            not isinstance(message_id, str)
            or not message_id
            or not isinstance(thread_id, str)
            or not thread_id
        ):
            raise ProviderError(
                "gmail_invalid_response",
                "Email service returned no message identity",
                False,
                delivery_unknown=True,
            )
        return SendResult(message_id, thread_id)

    def _post(self, url: str, *, headers: dict[str, str], data: bytes, sending: bool) -> HttpResult:
        try:
            return self.transport.post(url, headers=headers, data=data)
        except (TimeoutError, URLError, OSError):
            raise ProviderError(
                "gmail_transport_error",
                "Email service connection failed",
                not sending,
                delivery_unknown=sending,
            ) from None


class MockEmailProvider:
    def __init__(self, settings: GmailSettings | None = None) -> None:
        self.settings = settings
        self.messages: list[OutgoingEmail] = []

    def send_email(self, message: OutgoingEmail) -> SendResult:
        if message.thread_id or message.in_reply_to or message.references:
            raise ProviderError("invalid_reply", "Use reply delivery for a conversation", False)
        return self._send(message)

    def send_reply(self, message: OutgoingEmail) -> SendResult:
        if not message.thread_id or not message.in_reply_to:
            raise ProviderError(
                "invalid_reply", "A reply requires a thread and message identity", False
            )
        return self._send(message)

    def _send(self, message: OutgoingEmail) -> SendResult:
        prepared = _prepare(message, self.settings) if self.settings is not None else message
        build_mime(prepared, "mock@example.invalid", "Mock sender")
        self.messages.append(prepared)
        return SendResult(f"mock-{uuid4().hex}", prepared.thread_id or f"mock-thread-{uuid4().hex}")


def make_provider(settings: GmailSettings) -> EmailProvider:
    if settings.app_env == "test" or settings.email_provider == "mock":
        return MockEmailProvider(settings)
    if settings.email_provider != "gmail":
        raise _configuration_error()
    return GmailProvider(settings)
