from datetime import date, datetime, time
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PresentationImportBatch(Base):
    __tablename__ = "presentation_import_batches"
    __table_args__ = (
        UniqueConstraint("source_key", "file_sha256", name="uq_presentation_import_batches_file"),
        CheckConstraint("row_count >= 0", name="row_count_nonnegative"),
        CheckConstraint("imported_count >= 0", name="imported_count_nonnegative"),
        CheckConstraint("skipped_count >= 0", name="skipped_count_nonnegative"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    source_key: Mapped[str] = mapped_column(String(200))
    file_sha256: Mapped[str] = mapped_column(String(64))
    row_count: Mapped[int]
    imported_count: Mapped[int] = mapped_column(default=0)
    skipped_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PresentationRequest(Base):
    __tablename__ = "presentation_requests"
    __table_args__ = (
        UniqueConstraint(
            "source", "source_key", "external_id", name="uq_presentation_source_identity"
        ),
        CheckConstraint("source IN ('legacy_csv','manual','wix')", name="source_allowed"),
        CheckConstraint(
            "source = 'manual' OR (source_key IS NOT NULL AND external_id IS NOT NULL)",
            name="external_source_identity",
        ),
        CheckConstraint(
            "form_version IN ('legacy_v1','presentation_v2')", name="form_version_allowed"
        ),
        CheckConstraint(
            "status IN ('unknown','new','reviewing','proposal_sent','booked',"
            "'completed','declined','cancelled')",
            name="status_allowed",
        ),
        CheckConstraint("estimated_guests >= 0", name="guests_nonnegative"),
        CheckConstraint("source_row_number > 0", name="source_row_positive"),
        CheckConstraint("event_access IN ('public','private')", name="access_allowed"),
        CheckConstraint("event_setting IN ('indoor','outdoor','unsure')", name="setting_allowed"),
        CheckConstraint(
            "audience_distance_12ft IN ('yes','no','unsure')", name="audience_distance_allowed"
        ),
        CheckConstraint("jsonb_typeof(event_types) = 'array'", name="event_types_array"),
        CheckConstraint("jsonb_typeof(referral_sources) = 'array'", name="referral_sources_array"),
        CheckConstraint("jsonb_typeof(original_fields) = 'object'", name="original_fields_object"),
        Index("ix_presentation_requests_created_id", "created_at", "id"),
        Index("ix_presentation_requests_status", "status"),
        Index("ix_presentation_requests_event_date", "event_date"),
        Index("ix_presentation_requests_import_batch_id", "import_batch_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    source: Mapped[str] = mapped_column(String(20))
    source_key: Mapped[str | None] = mapped_column(String(200))
    external_id: Mapped[str | None] = mapped_column(String(200))
    form_version: Mapped[str] = mapped_column(String(30))
    import_batch_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("presentation_import_batches.id", ondelete="RESTRICT")
    )
    source_row_number: Mapped[int | None]
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    status: Mapped[str] = mapped_column(String(30), default="unknown")
    event_date: Mapped[date | None]
    start_time: Mapped[time | None]
    end_time: Mapped[time | None]
    event_timezone: Mapped[str | None] = mapped_column(String(100))
    event_access: Mapped[str | None] = mapped_column(String(20))
    event_setting: Mapped[str | None] = mapped_column(String(20))
    event_types: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    event_purpose: Mapped[str | None] = mapped_column(Text)
    venue_address: Mapped[str | None] = mapped_column(Text)
    estimated_guests: Mapped[int | None]
    audience_distance_12ft: Mapped[str | None] = mapped_column(String(20))
    unavailable_logistics: Mapped[str | None] = mapped_column(Text)
    organization_name: Mapped[str | None] = mapped_column(Text)
    contact_full_name: Mapped[str | None] = mapped_column(Text)
    contact_first_name: Mapped[str | None] = mapped_column(Text)
    contact_last_name: Mapped[str | None] = mapped_column(Text)
    contact_email: Mapped[str | None] = mapped_column(Text)
    contact_phone: Mapped[str | None] = mapped_column(Text)
    organization_website: Mapped[str | None] = mapped_column(Text)
    referral_sources: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    referral_reference: Mapped[str | None] = mapped_column(Text)
    additional_notes: Mapped[str | None] = mapped_column(Text)
    internal_notes: Mapped[str | None] = mapped_column(Text)
    original_fields: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}"
    )


class PresentationActivity(Base):
    __tablename__ = "presentation_activities"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('created','status_changed','note_added','email_recommended','email_blocked',"
            "'email_draft_created','email_approved','email_cancelled','email_send_started',"
            "'email_sent','email_send_failed','email_send_retried','details_updated',"
            "'email_draft_updated')",
            name="kind_allowed",
        ),
        Index("ix_presentation_activities_request_created", "request_id", "created_at", "id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(
        ForeignKey("presentation_requests.id", ondelete="RESTRICT")
    )
    kind: Mapped[str] = mapped_column(String(30))
    email_message_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("presentation_email_messages.id", ondelete="RESTRICT")
    )
    actor_id: Mapped[str | None] = mapped_column(String(100))
    summary: Mapped[str | None] = mapped_column(Text)
    previous_status: Mapped[str | None] = mapped_column(String(30))
    new_status: Mapped[str | None] = mapped_column(String(30))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
