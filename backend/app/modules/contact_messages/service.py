from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.contact_messages.models import ContactMessage
from app.modules.contact_messages.schemas import ContactMessageFields


class SubmissionConflict(Exception):
    pass


def save_contact_message(
    session: Session, form_id: str, submission_id: str, answers: ContactMessageFields
) -> tuple[UUID, bool]:
    values = answers.model_dump()
    statement = (
        insert(ContactMessage)
        .values(id=uuid4(), form_id=form_id, submission_id=submission_id, **values)
        .on_conflict_do_nothing(
            index_elements=[ContactMessage.form_id, ContactMessage.submission_id]
        )
        .returning(ContactMessage.id)
    )
    message_id = session.scalar(statement)
    if message_id is not None:
        session.commit()
        return message_id, True

    existing = session.scalars(
        select(ContactMessage).where(
            ContactMessage.form_id == form_id, ContactMessage.submission_id == submission_id
        )
    ).one()
    if any(getattr(existing, key) != value for key, value in values.items()):
        raise SubmissionConflict
    return existing.id, False
