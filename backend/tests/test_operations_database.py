"""Verify operational storage invariants on an isolated PostgreSQL database."""

import os
import subprocess
import sys
from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import build_engine
from app.modules.presentations.models import PresentationImportBatch, PresentationRequest
from app.modules.presentations.operations_models import (
    PresentationImportRow,
    PresentationOperations,
)

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def operations_database_url() -> str:
    from sqlalchemy.engine import make_url

    raw = os.getenv("TEST_DATABASE_URL")
    if not raw:
        pytest.skip("Set TEST_DATABASE_URL to run PostgreSQL integration tests")
    url = make_url(raw)
    development = os.getenv("DATABASE_URL")
    if (
        url.drivername != "postgresql+psycopg"
        or not url.database
        or not url.database.endswith("_test")
        or (development and url.database == make_url(development).database)
    ):
        pytest.fail("TEST_DATABASE_URL must use a distinct PostgreSQL database ending in _test")
    environment = os.environ.copy()
    environment.update(DATABASE_URL=raw, APP_ENV="test")
    for command in (["upgrade", "head"], ["check"]):
        subprocess.run(
            [sys.executable, "-m", "alembic", *command],
            cwd=Path(__file__).resolve().parents[1],
            env=environment,
            check=True,
            capture_output=True,
            text=True,
        )
    return raw


@pytest.fixture
def operations_session(operations_database_url: str) -> Iterator[Session]:
    settings = Settings(_env_file=None, database_url=operations_database_url, app_env="test")
    engine = build_engine(settings)
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                with Session(
                    bind=connection,
                    join_transaction_mode="create_savepoint",
                    expire_on_commit=False,
                ) as session:
                    yield session
            finally:
                transaction.rollback()
    finally:
        engine.dispose()


@pytest.fixture
def request_and_evidence(
    operations_session: Session,
) -> tuple[PresentationRequest, PresentationImportRow]:
    batch = PresentationImportBatch(
        source_key=f"fictional-operations-{uuid4()}", file_sha256="a" * 64, row_count=1
    )
    request = PresentationRequest(source="manual", form_version="legacy_v1", status="completed")
    operations_session.add_all([batch, request])
    operations_session.flush()
    evidence = PresentationImportRow(
        batch_id=batch.id,
        source_filename="fictional.csv",
        source_record_number=3,
        row_sha256="b" * 64,
        original_headers=["", "Price", "Price"],
        original_cells=["", "100.00", ""],
        normalized_fields={"quoted_amount": "100.00"},
        request_id=request.id,
        status_basis="user_assumption",
    )
    operations_session.add(evidence)
    operations_session.flush()
    return request, evidence


def test_assumed_paid_preserves_missing_receipt_and_positional_source(
    operations_session: Session,
    request_and_evidence: tuple[PresentationRequest, PresentationImportRow],
) -> None:
    request, evidence = request_and_evidence
    operations_session.add(
        PresentationOperations(
            request_id=request.id,
            import_row_id=evidence.id,
            quoted_amount=Decimal("100.00"),
            recorded_received_amount=None,
            payment_status="paid",
            payment_basis="user_assumption",
            engagement_type="paid",
            engagement_basis="user_assumption",
            status_basis="user_assumption",
        )
    )
    operations_session.flush()
    operations_session.expire_all()
    stored = operations_session.get(PresentationOperations, request.id)
    assert stored is not None
    assert stored.payment_status == "paid"
    assert stored.recorded_received_amount is None
    assert stored.payment_method == "unknown"
    assert stored.quoted_amount == Decimal("100.00")
    original = operations_session.get(PresentationImportRow, evidence.id)
    assert original is not None
    assert original.original_headers == ["", "Price", "Price"]
    assert original.original_cells == ["", "100.00", ""]


def test_duplicate_evidence_record_is_rejected(
    operations_session: Session,
    request_and_evidence: tuple[PresentationRequest, PresentationImportRow],
) -> None:
    _, evidence = request_and_evidence
    with pytest.raises(IntegrityError), operations_session.begin_nested():
        operations_session.add(
            PresentationImportRow(
                batch_id=evidence.batch_id,
                source_filename="renamed.csv",
                source_record_number=evidence.source_record_number,
                row_sha256="c" * 64,
                original_headers=[],
                original_cells=[],
                normalized_fields={},
            )
        )
        operations_session.flush()


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("quoted_amount", Decimal("-0.01")),
        ("recorded_received_amount", Decimal("-0.01")),
        ("attendance_count", -1),
        ("roster_count", -1),
        ("currency", "usd"),
        ("payment_status", "made_up"),
        ("payment_basis", "guessed"),
        ("payment_method", "calpulli_internal"),
        ("engagement_type", "check"),
        ("engagement_basis", "guessed"),
        ("invoice_status", "paid"),
        ("coi_status", "paid"),
        ("status_basis", "recorded"),
    ],
)
def test_invalid_operational_values_are_rejected(
    operations_session: Session,
    request_and_evidence: tuple[PresentationRequest, PresentationImportRow],
    field: str,
    value: object,
) -> None:
    request, _ = request_and_evidence
    with pytest.raises(IntegrityError), operations_session.begin_nested():
        operations_session.add(PresentationOperations(request_id=request.id, **{field: value}))
        operations_session.flush()


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("source_record_number", 0),
        ("row_sha256", "invalid"),
        ("review_state", "made_up"),
        ("proposed_status", "paid"),
        ("status_basis", "recorded"),
        ("original_headers", {}),
        ("original_cells", {}),
        ("normalized_fields", []),
        ("rule_codes", {}),
    ],
)
def test_invalid_import_evidence_is_rejected(
    operations_session: Session,
    request_and_evidence: tuple[PresentationRequest, PresentationImportRow],
    field: str,
    value: object,
) -> None:
    _, evidence = request_and_evidence
    with pytest.raises(IntegrityError), operations_session.begin_nested():
        setattr(evidence, field, value)
        operations_session.flush()


def test_operational_tables_are_private(operations_session: Session) -> None:
    names = ("presentation_import_rows", "presentation_operations")
    roles = list(
        operations_session.scalars(
            text("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")
        )
    )
    for name in names:
        assert operations_session.scalar(
            text("SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(:table)"),
            {"table": name},
        )
        assert not operations_session.scalar(
            text(
                "SELECT EXISTS (SELECT 1 FROM pg_class c, "
                "LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a "
                "WHERE c.oid = to_regclass(:table) AND a.grantee = 0)"
            ),
            {"table": name},
        )
        for role in roles:
            assert not operations_session.scalar(
                text("SELECT has_table_privilege(:role, :table, 'SELECT,INSERT,UPDATE,DELETE')"),
                {"role": role, "table": name},
            )
        assert not operations_session.scalar(
            text(
                "SELECT EXISTS (SELECT 1 FROM pg_policies "
                "WHERE schemaname = current_schema() AND tablename = :table)"
            ),
            {"table": name},
        )


def test_primary_evidence_cannot_be_reused_for_two_requests(
    operations_session: Session,
    request_and_evidence: tuple[PresentationRequest, PresentationImportRow],
) -> None:
    request, evidence = request_and_evidence
    other = PresentationRequest(source="manual", form_version="legacy_v1", status="unknown")
    operations_session.add(other)
    operations_session.flush()
    operations_session.add(PresentationOperations(request_id=request.id, import_row_id=evidence.id))
    operations_session.flush()
    with pytest.raises(IntegrityError), operations_session.begin_nested():
        operations_session.add(
            PresentationOperations(request_id=other.id, import_row_id=evidence.id)
        )
        operations_session.flush()
    assert (
        operations_session.scalar(
            select(PresentationOperations.import_row_id).where(
                PresentationOperations.request_id == request.id
            )
        )
        == evidence.id
    )


def test_evidence_from_another_request_is_rejected(
    operations_session: Session,
    request_and_evidence: tuple[PresentationRequest, PresentationImportRow],
) -> None:
    _, evidence = request_and_evidence
    other = PresentationRequest(source="manual", form_version="legacy_v1", status="unknown")
    operations_session.add(other)
    operations_session.flush()
    with pytest.raises(IntegrityError) as error, operations_session.begin_nested():
        operations_session.add(
            PresentationOperations(request_id=other.id, import_row_id=evidence.id)
        )
        operations_session.flush()
    assert error.value.orig.diag.constraint_name == "fk_operations_request_import_row"


def test_operations_without_import_evidence_are_allowed(
    operations_session: Session,
    request_and_evidence: tuple[PresentationRequest, PresentationImportRow],
) -> None:
    request, _ = request_and_evidence
    operations_session.add(PresentationOperations(request_id=request.id))
    operations_session.flush()
    operations_session.expire_all()
    stored = operations_session.get(PresentationOperations, request.id)
    assert stored is not None
    assert stored.import_row_id is None
