"""Operational facts and restricted evidence for historical presentation imports."""

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PresentationImportRow(Base):
    __tablename__ = "presentation_import_rows"
    __table_args__ = (
        UniqueConstraint(
            "batch_id",
            "source_record_number",
            name="uq_presentation_import_rows_record",
        ),
        UniqueConstraint("request_id", "id", name="uq_import_rows_request_identity"),
        CheckConstraint("source_record_number > 0", name="source_record_positive"),
        CheckConstraint("row_sha256 ~ '^[0-9a-f]{64}$'", name="row_digest_valid"),
        CheckConstraint(
            "review_state IN ('pending','applied','conflict','skipped')",
            name="review_state_allowed",
        ),
        CheckConstraint(
            "proposed_status IN ('unknown','new','reviewing','proposal_sent','booked',"
            "'completed','declined','cancelled')",
            name="proposed_status_allowed",
        ),
        CheckConstraint(
            "status_basis IN ('explicit','user_assumption','unresolved')",
            name="status_basis_allowed",
        ),
        CheckConstraint("jsonb_typeof(original_headers) = 'array'", name="original_headers_array"),
        CheckConstraint("jsonb_typeof(original_cells) = 'array'", name="original_cells_array"),
        CheckConstraint(
            "jsonb_typeof(normalized_fields) = 'object'",
            name="normalized_fields_object",
        ),
        CheckConstraint("jsonb_typeof(rule_codes) = 'array'", name="rule_codes_array"),
        Index("ix_presentation_import_rows_request_id", "request_id"),
        Index("ix_presentation_import_rows_review_state", "review_state"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    batch_id: Mapped[UUID] = mapped_column(
        ForeignKey("presentation_import_batches.id", ondelete="RESTRICT")
    )
    source_filename: Mapped[str] = mapped_column(String(255))
    source_record_number: Mapped[int]
    row_sha256: Mapped[str] = mapped_column(String(64))
    original_headers: Mapped[list[str]] = mapped_column(JSONB)
    original_cells: Mapped[list[str]] = mapped_column(JSONB)
    normalized_fields: Mapped[dict[str, Any]] = mapped_column(JSONB)
    request_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("presentation_requests.id", ondelete="RESTRICT")
    )
    review_state: Mapped[str] = mapped_column(
        String(20), default="pending", server_default="pending"
    )
    rule_codes: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    proposed_status: Mapped[str | None] = mapped_column(String(30))
    status_basis: Mapped[str] = mapped_column(
        String(20), default="unresolved", server_default="unresolved"
    )
    observed_request_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PresentationOperations(Base):
    __tablename__ = "presentation_operations"
    __table_args__ = (
        UniqueConstraint("import_row_id", name="uq_presentation_operations_import_row"),
        ForeignKeyConstraint(
            ["request_id", "import_row_id"],
            ["presentation_import_rows.request_id", "presentation_import_rows.id"],
            name="fk_operations_request_import_row",
            ondelete="RESTRICT",
        ),
        CheckConstraint("quoted_amount >= 0", name="quoted_amount_nonnegative"),
        CheckConstraint("recorded_received_amount >= 0", name="received_amount_nonnegative"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_valid"),
        CheckConstraint("attendance_count >= 0", name="attendance_count_nonnegative"),
        CheckConstraint("roster_count >= 0", name="roster_count_nonnegative"),
        CheckConstraint(
            "payment_status IN ('unknown','paid','unpaid','partial','no_charge','refunded')",
            name="payment_status_allowed",
        ),
        CheckConstraint(
            "payment_basis IN ('unknown','recorded','explicit','user_assumption')",
            name="payment_basis_allowed",
        ),
        CheckConstraint(
            "payment_method IN ('unknown','check','cash','bank_transfer','other')",
            name="payment_method_allowed",
        ),
        CheckConstraint(
            "engagement_type IN ('unknown','paid','volunteer','calpulli_internal')",
            name="engagement_type_allowed",
        ),
        CheckConstraint(
            "engagement_basis IN ('unknown','recorded','explicit','user_assumption')",
            name="engagement_basis_allowed",
        ),
        CheckConstraint(
            "invoice_status IN ('unknown','done','not_done')",
            name="invoice_status_allowed",
        ),
        CheckConstraint("coi_status IN ('unknown','done','not_done')", name="coi_status_allowed"),
        CheckConstraint(
            "status_basis IN ('explicit','user_assumption','unresolved')",
            name="status_basis_allowed",
        ),
    )

    request_id: Mapped[UUID] = mapped_column(
        ForeignKey("presentation_requests.id", ondelete="RESTRICT"), primary_key=True
    )
    import_row_id: Mapped[UUID | None]
    quoted_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    recorded_received_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    finder_name: Mapped[str | None] = mapped_column(Text)
    payment_status: Mapped[str] = mapped_column(
        String(20), default="unknown", server_default="unknown"
    )
    payment_basis: Mapped[str] = mapped_column(
        String(20), default="unknown", server_default="unknown"
    )
    payment_method: Mapped[str] = mapped_column(
        String(20), default="unknown", server_default="unknown"
    )
    payment_notes: Mapped[str | None] = mapped_column(Text)
    engagement_type: Mapped[str] = mapped_column(
        String(20), default="unknown", server_default="unknown"
    )
    engagement_basis: Mapped[str] = mapped_column(
        String(20), default="unknown", server_default="unknown"
    )
    invoice_status: Mapped[str] = mapped_column(
        String(20), default="unknown", server_default="unknown"
    )
    coi_status: Mapped[str] = mapped_column(String(20), default="unknown", server_default="unknown")
    attendance_count: Mapped[int | None]
    roster_count: Mapped[int | None]
    attendance_notes: Mapped[str | None] = mapped_column(Text)
    parking_notes: Mapped[str | None] = mapped_column(Text)
    dressing_room_notes: Mapped[str | None] = mapped_column(Text)
    logistics_notes: Mapped[str | None] = mapped_column(Text)
    status_basis: Mapped[str] = mapped_column(
        String(20), default="unresolved", server_default="unresolved"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
