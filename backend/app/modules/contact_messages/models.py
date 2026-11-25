from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ContactMessage(Base):
    __tablename__ = "contact_messages"
    __table_args__ = (
        UniqueConstraint("form_id", "submission_id"),
        Index("ix_contact_messages_received_at_id", "received_at", "id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    form_id: Mapped[str] = mapped_column(String(200))
    submission_id: Mapped[str] = mapped_column(String(200))
    first_name: Mapped[str | None] = mapped_column(String(150))
    last_name: Mapped[str | None] = mapped_column(String(150))
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(80))
    message: Mapped[str] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
