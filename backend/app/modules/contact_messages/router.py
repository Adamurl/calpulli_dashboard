from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import require_staff_access
from app.db.session import get_session
from app.modules.contact_messages.models import ContactMessage
from app.modules.contact_messages.schemas import ContactMessagePage, ContactMessageRead

router = APIRouter(
    prefix="/contact-messages",
    tags=["contact-messages"],
    dependencies=[Depends(require_staff_access)],
)
PAGE_SIZE = 20


@router.get("")
def list_contact_messages(
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0, le=2**31 - PAGE_SIZE)] = 0,
) -> ContactMessagePage:
    try:
        records = session.scalars(
            select(ContactMessage)
            .order_by(ContactMessage.received_at.desc(), ContactMessage.id.desc())
            .offset(offset)
            .limit(PAGE_SIZE + 1)
        ).all()
    except SQLAlchemyError:
        raise HTTPException(503, "Database unavailable") from None
    return ContactMessagePage(
        messages=[ContactMessageRead.model_validate(record) for record in records[:PAGE_SIZE]],
        previous_offset=max(0, offset - PAGE_SIZE) if offset else None,
        next_offset=offset + PAGE_SIZE if len(records) > PAGE_SIZE else None,
    )
