from typing import Any
from uuid import UUID

from pydantic import BaseModel, FiniteFloat
from sqlalchemy import CheckConstraint, Float, ForeignKeyConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.modules.mny.models import VendorApplication


class SpotInventory(Base):
    __tablename__ = "mny_spot_inventories"
    __table_args__ = (CheckConstraint("event_year BETWEEN 2000 AND 9999", name="year_range"),)

    event_year: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    spots: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)


class Spot(Base):
    __tablename__ = "mny_spots"
    __table_args__ = (CheckConstraint("event_year BETWEEN 2000 AND 9999", name="year_range"),)

    event_year: Mapped[int] = mapped_column(primary_key=True)
    id: Mapped[str] = mapped_column(primary_key=True)
    label: Mapped[str | None]
    status: Mapped[str]
    price: Mapped[float | None] = mapped_column(Float)


class VendorSpot(Base):
    __tablename__ = "mny_vendor_spots"
    __table_args__ = (
        ForeignKeyConstraint(["event_year", "spot_id"], [Spot.event_year, Spot.id]),
        ForeignKeyConstraint(
            ["event_year", "vendor_id"], [VendorApplication.event_year, VendorApplication.id]
        ),
    )

    event_year: Mapped[int] = mapped_column(primary_key=True)
    spot_id: Mapped[str] = mapped_column(primary_key=True)
    vendor_id: Mapped[UUID] = mapped_column(primary_key=True)


class SpotFields(BaseModel):
    id: str
    label: str | None
    status: str
    price: FiniteFloat | None


class ArchivedSpot(SpotFields):
    vendor_source_keys: list[str]
