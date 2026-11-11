"""Historical reconciliation deliberately bypasses the live email workflow."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.presentations.models import PresentationActivity, PresentationRequest
from app.modules.presentations.operations_models import (
    PresentationImportRow,
    PresentationOperations,
)
from app.modules.presentations.operations_schemas import OperationalValues, OperationsRead


class ImportReviewConflict(Exception):
    pass


class ImportRecordNotFound(Exception):
    pass


def apply_import_row(
    session: Session,
    *,
    row_id: UUID,
    request_id: UUID,
    expected_updated_at: datetime,
    expected_status: str,
    row_digest: str,
    accept_conflicts: bool = False,
) -> PresentationOperations:
    with session.begin():
        request = session.scalar(
            select(PresentationRequest)
            .where(PresentationRequest.id == request_id)
            .with_for_update()
        )
        row = session.scalar(
            select(PresentationImportRow)
            .where(PresentationImportRow.id == row_id)
            .with_for_update()
        )
        if row is None or request is None:
            raise ImportRecordNotFound
        if row.row_sha256 != row_digest or row.request_id not in {None, request_id}:
            raise ImportReviewConflict
        if row.review_state == "applied":
            operations = session.get(PresentationOperations, request_id)
            if operations is None:
                raise ImportReviewConflict
            return operations
        if row.review_state == "skipped":
            raise ImportReviewConflict
        if request.updated_at != expected_updated_at or request.status != expected_status:
            raise ImportReviewConflict
        values = OperationalValues.model_validate(row.normalized_fields)
        if any(
            code in values.rule_codes
            for code in {
                "unparsed_event_date",
                "unparsed_money",
                "conflicting_status_notes",
                "conflicting_payment_notes",
            }
        ):
            raise ImportReviewConflict
        if values.proposed_status != row.proposed_status or values.status_basis != row.status_basis:
            raise ImportReviewConflict
        operations = session.get(PresentationOperations, request_id)
        if operations is None:
            operations = PresentationOperations(request_id=request_id)
            session.add(operations)
        for field, value in values.operation_fields().items():
            if value is None or value in {"unknown", "unresolved"}:
                continue
            previous = getattr(operations, field)
            if previous is not None and previous not in {"unknown", "unresolved", value}:
                if not accept_conflicts:
                    raise ImportReviewConflict
            setattr(operations, field, value)
        if values.proposed_status and values.proposed_status != request.status:
            session.add(
                PresentationActivity(
                    request_id=request_id,
                    kind="status_changed",
                    previous_status=request.status,
                    new_status=values.proposed_status,
                    actor_id="historical_import",
                    summary="Historical CSV reconciliation",
                )
            )
            request.status = values.proposed_status
        row.observed_request_updated_at = expected_updated_at
        row.request_id = request_id
        row.review_state = "applied"
        row.applied_at = datetime.now(UTC)
        request.updated_at = row.applied_at
        session.flush()
        operations.import_row_id = row.id
        session.flush()
        return operations


def read_operations(session: Session, request_id: UUID) -> OperationsRead:
    operations = session.get(PresentationOperations, request_id)
    if operations is None:
        raise ImportRecordNotFound
    evidence = (
        session.get(PresentationImportRow, operations.import_row_id)
        if operations.import_row_id
        else None
    )
    fields = {
        name: getattr(operations, name)
        for name in OperationsRead.model_fields
        if name != "imported_from"
    }
    return OperationsRead(**fields, imported_from=evidence.source_filename if evidence else None)
