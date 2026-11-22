from base64 import b64decode
from binascii import Error as Base64Error
from datetime import datetime
from html import escape
from pathlib import PurePosixPath
from typing import Literal
from uuid import UUID

from markdown_it import MarkdownIt
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.email_address import valid_recipient

MAX_ATTACHMENT_BYTES = 2_500_000
MAX_ATTACHMENT_BASE64 = 4 * ((MAX_ATTACHMENT_BYTES + 2) // 3)
FILE_TYPES = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".heic": "image/heic",
}
MARKDOWN = MarkdownIt("commonmark", {"html": False, "breaks": True}).disable("image")


class AttachmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=180)
    content_type: str = Field(max_length=128)
    content_base64: str = Field(min_length=4, max_length=MAX_ATTACHMENT_BASE64)

    @field_validator("name")
    @classmethod
    def allowed_file(cls, value: str) -> str:
        if (
            any(ord(c) < 32 or ord(c) == 127 or c in "/\\" for c in value)
            or PurePosixPath(value).suffix.lower() not in FILE_TYPES
        ):
            raise ValueError("Unsupported attachment filename")
        return value

    def graph_value(self) -> dict[str, str]:
        return {
            "name": self.name,
            "content_type": FILE_TYPES[PurePosixPath(self.name).suffix.lower()],
            "content_base64": self.content_base64,
        }


class EmailBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body_text: str = Field(min_length=1, max_length=30_000)
    format: Literal["plain", "markdown"] = "plain"

    @field_validator("body_text")
    @classmethod
    def nonempty_body(cls, value: str) -> str:
        if not value.strip() or "\x00" in value:
            raise ValueError("Invalid email body")
        return value

    def html(self) -> str:
        if self.format == "markdown":
            return MARKDOWN.render(self.body_text)
        text = escape(self.body_text.replace("\r\n", "\n").replace("\r", "\n"))
        return '<div style="white-space: pre-wrap">' + text.replace("\n", "<br>") + "</div>"


class SendInput(EmailBody):
    request_id: UUID
    recipient: str = Field(max_length=320)
    subject: str = Field(max_length=998)
    attachments: list[AttachmentInput] = Field(default_factory=list, max_length=8)
    reply_to: str | None = Field(default=None, min_length=1, max_length=2048)

    @field_validator("recipient")
    @classmethod
    def email_address(cls, value: str) -> str:
        if not valid_recipient(value):
            raise ValueError("Invalid recipient")
        return value

    @field_validator("subject")
    @classmethod
    def subject_line(cls, value: str) -> str:
        if any(c in value for c in "\r\n\x00"):
            raise ValueError("Invalid email subject")
        return value

    @model_validator(mode="after")
    def subject_for_new_message(self) -> "SendInput":
        if self.reply_to is None and not self.subject.strip():
            raise ValueError("A new email requires a subject")
        return self

    @field_validator("attachments")
    @classmethod
    def bounded_files(cls, value: list[AttachmentInput]) -> list[AttachmentInput]:
        if sum(len(file.content_base64) for file in value) > MAX_ATTACHMENT_BASE64 + 4 * len(value):
            raise ValueError("Attachment total exceeds 2.5 MB")
        total = 0
        for file in value:
            try:
                content = b64decode(file.content_base64, validate=True)
            except (ValueError, Base64Error) as error:
                raise ValueError("Invalid attachment encoding") from error
            if not content:
                raise ValueError("Empty attachment")
            total += len(content)
        if total > MAX_ATTACHMENT_BYTES:
            raise ValueError("Attachment total exceeds 2.5 MB")
        return value


class MailboxMessage(BaseModel):
    id: str
    conversation_id: str
    subject: str
    sender: str
    recipients: list[str]
    at: datetime | None
    body_text: str
    has_attachments: bool
    reply_to: list[str] = Field(default_factory=list)

    @field_validator("at", mode="before")
    @classmethod
    def missing_date(cls, value: str | None) -> str | None:
        return value or None


class MailboxPage(BaseModel):
    messages: list[MailboxMessage]
    next_skip: int | None


class MailboxAttachment(BaseModel):
    id: str
    name: str
    size: int
    content_type: str


class SendReceipt(BaseModel):
    message_id: str
    conversation_id: str
    status: Literal["accepted"] = "accepted"
