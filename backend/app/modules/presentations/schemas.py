from datetime import date, datetime, time
from typing import Annotated, Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

PresentationStatus = Literal[
    "unknown", "new", "reviewing", "proposal_sent", "booked", "completed", "declined", "cancelled"
]
PresentationSource = Literal["legacy_csv", "manual", "wix"]
EventType = Literal[
    "k12_school",
    "college_university",
    "nonprofit",
    "government",
    "corporate",
    "cultural_organization",
    "funeral",
    "grand_opening",
    "other",
]
ReferralSource = Literal[
    "website",
    "instagram",
    "facebook",
    "tiktok",
    "word_of_mouth",
    "mexica_new_year",
    "previous_performance",
    "referral",
    "other",
]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)]


class NewPresentation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    event_date: date
    start_time: time
    end_time: time
    event_timezone: Annotated[str, Field(max_length=100)] = "America/Los_Angeles"
    event_access: Literal["public", "private"] | None = None
    event_setting: Literal["indoor", "outdoor", "unsure"] | None = None
    event_types: list[EventType] = Field(min_length=1, max_length=9)
    event_purpose: LongText
    venue_address: ShortText
    estimated_guests: Annotated[int, Field(ge=1, le=10000000, strict=True)]
    audience_distance_12ft: Literal["yes", "no", "unsure"]
    unavailable_logistics: LongText
    organization_name: ShortText | None = None
    contact_first_name: ShortText
    contact_last_name: ShortText
    contact_email: Annotated[str, Field(max_length=320, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")]
    contact_phone: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=3, max_length=100)
    ]
    organization_website: ShortText | None = None
    referral_sources: list[ReferralSource] = Field(default_factory=list, max_length=9)
    referral_reference: ShortText | None = None
    additional_notes: LongText | None = None

    @field_validator(
        "organization_name",
        "organization_website",
        "referral_reference",
        "additional_notes",
        mode="before",
    )
    @classmethod
    def optional_blanks(cls, value: Any) -> Any:
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("event_timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Use an IANA timezone") from None
        return value

    @field_validator("event_types", "referral_sources")
    @classmethod
    def unique_selections(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("Selections must be unique")
        return value

    @model_validator(mode="after")
    def ordered_local_times(self) -> "NewPresentation":
        if self.start_time.tzinfo is not None or self.end_time.tzinfo is not None:
            raise ValueError("Times must be local; supply event_timezone separately")
        if self.end_time <= self.start_time:
            raise ValueError("End time must follow start time on the event date")
        return self


class PresentationPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    status: PresentationStatus | None = None
    expected_current_status: PresentationStatus | None = None
    internal_notes: LongText | None = None

    @model_validator(mode="after")
    def require_change(self) -> "PresentationPatch":
        if self.status is None and self.internal_notes is None:
            raise ValueError("Supply a status change or internal note")
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("Status cannot be null")
        if "internal_notes" in self.model_fields_set and self.internal_notes is None:
            raise ValueError("Internal note cannot be null")
        if (self.status is None) != (self.expected_current_status is None):
            raise ValueError("Status changes require expected_current_status")
        return self


class PresentationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source: PresentationSource
    form_version: str
    status: PresentationStatus
    received_at: datetime | None
    created_at: datetime
    updated_at: datetime
    event_date: date | None
    start_time: time | None
    end_time: time | None
    event_timezone: str | None
    organization_name: str | None
    contact_full_name: str | None
    contact_email: str | None
    event_types: list[str]
    venue_address: str | None
    estimated_guests: int | None


class PresentationRead(PresentationSummary):
    source_key: str | None
    external_id: str | None
    import_batch_id: UUID | None
    source_row_number: int | None
    event_access: str | None
    event_setting: str | None
    event_purpose: str | None
    audience_distance_12ft: str | None
    unavailable_logistics: str | None
    contact_first_name: str | None
    contact_last_name: str | None
    contact_phone: str | None
    organization_website: str | None
    referral_sources: list[str]
    referral_reference: str | None
    additional_notes: str | None
    internal_notes: str | None
    original_fields: dict[str, Any]


class PresentationList(BaseModel):
    items: list[PresentationSummary]
    limit: int
    offset: int


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    request_id: UUID
    kind: str
    previous_status: str | None
    new_status: str | None
    note: str | None
    created_at: datetime


class ActivityList(BaseModel):
    items: list[ActivityRead]
    limit: int
    offset: int
