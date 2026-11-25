from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

from app.core.email_address import valid_recipient


def check_text(value: str) -> str:
    value.encode("utf-8")
    if "\x00" in value:
        raise ValueError("Invalid text")
    return value


ContactText = Annotated[str, AfterValidator(check_text)]


class ContactMessageFields(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    first_name: Annotated[ContactText, Field(max_length=150)] | None = None
    last_name: Annotated[ContactText, Field(max_length=150)] | None = None
    email: Annotated[ContactText, Field(max_length=254)] | None = None
    phone: Annotated[ContactText, Field(max_length=80)] | None = None
    message: ContactText = Field(min_length=1, max_length=10_000)

    @field_validator("first_name", "last_name", "email", "phone")
    @classmethod
    def normalize_blank(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str | None) -> str | None:
        if value is not None and not valid_recipient(value):
            raise ValueError("Invalid email address")
        return value


class ContactMessageRead(ContactMessageFields):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    received_at: datetime


class ContactMessagePage(BaseModel):
    messages: list[ContactMessageRead]
    previous_offset: int | None
    next_offset: int | None
