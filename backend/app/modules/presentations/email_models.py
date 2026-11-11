from datetime import datetime
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


class EmailTemplate(Base):
    __tablename__ = "presentation_email_templates"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    subject: Mapped[str] = mapped_column(String(998))
    body_text: Mapped[str] = mapped_column(Text)
    ready_for_use: Mapped[bool] = mapped_column(default=False)
    updated_by: Mapped[str | None] = mapped_column(String(100))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EmailMessage(Base):
    __tablename__ = "presentation_email_messages"
    __table_args__ = (
        UniqueConstraint("inquiry_id", "template_key", "triggering_event", name="uq_email_event"),
        CheckConstraint(
            "status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENDING','SENT',"
            "'FAILED','CANCELLED')",
            name="email_status_allowed",
        ),
        CheckConstraint("attempts >= 0 AND attempts <= 3", name="email_attempts_bounded"),
        Index("ix_presentation_email_messages_inquiry", "inquiry_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    inquiry_id: Mapped[UUID] = mapped_column(
        ForeignKey("presentation_requests.id", ondelete="RESTRICT")
    )
    presentation_id: Mapped[UUID] = mapped_column(
        ForeignKey("presentation_requests.id", ondelete="RESTRICT")
    )
    template_key: Mapped[str] = mapped_column(ForeignKey("presentation_email_templates.key"))
    state_trigger: Mapped[str] = mapped_column(String(60))
    triggering_event: Mapped[str] = mapped_column(String(120))
    recipient_email: Mapped[str | None] = mapped_column(String(320))
    recipient_name: Mapped[str | None] = mapped_column(Text)
    subject: Mapped[str] = mapped_column(String(998), default="")
    body_text: Mapped[str] = mapped_column(Text, default="")
    source_subject: Mapped[str | None] = mapped_column(Text)
    source_body: Mapped[str | None] = mapped_column(Text)
    body_html: Mapped[str] = mapped_column(Text, default="")
    variables: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict)
    missing_variables: Mapped[list[str]] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT")
    requires_approval: Mapped[bool]
    approved_by: Mapped[str | None] = mapped_column(String(100))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_by: Mapped[str | None] = mapped_column(String(100))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_message_id: Mapped[str | None] = mapped_column(String(200))
    provider_thread_id: Mapped[str | None] = mapped_column(String(200))
    rfc_message_id: Mapped[str] = mapped_column(String(200))
    reply_to_id: Mapped[UUID | None] = mapped_column(ForeignKey("presentation_email_messages.id"))
    resend_of_id: Mapped[UUID | None] = mapped_column(ForeignKey("presentation_email_messages.id"))
    error_code: Mapped[str | None] = mapped_column(String(100))
    error_message: Mapped[str | None] = mapped_column(Text)
    retryable: Mapped[bool] = mapped_column(default=False)
    delivery_unknown: Mapped[bool] = mapped_column(default=False)
    attempts: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EmailStaffTask(Base):
    __tablename__ = "presentation_email_staff_tasks"
    __table_args__ = (UniqueConstraint("email_message_id", "code", name="uq_email_task_code"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    inquiry_id: Mapped[UUID] = mapped_column(
        ForeignKey("presentation_requests.id", ondelete="RESTRICT")
    )
    email_message_id: Mapped[UUID] = mapped_column(
        ForeignKey("presentation_email_messages.id", ondelete="RESTRICT")
    )
    code: Mapped[str] = mapped_column(String(100))
    summary: Mapped[str] = mapped_column(Text)
    resolved: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
