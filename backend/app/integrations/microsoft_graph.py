"""Microsoft Graph transport for a single Exchange Online mailbox."""

from html.parser import HTMLParser
from threading import Lock
from time import monotonic
from typing import Literal, TypedDict
from urllib.parse import quote

import httpx
from pydantic import BaseModel, Field, ValidationError

from app.integrations.gmail import ProviderError, SendResult

GRAPH_ORIGIN = "https://graph.microsoft.com"
PAGE_SIZE = 30
MAX_PAGES = 20
MAX_DOWNLOAD_BYTES = 4_000_000
SUMMARY_FIELDS = (
    "id,conversationId,subject,from,sender,toRecipients,ccRecipients,replyTo,"
    "receivedDateTime,sentDateTime,bodyPreview,hasAttachments,isDraft"
)
MESSAGE_FIELDS = f"{SUMMARY_FIELDS},body,uniqueBody"
ATTACHMENT_FIELDS = "id,name,size,contentType"
FILE_ATTACHMENT = "#microsoft.graph.fileAttachment"


class MailboxMessage(TypedDict):
    id: str
    conversation_id: str
    subject: str
    sender: str
    recipients: list[str]
    reply_to: list[str]
    at: str
    body_text: str
    has_attachments: bool
    is_draft: bool


class MailboxPage(TypedDict):
    messages: list[MailboxMessage]
    next_skip: int | None


class MailboxAttachment(TypedDict):
    id: str
    name: str
    size: int
    content_type: str


class _Token(BaseModel):
    access_token: str = Field(min_length=1)
    expires_in: int = Field(default=300, ge=1)


class _EmailAddress(BaseModel):
    address: str | None = None


class _Recipient(BaseModel):
    emailAddress: _EmailAddress | None = None

    @property
    def address(self) -> str:
        return self.emailAddress.address or "" if self.emailAddress else ""


class _Body(BaseModel):
    contentType: Literal["text", "html", "Text", "HTML"] = "text"
    content: str = ""

    def as_text(self) -> str:
        if self.contentType.lower() == "text":
            return self.content
        parser = _VisibleText()
        parser.feed(self.content)
        parser.close()
        return "".join(parser.parts).strip("\n")


class _MessageIdentity(BaseModel):
    id: str = Field(min_length=1)
    conversationId: str = Field(min_length=1)


class _Message(_MessageIdentity):
    subject: str | None = None
    author: _Recipient | None = Field(default=None, alias="from")
    sender: _Recipient | None = None
    toRecipients: list[_Recipient] = Field(default_factory=list)
    ccRecipients: list[_Recipient] = Field(default_factory=list)
    replyTo: list[_Recipient] = Field(default_factory=list)
    sentDateTime: str | None = None
    receivedDateTime: str | None = None
    bodyPreview: str | None = None
    uniqueBody: _Body | None = None
    body: _Body | None = None
    hasAttachments: bool = False
    isDraft: bool = False

    def as_message(self) -> MailboxMessage:
        author = (self.author or self.sender or _Recipient()).address
        body = self.uniqueBody or self.body
        return {
            "id": self.id,
            "conversation_id": self.conversationId,
            "subject": self.subject or "",
            "sender": author,
            "recipients": [
                r.address for r in (*self.toRecipients, *self.ccRecipients) if r.address
            ],
            "reply_to": [r.address for r in self.replyTo if r.address],
            "at": self.sentDateTime or self.receivedDateTime or "",
            "body_text": body.as_text() if body else self.bodyPreview or "",
            "has_attachments": self.hasAttachments,
            "is_draft": self.isDraft,
        }


class _Attachment(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    size: int = Field(ge=0)
    contentType: str | None = None
    kind: str | None = Field(default=None, alias="@odata.type")

    def as_attachment(self) -> MailboxAttachment:
        return {
            "id": self.id,
            "name": self.name,
            "size": self.size,
            "content_type": self.contentType or "application/octet-stream",
        }


class _Collection[T: BaseModel](BaseModel):
    value: list[T]
    next_link: str | None = Field(default=None, alias="@odata.nextLink")


class _VisibleText(HTMLParser):
    # The list endpoint can return HTML despite the requested text preference.
    hidden = {"head", "script", "style"}
    blocks = {"br", "div", "p", "li", "blockquote", "tr", "h1", "h2", "h3", "h4", "h5", "h6"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.hidden_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.hidden:
            self.hidden_depth += 1
        elif self.hidden_depth == 0 and tag in self.blocks:
            self._line_break()

    def handle_endtag(self, tag: str) -> None:
        if tag in self.hidden and self.hidden_depth:
            self.hidden_depth -= 1
        elif self.hidden_depth == 0 and tag in self.blocks:
            self._line_break()

    def handle_data(self, data: str) -> None:
        if self.hidden_depth == 0:
            self.parts.append(data)

    def _line_break(self) -> None:
        if self.parts and not self.parts[-1].endswith("\n"):
            self.parts.append("\n")


def _parse[T: BaseModel](response: httpx.Response, model: type[T]) -> T:
    try:
        return model.model_validate_json(response.content)
    except ValidationError:
        raise _invalid_response() from None


def _invalid_response() -> ProviderError:
    return ProviderError(
        "graph_invalid_response", "Microsoft returned an invalid email service response", False
    )


def _check_status(response: httpx.Response, expected: int, *, submitting: bool = False) -> None:
    code = response.status_code
    if code == expected:
        return
    if code == 429:
        raise ProviderError("graph_rate_limited", "Microsoft email service is rate limited", True)
    if code in {401, 403}:
        raise ProviderError("graph_permission_denied", "Microsoft denied mailbox access", False)
    if code == 404:
        raise ProviderError("graph_not_found", "The Outlook email item was not found", False)
    if code >= 500 or code == 408 or 200 <= code < 300:
        raise ProviderError(
            "graph_unavailable",
            "Microsoft email service did not confirm the request",
            not submitting,
            delivery_unknown=submitting,
        )
    raise ProviderError("graph_rejected", "Microsoft rejected the email service request", False)


def _segment(value: str) -> str:
    if not value or not value.isprintable() or {".", ".."}.intersection(value.split("/")):
        raise ProviderError("graph_invalid_id", "An Outlook identifier is invalid", False)
    return quote(value, safe="")


def _recipient(address: str) -> dict[str, dict[str, str]]:
    return {"emailAddress": {"address": address}}


class MicrosoftGraph:
    def __init__(
        self,
        client: httpx.Client,
        *,
        tenant_id: str,
        client_id: str,
        client_secret: str | None,
        mailbox: str,
    ) -> None:
        self.client = client
        self.client_id = client_id
        self.client_secret = client_secret
        self.token_url = (
            f"https://login.microsoftonline.com/{_segment(tenant_id)}/oauth2/v2.0/token"
        )
        self.mailbox_url = f"{GRAPH_ORIGIN}/v1.0/users/{_segment(mailbox)}"
        self._token: str | None = None
        self._refresh_at = 0.0
        self._token_lock = Lock()

    def _access_token(self) -> str:
        with self._token_lock:
            now = monotonic()
            if self._token and self._refresh_at > now:
                return self._token
            if not self.client_id or not self.client_secret:
                raise ProviderError(
                    "graph_configuration", "Microsoft email credentials are not configured", False
                )
            try:
                response = self.client.post(
                    self.token_url,
                    data={
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "grant_type": "client_credentials",
                        "scope": "https://graph.microsoft.com/.default",
                    },
                    follow_redirects=False,
                )
            except httpx.RequestError:
                raise ProviderError(
                    "graph_transport_error", "Microsoft sign-in failed", True
                ) from None
            _check_status(response, 200)
            token = _parse(response, _Token)
            if not token.access_token.isascii() or not token.access_token.isprintable():
                raise _invalid_response()
            self._token = token.access_token
            self._refresh_at = now + max(token.expires_in - 60, 0)
            return self._token

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token()}",
            "Prefer": 'IdType="ImmutableId", outlook.body-content-type="text"',
        }

    def _request(
        self,
        method: str,
        url: str,
        expected: int,
        *,
        params: dict[str, str | int] | None = None,
        payload: dict | None = None,
        submitting: bool = False,
    ) -> httpx.Response:
        headers = self._headers()
        try:
            response = self.client.request(
                method, url, headers=headers, params=params, json=payload, follow_redirects=False
            )
        except httpx.RequestError:
            raise ProviderError(
                "graph_transport_error",
                "Microsoft email service connection failed",
                not submitting,
                delivery_unknown=submitting,
            ) from None
        _check_status(response, expected, submitting=submitting)
        return response

    def _message_url(self, message_id: str) -> str:
        return f"{self.mailbox_url}/messages/{_segment(message_id)}"

    def message(self, message_id: str) -> MailboxMessage:
        response = self._request(
            "GET", self._message_url(message_id), 200, params={"$select": MESSAGE_FIELDS}
        )
        return _parse(response, _Message).as_message()

    def send(
        self,
        *,
        recipient: str,
        subject: str,
        html: str,
        attachments: list[dict[str, str]],
        reply_to: str | None = None,
    ) -> SendResult:
        body = {"contentType": "HTML", "content": html}
        recipient_fields = {"toRecipients": [_recipient(recipient)]}
        if reply_to is None:
            response = self._request(
                "POST",
                f"{self.mailbox_url}/messages",
                201,
                payload={"subject": subject, "body": body, **recipient_fields},
            )
            draft = _parse(response, _MessageIdentity)
        else:
            original = self.message(reply_to)
            contacts = [original["sender"], *original["recipients"], *original["reply_to"]]
            if original["is_draft"] or recipient.casefold() not in {x.casefold() for x in contacts}:
                raise ProviderError(
                    "graph_reply_recipient",
                    "The recipient does not belong to this Outlook thread",
                    False,
                )
            response = self._request("POST", f"{self._message_url(reply_to)}/createReply", 201)
            draft = _parse(response, _MessageIdentity)
            if draft.conversationId != original["conversation_id"]:
                raise _invalid_response()
            self._request(
                "PATCH",
                self._message_url(draft.id),
                200,
                payload={
                    "body": body,
                    **recipient_fields,
                    "ccRecipients": [],
                    "bccRecipients": [],
                },
            )
        draft_url = self._message_url(draft.id)
        for attachment in attachments:
            self._request(
                "POST",
                f"{draft_url}/attachments",
                201,
                payload={
                    "@odata.type": FILE_ATTACHMENT,
                    "name": attachment["name"],
                    "contentType": attachment["content_type"],
                    "contentBytes": attachment["content_base64"],
                },
            )
        self._request("POST", f"{draft_url}/send", 202, submitting=True)
        return SendResult(draft.id, draft.conversationId)

    @staticmethod
    def _next_page(link: str, endpoint: str) -> httpx.URL:
        try:
            url = httpx.URL(link)
        except httpx.InvalidURL:
            raise _invalid_response() from None
        if (
            url.scheme != "https"
            or url.host != "graph.microsoft.com"
            or url.port is not None
            or url.userinfo
            or url.fragment
            or url.path != httpx.URL(endpoint).path
            or not url.query
        ):
            raise _invalid_response()
        return url

    def messages(self, folder: Literal["inbox", "sentitems"], *, skip: int = 0) -> MailboxPage:
        if folder not in {"inbox", "sentitems"}:
            raise ProviderError("graph_invalid_folder", "Outlook folder is invalid", False)
        endpoint = f"{self.mailbox_url}/mailFolders/{folder}/messages"
        date_field = "receivedDateTime" if folder == "inbox" else "sentDateTime"
        response = self._request(
            "GET",
            endpoint,
            200,
            params={
                "$select": SUMMARY_FIELDS,
                "$orderby": f"{date_field} desc",
                "$top": PAGE_SIZE,
                "$skip": skip,
            },
        )
        page = _parse(response, _Collection[_Message])
        next_skip = None
        if page.next_link:
            query = self._next_page(page.next_link, endpoint).params
            try:
                next_skip = int(query["$skip"])
                if next_skip <= skip:
                    raise ValueError
            except (KeyError, ValueError):
                raise _invalid_response() from None
        return {
            "messages": [message.as_message() for message in page.value if not message.isDraft],
            "next_skip": next_skip,
        }

    def _collection[T: BaseModel](
        self, endpoint: str, model: type[T], *, params: dict[str, str | int]
    ) -> list[T]:
        results: list[T] = []
        url = endpoint
        query: dict[str, str | int] | None = params
        for _ in range(MAX_PAGES):
            page = _parse(self._request("GET", url, 200, params=query), _Collection[model])
            results.extend(page.value)
            if page.next_link is None:
                return results
            url = str(self._next_page(page.next_link, endpoint))
            query = None
        raise ProviderError(
            "graph_result_limit", "Outlook returned more results than can be displayed", False
        )

    def conversation(self, conversation_id: str) -> list[MailboxMessage]:
        escaped_id = conversation_id.replace("'", "''")
        results = self._collection(
            f"{self.mailbox_url}/messages",
            _Message,
            params={
                "$select": MESSAGE_FIELDS,
                "$filter": f"conversationId eq '{escaped_id}'",
                "$top": PAGE_SIZE,
            },
        )
        messages = {
            item.id: item.as_message()
            for item in results
            if not item.isDraft and item.conversationId == conversation_id
        }
        return sorted(messages.values(), key=lambda message: (message["at"], message["id"]))

    def attachments(self, message_id: str) -> list[MailboxAttachment]:
        attachments = self._collection(
            f"{self._message_url(message_id)}/attachments",
            _Attachment,
            params={"$select": ATTACHMENT_FIELDS, "$top": PAGE_SIZE},
        )
        return [
            attachment.as_attachment()
            for attachment in attachments
            if attachment.kind == FILE_ATTACHMENT
        ]

    def download(self, message_id: str, attachment_id: str) -> tuple[str, bytes]:
        url = f"{self._message_url(message_id)}/attachments/{_segment(attachment_id)}"
        metadata = _parse(
            self._request("GET", url, 200, params={"$select": ATTACHMENT_FIELDS}), _Attachment
        )
        if metadata.kind != FILE_ATTACHMENT:
            raise ProviderError(
                "graph_attachment_unsupported",
                "Only Outlook file attachments can be downloaded",
                False,
            )
        if metadata.size > MAX_DOWNLOAD_BYTES:
            raise ProviderError(
                "graph_attachment_too_large",
                "The Outlook attachment is too large to download",
                False,
            )
        headers = self._headers()
        data = bytearray()
        try:
            with self.client.stream(
                "GET", f"{url}/$value", headers=headers, follow_redirects=False
            ) as response:
                _check_status(response, 200)
                for chunk in response.iter_bytes(chunk_size=65_536):
                    if len(data) + len(chunk) > MAX_DOWNLOAD_BYTES:
                        raise ProviderError(
                            "graph_attachment_too_large",
                            "The Outlook attachment is too large to download",
                            False,
                        )
                    data.extend(chunk)
        except httpx.RequestError:
            raise ProviderError(
                "graph_transport_error", "Microsoft email service connection failed", True
            ) from None
        return metadata.name, bytes(data)
