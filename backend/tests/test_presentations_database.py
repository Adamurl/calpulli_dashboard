import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import build_engine, get_session
from app.main import create_app
from app.modules.presentations.models import PresentationActivity, PresentationRequest
from app.modules.presentations.schemas import NewPresentation, PresentationPatch
from app.modules.presentations.services import (
    PresentationConflict,
    create_presentation,
    list_presentations,
    update_presentation,
)

TOKEN = "fictional-integration-token-32-characters"
pytestmark = pytest.mark.integration


@pytest.fixture
def pg_session(database_url: str) -> Iterator[Session]:
    environment = os.environ.copy()
    environment.update(DATABASE_URL=database_url, APP_ENV="test")
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=Path(__file__).resolve().parents[1],
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    engine = build_engine(Settings(_env_file=None, database_url=database_url, app_env="test"))
    try:
        with engine.connect() as connection:
            outer = connection.begin()
            try:
                with Session(
                    bind=connection,
                    join_transaction_mode="create_savepoint",
                    expire_on_commit=False,
                ) as session:
                    yield session
            finally:
                outer.rollback()
    finally:
        engine.dispose()


@pytest.fixture
def payload() -> NewPresentation:
    return NewPresentation(
        event_date="2027-03-20",
        start_time="14:00",
        end_time="15:00",
        event_types=["cultural_organization"],
        event_purpose="Cultural education",
        venue_address="Fictional community center",
        estimated_guests=50,
        audience_distance_12ft="yes",
        unavailable_logistics="None",
        contact_first_name="Test",
        contact_last_name="Contact",
        contact_email="test@example.org",
        contact_phone="+1 555 0100",
    )


def test_postgres_create_replay_and_status_audit(
    pg_session: Session,
    payload: NewPresentation,
) -> None:
    record, created = create_presentation(
        pg_session, payload, source="wix", source_key="fictional-form", external_id="submission-1"
    )
    assert created
    assert record.event_date == payload.event_date
    assert record.status == "new"
    duplicate, created = create_presentation(
        pg_session, payload, source="wix", source_key="fictional-form", external_id="submission-1"
    )
    assert not created
    assert duplicate.id == record.id
    changed = payload.model_copy(update={"event_purpose": "Different content"})
    with pytest.raises(PresentationConflict):
        create_presentation(
            pg_session,
            changed,
            source="wix",
            source_key="fictional-form",
            external_id="submission-1",
        )
    updated = update_presentation(
        pg_session,
        record.id,
        PresentationPatch(
            status="reviewing", expected_current_status="new", internal_notes="Called"
        ),
    )
    assert updated.status == "reviewing"
    with pytest.raises(PresentationConflict):
        update_presentation(
            pg_session,
            record.id,
            PresentationPatch(status="booked", expected_current_status="new"),
        )
    activities = list(
        pg_session.scalars(
            select(PresentationActivity).where(PresentationActivity.request_id == record.id)
        )
    )
    assert sorted(activity.kind for activity in activities) == [
        "created",
        "email_blocked",
        "email_draft_created",
        "email_recommended",
        "note_added",
        "status_changed",
    ]
    change = next(activity for activity in activities if activity.kind == "status_changed")
    assert (change.previous_status, change.new_status) == ("new", "reviewing")
    assert pg_session.get(PresentationRequest, record.id).status == "reviewing"


def test_sparse_historical_record_and_new_record_share_api(
    database_url: str,
    pg_session: Session,
    payload: NewPresentation,
) -> None:
    legacy = PresentationRequest(
        source="legacy_csv",
        source_key="fictional-export",
        external_id="legacy-row",
        form_version="legacy_v1",
        status="unknown",
        original_fields={"Date of Event": "May 21st", "Estimated Guests": "50-80"},
    )
    pg_session.add(legacy)
    pg_session.flush()
    legacy_id = legacy.id
    create_presentation(pg_session, payload)
    records = list_presentations(
        pg_session, limit=25, offset=0, source="legacy_csv", status="unknown"
    )
    assert [record.id for record in records] == [legacy_id]
    app = create_app(
        Settings(
            _env_file=None, database_url=database_url, app_env="test", internal_api_token=TOKEN
        )
    )

    def override_session() -> Iterator[Session]:
        yield pg_session

    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {TOKEN}"}
        detail = client.get(f"/api/v1/presentations/{legacy_id}", headers=headers)
        assert detail.status_code == 200
        assert detail.json()["event_date"] is None
        assert detail.json()["contact_email"] is None
        assert detail.json()["original_fields"]["Date of Event"] == "May 21st"
        assert UUID(detail.json()["id"]) == legacy_id
        listing = client.get("/api/v1/presentations?source=legacy_csv", headers=headers)
        assert listing.status_code == 200
        assert "original_fields" not in listing.json()["items"][0]
        response = client.post(
            "/api/v1/presentations", json=payload.model_dump(mode="json"), headers=headers
        )
        assert response.status_code == 201
        assert response.json()["status"] == "new"


def test_presentation_tables_have_rls_and_no_browser_policies(pg_session: Session) -> None:
    names = [
        "alembic_version",
        "presentation_import_batches",
        "presentation_requests",
        "presentation_activities",
        "presentation_email_templates",
        "presentation_email_messages",
        "presentation_email_staff_tasks",
    ]
    for name in names:
        enabled = pg_session.scalar(
            text(
                "SELECT c.relrowsecurity FROM pg_class c "
                "JOIN pg_namespace n ON n.oid=c.relnamespace "
                "WHERE n.nspname='public' AND c.relname=:name"
            ),
            {"name": name},
        )
        assert enabled is True
        assert (
            pg_session.scalar(
                text(
                    "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=:name"
                ),
                {"name": name},
            )
            == 0
        )
        for role in ["anon", "authenticated"]:
            if pg_session.scalar(
                text("SELECT 1 FROM pg_roles WHERE rolname=:role"), {"role": role}
            ):
                assert not pg_session.scalar(
                    text("SELECT has_table_privilege(:role, :table, 'SELECT')"),
                    {"role": role, "table": f"public.{name}"},
                )
