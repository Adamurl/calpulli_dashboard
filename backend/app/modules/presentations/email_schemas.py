from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.presentations.email_registry import VARIABLES, EmailEvent, template_variables


class EventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event: EmailEvent
    variables: dict[str, str] = Field(default_factory=dict, max_length=30)
    contract_signed: bool = False
    payment_received: bool = False
    call_at: datetime | None = None

    @field_validator("variables")
    @classmethod
    def known_variables(cls, value: dict[str, str]) -> dict[str, str]:
        if value.keys() - VARIABLES or any(len(v) > 10000 for v in value.values()):
            raise ValueError("Use supported template variables with values up to 10000 characters")
        return value

    @model_validator(mode="after")
    def verified_event(self) -> "EventInput":
        if self.event == EmailEvent.SIGNED_AND_PAID and not (
            self.contract_signed and self.payment_received
        ):
            raise ValueError("Verify both the contract signature and payment")
        if self.event in {EmailEvent.CALL_BOOKED, EmailEvent.CALL_REMINDER_DUE}:
            if self.call_at is None or self.call_at.utcoffset() is None:
                raise ValueError("Supply a timezone-aware call_at")
        return self


class TemplateEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str = Field(min_length=1, max_length=998)
    body_text: str = Field(min_length=1, max_length=30000)
    ready_for_use: bool = False

    @model_validator(mode="after")
    def valid_template(self) -> "TemplateEdit":
        if any(c in self.subject for c in "\r\n\x00"):
            raise ValueError("Subject must be a single line")
        template_variables(self.subject, self.body_text)
        return self


class TemplateRead(TemplateEdit):
    model_config = ConfigDict(from_attributes=True)
    key: str
    updated_by: str | None
    updated_at: datetime


class DraftEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variables: dict[str, str] = Field(default_factory=dict, max_length=30)
    subject: str | None = Field(default=None, min_length=1, max_length=998)
    body_text: str | None = Field(default=None, min_length=1, max_length=30000)
    recipient_email: str | None = Field(default=None, max_length=320)
    reply_to_id: UUID | None = None

    @field_validator("variables")
    @classmethod
    def known_variables(cls, value: dict[str, str]) -> dict[str, str]:
        return EventInput.known_variables(value)


class ManualDraftCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_key: str = Field(min_length=1, max_length=60)
    variables: dict[str, str] = Field(default_factory=dict, max_length=30)
    reply_to_id: UUID | None = None

    @field_validator("variables")
    @classmethod
    def known_variables(cls, value: dict[str, str]) -> dict[str, str]:
        return EventInput.known_variables(value)


class EmailRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    inquiry_id: UUID
    presentation_id: UUID
    template_key: str
    state_trigger: str
    triggering_event: str
    recipient_email: str | None
    recipient_name: str | None
    subject: str
    body_text: str
    body_html: str
    source_subject: str | None
    source_body: str | None
    variables: dict[str, str]
    missing_variables: list[str]
    status: Literal[
        "DRAFT", "PENDING_APPROVAL", "APPROVED", "SENDING", "SENT", "FAILED", "CANCELLED"
    ]
    requires_approval: bool
    approved_by: str | None
    approved_at: datetime | None
    sent_by: str | None
    sent_at: datetime | None
    provider_message_id: str | None
    provider_thread_id: str | None
    reply_to_id: UUID | None
    error_code: str | None
    error_message: str | None
    retryable: bool
    delivery_unknown: bool
    attempts: int
    created_at: datetime
    updated_at: datetime


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    inquiry_id: UUID
    email_message_id: UUID
    code: str
    summary: str
    resolved: bool
    created_at: datetime
