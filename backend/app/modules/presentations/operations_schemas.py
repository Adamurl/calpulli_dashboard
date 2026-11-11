from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.modules.presentations.schemas import PresentationStatus

Basis = Literal["unknown", "recorded", "explicit", "user_assumption"]
StatusBasis = Literal["explicit", "user_assumption", "unresolved"]


class OperationalValues(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    event_date: date | None = None
    start_time: str | None = None
    occasion: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    proposed_status: PresentationStatus | None = None
    status_basis: StatusBasis = "unresolved"
    quoted_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    recorded_received_amount: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    currency: str | None = None
    finder_name: str | None = None
    payment_status: Literal["unknown", "paid", "unpaid", "partial", "no_charge", "refunded"] = (
        "unknown"
    )
    payment_basis: Basis = "unknown"
    payment_method: Literal["unknown", "check", "cash", "bank_transfer", "other"] = "unknown"
    payment_notes: str | None = None
    engagement_type: Literal["unknown", "paid", "volunteer", "calpulli_internal"] = "unknown"
    engagement_basis: Basis = "unknown"
    invoice_status: Literal["unknown", "done", "not_done"] = "unknown"
    coi_status: Literal["unknown", "done", "not_done"] = "unknown"
    attendance_count: int | None = Field(default=None, ge=0)
    roster_count: int | None = Field(default=None, ge=0)
    attendance_notes: str | None = None
    parking_notes: str | None = None
    dressing_room_notes: str | None = None
    logistics_notes: str | None = None
    rule_codes: list[str] = Field(default_factory=list)

    def operation_fields(self) -> dict:
        return self.model_dump(
            exclude={
                "event_date",
                "start_time",
                "occasion",
                "contact_email",
                "contact_phone",
                "proposed_status",
                "rule_codes",
            }
        )


class OperationsRead(BaseModel):
    request_id: UUID
    imported_from: str | None = None
    quoted_amount: Decimal | None
    recorded_received_amount: Decimal | None
    currency: str | None
    finder_name: str | None
    payment_status: Literal["unknown", "paid", "unpaid", "partial", "no_charge", "refunded"]
    payment_basis: Basis
    payment_method: Literal["unknown", "check", "cash", "bank_transfer", "other"]
    payment_notes: str | None
    engagement_type: Literal["unknown", "paid", "volunteer", "calpulli_internal"]
    engagement_basis: Basis
    invoice_status: Literal["unknown", "done", "not_done"]
    coi_status: Literal["unknown", "done", "not_done"]
    attendance_count: int | None
    roster_count: int | None
    attendance_notes: str | None
    parking_notes: str | None
    dressing_room_notes: str | None
    logistics_notes: str | None
    status_basis: StatusBasis
    updated_at: datetime
