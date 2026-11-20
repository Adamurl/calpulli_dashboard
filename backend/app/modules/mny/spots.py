from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.security import require_staff_access
from app.db.session import get_session
from app.modules.mny.models import VendorApplication
from app.modules.mny.spot_inventory import Spot, SpotFields, SpotInventory, VendorSpot

router = APIRouter(prefix="/mny/spots", tags=["mny"], dependencies=[Depends(require_staff_access)])


class SpotVendor(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    business_name: str | None
    category: str | None


class SpotRead(SpotFields):
    vendors: list[SpotVendor]


class SpotList(BaseModel):
    event_year: int
    inventory_available: bool
    spots: list[SpotRead]


@router.get("")
def list_spots(
    session: Annotated[Session, Depends(get_session)],
    event_year: Annotated[int, Query(ge=2000, le=9999)],
) -> SpotList:
    try:
        rows = session.execute(
            select(
                Spot,
                VendorApplication.id,
                VendorApplication.business_name,
                VendorApplication.category,
            )
            .outerjoin(
                VendorSpot,
                and_(VendorSpot.event_year == Spot.event_year, VendorSpot.spot_id == Spot.id),
            )
            .outerjoin(
                VendorApplication,
                and_(
                    VendorApplication.event_year == VendorSpot.event_year,
                    VendorApplication.id == VendorSpot.vendor_id,
                ),
            )
            .where(Spot.event_year == event_year)
            .order_by(Spot.label, Spot.id, VendorApplication.source_key, VendorApplication.id)
        ).all()
        available = (
            bool(rows)
            or session.scalar(
                select(SpotInventory.event_year).where(SpotInventory.event_year == event_year)
            )
            is not None
        )
    except OperationalError:
        raise HTTPException(503, "Database unavailable") from None

    spots: dict[str, SpotRead] = {}
    for spot, vendor_id, business_name, category in rows:
        if spot.id not in spots:
            spots[spot.id] = SpotRead(
                id=spot.id, label=spot.label, status=spot.status, price=spot.price, vendors=[]
            )
        if vendor_id is not None:
            spots[spot.id].vendors.append(
                SpotVendor(id=vendor_id, business_name=business_name, category=category)
            )
    return SpotList(
        event_year=event_year, inventory_available=available, spots=list(spots.values())
    )
