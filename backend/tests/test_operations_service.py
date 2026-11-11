"""Exercise reconciliation transactions; PostgreSQL constraints have separate tests."""

import csv
import json
import re
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import CheckConstraint, MetaData, create_engine, event, func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.imports.operational_csv import read_operations
from app.imports.operational_presentations import stage_operations
from app.modules.presentations.email_models import EmailMessage, EmailStaffTask
from app.modules.presentations.models import PresentationActivity, PresentationRequest
from app.modules.presentations.operations_models import (
    PresentationImportRow,
    PresentationOperations,
)
from app.modules.presentations.operations_service import (
    ImportReviewConflict,
    apply_import_row,
)
from app.modules.presentations.operations_service import (
    read_operations as read_business_operations,
)


@compiles(JSONB, "sqlite")
def sqlite_jsonb(type_, compiler, **kwargs):
    return "JSON"


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )

    @event.listens_for(engine, "connect")
    def functions(connection, record):
        connection.create_function(
            "jsonb_typeof",
            1,
            lambda value: "array" if isinstance(json.loads(value), list) else "object",
        )
        connection.create_function(
            "regexp",
            2,
            lambda pattern, value: value is None or re.search(pattern, value) is not None,
        )
        connection.execute("PRAGMA foreign_keys=ON")

    metadata = MetaData()
    for table in Base.metadata.sorted_tables:
        copy = table.to_metadata(metadata)
        for constraint in copy.constraints:
            if isinstance(constraint, CheckConstraint) and " ~ " in str(constraint.sqltext):
                from sqlalchemy import text

                constraint.sqltext = text(str(constraint.sqltext).replace(" ~ ", " REGEXP "))
    metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as value:
        yield value
    engine.dispose()


def report(tmp_path, *, filename="fictional.csv", price="1000", received=""):
    path = tmp_path / filename
    with path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "Date of event",
                "Occasion",
                "FINDER",
                "Price",
                "Received PAYMENT (Deposited)",
                "Contact Email",
            ]
        )
        writer.writerow(
            ["03-12-24", "Fictional event", "Staff", price, received, "client@example.org"]
        )
    return read_operations(path, source_year=2024, as_of=date(2026, 11, 11))


def stage(session, tmp_path, **kwargs):
    request = PresentationRequest(
        source="manual",
        form_version="legacy_v1",
        status="unknown",
        event_date=date(2024, 3, 12),
        contact_email="client@example.org",
    )
    session.add(request)
    session.commit()
    source = report(tmp_path, **kwargs)
    result = stage_operations(session, source)
    assert result["staged"] == 1
    row = session.scalar(select(PresentationImportRow))
    session.commit()
    return request, row, source


def apply(session, request, row, **kwargs):
    return apply_import_row(
        session,
        row_id=row.id,
        request_id=request.id,
        row_digest=row.row_sha256,
        expected_updated_at=request.updated_at,
        expected_status=request.status,
        **kwargs,
    )


def test_stage_is_idempotent_and_apply_has_no_email_side_effects(session, tmp_path):
    request, row, source = stage(session, tmp_path)
    assert request.status == "unknown"
    assert row.review_state == "pending"
    assert stage_operations(session, source)["staged"] == 0
    operations = apply(session, request, row)
    assert request.status == "completed"
    assert operations.quoted_amount == Decimal("1000")
    assert operations.recorded_received_amount is None
    assert operations.payment_status == "paid"
    assert operations.payment_basis == "user_assumption"
    assert session.scalar(select(func.count()).select_from(EmailMessage)) == 0
    assert session.scalar(select(func.count()).select_from(EmailStaffTask)) == 0
    assert session.scalar(select(func.count()).select_from(PresentationActivity)) == 1
    business = read_business_operations(session, request.id).model_dump(mode="json")
    assert business["imported_from"] == "fictional.csv"
    assert (
        not {"import_row_id", "original_headers", "original_cells", "row_sha256"} & business.keys()
    )
    session.commit()
    assert apply(session, request, row).request_id == request.id
    assert session.scalar(select(func.count()).select_from(PresentationActivity)) == 1


def test_stale_review_is_rejected_without_partial_writes(session, tmp_path):
    request, row, _ = stage(session, tmp_path)
    old = request.updated_at
    request.status = "reviewing"
    request.updated_at = old + timedelta(seconds=1)
    session.commit()
    with pytest.raises(ImportReviewConflict):
        apply_import_row(
            session,
            row_id=row.id,
            request_id=request.id,
            row_digest=row.row_sha256,
            expected_updated_at=old,
            expected_status="unknown",
        )
    assert session.get(PresentationOperations, request.id) is None
    assert session.get(PresentationImportRow, row.id).review_state == "pending"


def test_reviewed_later_snapshot_preserves_missing_receipts(session, tmp_path):
    request, row, _ = stage(session, tmp_path)
    later = report(tmp_path, filename="later.csv", received="1000")
    stage_operations(session, later)
    second = session.scalar(select(PresentationImportRow).where(PresentationImportRow.id != row.id))
    session.commit()
    original_observed = second.observed_request_updated_at
    apply(session, request, row)
    session.refresh(request)
    session.commit()
    assert request.updated_at != original_observed
    updated = apply(session, request, second, accept_conflicts=True)
    assert updated.recorded_received_amount == Decimal("1000")
    assert updated.payment_basis == "recorded"
    assert updated.import_row_id == second.id


def test_different_request_cannot_use_evidence(session, tmp_path):
    _, row, _ = stage(session, tmp_path)
    other = PresentationRequest(
        id=uuid4(), source="manual", form_version="legacy_v1", status="unknown"
    )
    session.add(other)
    session.commit()
    with pytest.raises(ImportReviewConflict):
        apply(session, other, row)


def test_business_endpoint_requires_staff_and_returns_only_csv_label(session, tmp_path):
    from fastapi.testclient import TestClient

    from app.core.config import Settings
    from app.db.session import get_session
    from app.main import create_app

    request, row, _ = stage(session, tmp_path)
    apply(session, request, row)
    token = "fictional-operations-staff-token-32-characters"
    app = create_app(
        Settings(
            _env_file=None,
            database_url="postgresql+psycopg://test@127.0.0.1:1/calpulli_test",
            internal_api_token=token,
            app_env="test",
        )
    )

    def database():
        with Session(session.bind) as db:
            yield db

    app.dependency_overrides[get_session] = database
    with TestClient(app) as client:
        path = f"/api/v1/presentations/{request.id}/operations"
        assert client.get(path).status_code == 401
        response = client.get(path, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        data = response.json()
        assert data["imported_from"] == "fictional.csv"
        assert data["recorded_received_amount"] is None
        assert "original_cells" not in data
        assert "import_row_id" not in data
