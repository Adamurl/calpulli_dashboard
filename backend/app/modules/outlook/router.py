from collections.abc import Iterator
from contextlib import contextmanager
from hashlib import sha256
from typing import Annotated, Literal
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.email_address import valid_recipient
from app.core.security import require_staff_access
from app.db.session import get_session
from app.integrations.gmail import ProviderError
from app.integrations.outlook_delivery import OutlookDelivery
from app.integrations.supabase_auth import AuthenticatedUser
from app.modules.outlook.models import OutlookSendAttempt
from app.modules.outlook.schemas import (
    EmailBody,
    MailboxAttachment,
    MailboxMessage,
    MailboxPage,
    SendInput,
    SendReceipt,
)

router = APIRouter(
    prefix="/outlook", tags=["outlook"], dependencies=[Depends(require_staff_access)]
)
Db = Annotated[Session, Depends(get_session)]
Staff = Annotated[AuthenticatedUser, Depends(require_staff_access)]
GraphID = Annotated[str, Path(min_length=1, max_length=2048)]
MAX_SEND_REQUEST_BYTES = 4_000_000


@contextmanager
def graph_errors() -> Iterator[None]:
    try:
        yield
    except ProviderError as error:
        if error.delivery_unknown:
            status = 409
        elif error.code in {"not_found", "graph_not_found"}:
            status = 404
        elif error.code in {"invalid_reply", "graph_reply_recipient", "graph_invalid_id"}:
            status = 422
        elif error.code == "graph_attachment_too_large":
            status = 413
        elif error.code == "graph_attachment_unsupported":
            status = 415
        elif error.code == "graph_rate_limited":
            status = 429
        else:
            status = 503
        raise HTTPException(status) from None


def delivery(request: Request) -> OutlookDelivery:
    return request.app.state.outlook_delivery


@router.get("/capabilities")
def capabilities(request: Request):
    outlook = delivery(request)
    mailbox = outlook.config.microsoft_mailbox
    return {
        "mailbox_address": mailbox if valid_recipient(mailbox) else None,
        "mailbox_available": outlook.graph is not None,
        "test_mode": outlook.config.email_test_mode,
    }


@router.get("/messages", response_model=MailboxPage)
def messages(
    request: Request,
    folder: Literal["inbox", "sentitems"] = "inbox",
    skip: Annotated[int, Query(ge=0, le=2_147_483_647)] = 0,
    contact: Annotated[str | None, Query(max_length=320)] = None,
):
    if contact is not None and not valid_recipient(contact):
        raise HTTPException(422)
    with graph_errors():
        page = delivery(request).available_graph().messages(folder, skip=skip)
    if contact is not None:
        address = contact.casefold()
        page["messages"] = [
            item
            for item in page["messages"]
            if address in {value.casefold() for value in [item["sender"], *item["recipients"]]}
        ]
    return page


@router.get("/conversations/{conversation_id:path}", response_model=list[MailboxMessage])
def conversation(request: Request, conversation_id: GraphID):
    with graph_errors():
        return delivery(request).available_graph().conversation(conversation_id)


@router.get("/messages/{message_id:path}/attachments", response_model=list[MailboxAttachment])
def attachments(request: Request, message_id: GraphID):
    with graph_errors():
        return delivery(request).available_graph().attachments(message_id)


@router.get("/messages/{message_id:path}/attachments/{attachment_id:path}")
def download(request: Request, message_id: GraphID, attachment_id: GraphID):
    with graph_errors():
        name, content = delivery(request).available_graph().download(message_id, attachment_id)
    safe_name = quote(name.replace("/", "_").replace("\\", "_"), safe="")
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/preview")
def preview(payload: EmailBody) -> dict[str, str]:
    return {"html": payload.html()}


@router.post("/send", status_code=202, response_model=SendReceipt)
async def send(request: Request, staff: Staff, session: Db) -> SendReceipt:
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_SEND_REQUEST_BYTES:
            raise HTTPException(413)
        body.extend(chunk)
    try:
        payload = SendInput.model_validate_json(body)
    except ValidationError:
        raise HTTPException(422) from None
    return await run_in_threadpool(submit, delivery(request), payload, staff.id, session)


def submit(
    outlook: OutlookDelivery, payload: SendInput, staff_id: UUID, session: Session
) -> SendReceipt:
    with graph_errors():
        graph = outlook.available_graph()
        recipient, reply_to = outlook.address(payload.recipient, payload.reply_to)
    payload_hash = sha256(payload.model_dump_json(exclude={"request_id"}).encode()).hexdigest()
    fingerprint = sha256(
        f"{outlook.config.microsoft_mailbox}:{recipient}:{reply_to}:{payload_hash}".encode()
    ).hexdigest()
    claimed = session.scalar(
        insert(OutlookSendAttempt)
        .values(staff_id=staff_id, request_id=payload.request_id, fingerprint=fingerprint)
        .on_conflict_do_nothing(index_elements=["staff_id", "request_id"])
        .returning(OutlookSendAttempt)
    )
    if claimed is None:
        previous = session.get(OutlookSendAttempt, (staff_id, payload.request_id))
        if (
            previous is None
            or previous.fingerprint != fingerprint
            or previous.message_id is None
            or previous.conversation_id is None
        ):
            raise HTTPException(409)
        return SendReceipt(message_id=previous.message_id, conversation_id=previous.conversation_id)
    session.commit()
    with graph_errors():
        try:
            result = graph.send(
                recipient=recipient,
                subject=payload.subject,
                html=payload.html(),
                attachments=[file.graph_value() for file in payload.attachments],
                reply_to=reply_to,
            )
        except ProviderError as error:
            if not error.delivery_unknown:
                session.delete(claimed)
                session.commit()
            raise
    claimed.message_id = result.message_id
    claimed.conversation_id = result.thread_id
    session.commit()
    return SendReceipt(message_id=result.message_id, conversation_id=result.thread_id)
