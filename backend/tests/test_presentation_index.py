from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.dialects import postgresql

from app.core.config import Settings
from app.main import create_app
from app.modules.presentations import index_service
from app.modules.presentations.index_schemas import PresentationIndex, PresentationStatistics
from app.modules.presentations.models import PresentationRequest
from tests.conftest import UNAVAILABLE_URL
from tests.test_operations_service import session as session
from tests.test_presentations_database import pg_session as pg_session


def test_index_pages_by_receipt_with_unknown_dates_last_and_projects_only_summary(session):
    now = datetime(2026, 11, 11, 18, tzinfo=UTC)
    records = [
        PresentationRequest(
            id=uuid4(),
            source="manual",
            form_version="legacy_v1",
            status="unknown",
            organization_name="Fictional index school",
            received_at=received,
            created_at=created,
            event_date=event_date,
            original_fields={"private_answer": "Retained only in details"},
        )
        for received, created, event_date in [
            (now, now - timedelta(days=5), date(2026, 1, 1)),
            (now - timedelta(days=1), now, date(2027, 12, 1)),
            (None, now + timedelta(days=1), date(2028, 1, 1)),
        ]
    ]
    session.add_all(records)
    session.commit()
    statements = []

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(session.bind, "before_cursor_execute", capture)
    try:
        page = index_service.read_index(
            session, limit=1, offset=0, q="", status=None, sort="received_desc"
        )
        assert page.items[0].id == records[0].id
        assert page.total == page.total_all == 3
        assert len(statements) == 2
        assert "original_fields" not in statements[-1]
        assert "internal_notes" not in statements[-1]
        assert "original_fields" not in page.model_dump()["items"][0]
    finally:
        event.remove(session.bind, "before_cursor_execute", capture)
    older = index_service.read_index(
        session, limit=1, offset=1, q="", status=None, sort="received_desc"
    )
    assert older.items[0].id == records[1].id
    ascending = index_service.read_index(
        session, limit=100, offset=0, q="", status=None, sort="received_asc"
    )
    assert [item.id for item in ascending.items] == [records[1].id, records[0].id, records[2].id]


def test_index_search_treats_wildcards_literally_and_filters_before_paging(session):
    session.add_all(
        [
            PresentationRequest(
                source="manual",
                form_version="legacy_v1",
                status=status,
                organization_name=name,
            )
            for name, status in [
                ("100%_School", "booked"),
                ("1000 School", "booked"),
                ("100%_School", "reviewing"),
            ]
        ]
    )
    session.commit()
    page = index_service.read_index(
        session, limit=1, offset=0, q=" %_sChOoL ", status="booked", sort="received_desc"
    )
    assert page.total == 1
    assert page.total_all == 3
    assert page.items[0].organization_name == "100%_School"
    assert page.items[0].status == "booked"
    empty = index_service.read_index(
        session, limit=1, offset=1, q="%_School", status="booked", sort="received_desc"
    )
    assert empty.total == 1
    assert empty.items == []


def test_statistics_uses_bounded_la_calendar_aggregation_and_current_status_cohorts():
    queries = []

    class Rows:
        def execute(self, query):
            queries.append(query)
            return [
                (date(2026, 10, 31), "new", 2),
                (date(2026, 11, 1), "booked", 3),
                (date(2026, 11, 1), "unknown", 4),
            ]

    result = index_service.read_statistics(Rows(), days=1, today=date(2026, 11, 1))
    by_key = {metric.key: metric for metric in result.metrics}
    assert by_key["presentations"].current == [7]
    assert by_key["presentations"].previous == [2]
    assert by_key["booked"].current == [3]
    assert by_key["reviewing"].current == [0]
    assert result.start_date == result.end_date == date(2026, 11, 1)
    compiled = queries[0].compile(dialect=postgresql.dialect())
    boundaries = [value for value in compiled.params.values() if isinstance(value, datetime)]
    assert len(boundaries) == 2
    lower, upper = sorted(boundaries)
    assert upper.astimezone(UTC) - lower.astimezone(UTC) == timedelta(hours=49)
    assert "GROUP BY" in str(compiled)
    assert "original_fields" not in str(compiled)


def test_index_and_statistics_have_separate_authenticated_contracts(staff_auth, monkeypatch):
    calls = []

    def index(session, **kwargs):
        calls.append(("index", kwargs))
        return PresentationIndex(items=[], limit=10, offset=0, total=0, total_all=0)

    def statistics(session, **kwargs):
        calls.append(("statistics", kwargs))
        return PresentationStatistics(
            days=kwargs["days"],
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 1),
            metrics=[],
        )

    monkeypatch.setattr(index_service, "read_index", index)
    monkeypatch.setattr(index_service, "read_statistics", statistics)
    token = "fictional-index-token"
    app = create_app(
        Settings(_env_file=None, database_url=UNAVAILABLE_URL, app_env="test", **staff_auth(token))
    )
    with TestClient(app) as client:
        assert client.get("/api/v1/presentations/index").status_code == 401
        assert client.get("/api/v1/presentations/statistics").status_code == 401
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/v1/presentations/index", headers=headers)
        assert response.status_code == 200
        assert response.json()["total"] == 0
        assert response.headers["cache-control"] == "private, no-store"
        assert (
            client.get("/api/v1/presentations/statistics?days=7", headers=headers).status_code
            == 200
        )
        assert calls == [
            (
                "index",
                dict(limit=10, offset=0, q="", status=None, sort="received_desc"),
            ),
            ("statistics", {"days": 7}),
        ]
        for path in [
            "/index?sort=event_date",
            "/index?limit=101",
            "/index?offset=-1",
            "/index?q=" + "a" * 201,
            "/statistics?days=2",
            "/statistics?days=0",
            "/statistics?days=31",
        ]:
            assert client.get("/api/v1/presentations" + path, headers=headers).status_code == 422
        assert len(calls) == 2


@pytest.mark.integration
def test_postgres_statistics_handles_la_midnight_and_excludes_missing_dates(pg_session):
    today = date(2026, 11, 11)
    rows = [
        PresentationRequest(
            source="manual",
            form_version="legacy_v1",
            status="booked",
            received_at=datetime.fromisoformat(stamp) if stamp else None,
        )
        for stamp in [
            "2026-11-11T07:59:59+00:00",
            "2026-11-11T08:00:00+00:00",
            "2026-11-12T07:59:59+00:00",
            "2026-11-12T08:00:00+00:00",
            None,
        ]
    ]
    pg_session.add_all(rows)
    pg_session.commit()
    result = index_service.read_statistics(pg_session, days=1, today=today)
    booked = next(metric for metric in result.metrics if metric.key == "booked")
    assert booked.current == [2]
    assert booked.previous == [1]
