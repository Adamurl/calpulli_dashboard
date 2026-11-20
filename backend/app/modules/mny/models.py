from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VendorApplication(Base):
    __tablename__ = "mny_vendor_applications"
    __table_args__ = (
        UniqueConstraint("event_year", "source", "source_key"),
        CheckConstraint("event_year BETWEEN 2000 AND 9999", name="year_range"),
        CheckConstraint("source IN ('form_csv', 'legacy_vendor')", name="source_allowed"),
        CheckConstraint("follower_count >= 0", name="nonnegative_followers"),
        Index("ix_mny_vendor_applications_year_business", "event_year", "business_name", "id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    event_year: Mapped[int]
    source: Mapped[str]
    source_key: Mapped[str]
    business_name: Mapped[str | None]
    contact_name: Mapped[str | None]
    email: Mapped[str | None]
    phone: Mapped[str | None]
    category: Mapped[str | None]
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    follower_count: Mapped[int | None]
    follower_response: Mapped[str | None]
    responses: Mapped[dict[str, Any]] = mapped_column(JSONB)
