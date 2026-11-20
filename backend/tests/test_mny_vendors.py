import csv
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import Settings
from app.db.session import get_session
from app.imports.mny_vendors import (
    FORM_COLUMNS,
    apply_import,
    parse_followers,
    read_archive,
    read_csv,
)
from app.main import create_app
from tests.conftest import UNAVAILABLE_URL
from tests.test_presentations_database import pg_session as pg_session  # noqa: F401

API = "/api/v1/mny/vendors"


@pytest.fixture
def form_csv(tmp_path: Path) -> Path:
    path = tmp_path / "applications.csv"
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(FORM_COLUMNS)
        writer.writerow(
            [
                "11/15/2026 8:09:10",
                " test@example.org ",
                "",
                " Test Contact ",
                "(408) 555-0100",
                " Test Vendor ",
                "123 Example St",
                "",
                "Handmade goods",
                "10 x 10",
                "",
                "",
                "@test_vendor",
                "over 5k",
            ]
        )
    return path


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("1,204 followers", (1204, "exact")),
        ("2.5K", (2500, "approximate")),
        ("700+", (700, "lower_bound")),
        ("Approx. 300", (300, "approximate")),
        ("19.3", (None, None)),
        ("100 on IG, 300 on FB", (None, None)),
        ("9999999999999999", (None, None)),
        (None, (None, None)),
    ],
)
def test_parse_followers(value, expected):
    assert parse_followers(value) == expected


def test_csv_normalizes_without_erasing_original_data(form_csv):
    [record] = read_csv(form_csv, event_year=2027, timezone="America/Los_Angeles")
    assert record["event_year"] == 2027
    assert record["submitted_at"].isoformat() == "2026-11-15T08:09:10-08:00"
    assert record["business_name"] == "Test Vendor"
    assert record["email"] == "test@example.org"
    assert record["category"] is None
    assert record["phone"] == "+14085550100"
    assert record["responses"]["phone_response"] == "(408) 555-0100"
    assert record["follower_count"] == 5000
    assert record["follower_response"] == "over 5k"
    assert record["responses"]["follower_count_kind"] == "lower_bound"


def test_csv_rejects_truncated_row(form_csv):
    with form_csv.open("a", encoding="utf-8") as file:
        file.write("2026,missing columns\n")
    with pytest.raises(ValueError, match="row width"):
        read_csv(form_csv, event_year=2027, timezone="America/Los_Angeles")


def test_vendor_routes_require_staff(staff_auth):
    app = create_app(
        Settings(
            _env_file=None,
            database_url=UNAVAILABLE_URL,
            **staff_auth("vendor-test-token"),
        )
    )
    detail = API + "/00000000-0000-4000-8000-000000000001"
    with TestClient(app) as client:
        assert client.get(API, params={"event_year": 2027}).status_code == 401
        assert client.get(detail, params={"event_year": 2026}).status_code == 401
        assert (
            client.patch(
                detail, params={"event_year": 2026}, json={"staff_note": "Test"}
            ).status_code
            == 401
        )


@pytest.mark.integration
def test_vendor_filters_and_sort_apply_before_pagination(pg_session, database_url, staff_auth):
    examples = [
        ("Alpha", "form_csv", 4, {}, "applied"),
        ("Bravo", "legacy_vendor", 1, {"acceptance_email_sent": True}, "accepted"),
        ("Charlie", "legacy_vendor", 3, {"payment_status": " Paid "}, "paid"),
        (
            "Delta",
            "legacy_vendor",
            2,
            {"payment_status": "paid", "spot_numbers": ["A3"]},
            "spot_assigned",
        ),
        ("Echo", "legacy_vendor", 5, {"spot_numbers": [" "]}, "unknown"),
    ]
    assert apply_import(
        pg_session,
        [
            {
                "event_year": 2027,
                "source": source,
                "source_key": name,
                "business_name": name,
                "submitted_at": datetime(2026, 11, day, tzinfo=UTC),
                "responses": {"legacy_vendor": legacy},
            }
            for name, source, day, legacy, _ in examples
        ],
    ) == len(examples)
    app = create_app(
        Settings(_env_file=None, database_url=database_url, **staff_auth("vendor-test-token"))
    )
    app.dependency_overrides[get_session] = lambda: pg_session
    with TestClient(app) as client:
        headers = {"Authorization": "Bearer vendor-test-token"}

        def listed(**params):
            response = client.get(API, params={"event_year": 2027, **params}, headers=headers)
            assert response.status_code == 200
            return response.json()

        assert [item["stage"] for item in listed()["items"]] == [row[-1] for row in examples]
        assert [item["business_name"] for item in listed(stage="paid", limit=1)["items"]] == [
            "Charlie"
        ]
        assert listed(stage="accepted", q="Charlie")["total"] == 0
        assert (
            listed(sort="received", direction="desc", offset=1, limit=1)["items"][0][
                "business_name"
            ]
            == "Alpha"
        )
        stage_page = listed(sort="stage", direction="desc", limit=2)
        assert stage_page["total"] == len(examples)
        assert [item["business_name"] for item in stage_page["items"]] == ["Delta", "Charlie"]


@pytest.mark.integration
def test_staff_can_edit_a_vendor_without_changing_imported_responses(
    form_csv, pg_session, database_url, staff_auth
):
    [vendor] = read_csv(form_csv, event_year=2027, timezone="America/Los_Angeles")
    neighbor = {**vendor, "source_key": "neighbor", "business_name": "Zebra Craft"}
    assert apply_import(pg_session, [vendor, neighbor]) == 2
    app = create_app(
        Settings(_env_file=None, database_url=database_url, **staff_auth("vendor-test-token"))
    )

    def request_session():
        try:
            yield pg_session
        finally:
            pg_session.rollback()

    app.dependency_overrides[get_session] = request_session
    headers = {"Authorization": "Bearer vendor-test-token"}
    params = {"event_year": 2027}
    with TestClient(app) as client:
        first, second = client.get(API, params=params, headers=headers).json()["items"]
        url = f"{API}/{first['id']}"
        assert (
            client.patch(
                url, params=params, headers=headers, json={"assigned_spot_labels": []}
            ).status_code
            == 422
        )
        assert (
            client.patch(
                url,
                params={"event_year": 2026},
                headers=headers,
                json={"staff_note": "Wrong year"},
            ).status_code
            == 404
        )
        updated = client.patch(
            url,
            params=params,
            headers=headers,
            json={"business_name": "Edited Vendor", "requested_space": "10 x 20"},
        )
        assert updated.status_code == 200
        assert updated.json()["next_id"] == second["id"]
        assert updated.json()["previous_id"] is None
        assert (
            client.patch(
                url, params=params, headers=headers, json={"staff_note": "  Call back.  "}
            ).status_code
            == 200
        )
        saved = client.get(url, params=params, headers=headers).json()
        assert saved["business_name"] == "Edited Vendor"
        assert saved["responses"]["booth_size_requested"] == "10 x 10"
        assert saved["responses"]["staff_details"] == {
            "requested_space": "10 x 20",
            "staff_note": "Call back.",
        }


@pytest.mark.integration
def test_vendor_seasons_import_and_staff_reads(form_csv, pg_session, database_url, staff_auth):
    records = read_csv(form_csv, event_year=2027, timezone="America/Los_Angeles")
    historical = {
        "event_year": 2026,
        "source": "legacy_vendor",
        "source_key": "test-legacy-vendor",
        "business_name": "Test Vendor",
        "responses": {"legacy_vendor": {"spot_numbers": ["f2"], "payment_status": "paid"}},
    }
    assert apply_import(pg_session, [*records, historical]) == 2
    assert apply_import(pg_session, [*records, historical]) == 0
    rls = pg_session.scalar(
        text("SELECT relrowsecurity FROM pg_class WHERE oid = 'mny_vendor_applications'::regclass")
    )
    assert rls

    app = create_app(
        Settings(
            _env_file=None,
            app_env="test",
            database_url=database_url,
            **staff_auth("vendor-test-token"),
        )
    )
    app.dependency_overrides[get_session] = lambda: pg_session
    headers = {"Authorization": "Bearer vendor-test-token"}
    with TestClient(app) as client:
        assert client.get(API, headers=headers).status_code == 422
        current = client.get(API, params={"event_year": 2027}, headers=headers)
        assert current.status_code == 200
        [summary] = current.json()["items"]
        assert "email" not in summary
        assert summary["follower_count"] == 5000
        detail_url = f"{API}/{summary['id']}"
        assert (
            client.get(detail_url, params={"event_year": 2026}, headers=headers).status_code == 404
        )
        detail = client.get(detail_url, params={"event_year": 2027}, headers=headers).json()
        assert detail["email"] == "test@example.org"

        archived = client.get(API, params={"event_year": 2026}, headers=headers).json()["items"]
        [old] = archived
        detail = client.get(
            f"{API}/{old['id']}", params={"event_year": 2026}, headers=headers
        ).json()
        assert detail["responses"]["legacy_vendor"]["spot_numbers"] == ["f2"]


@pytest.mark.integration
def test_archive_preserves_legacy_spots_and_outcomes(pg_session):
    connection = pg_session.connection()
    connection.execute(
        text("""
        CREATE TABLE public.vendors (
            id int PRIMARY KEY, business_name text, vendor_type text,
            spot_numbers text[], payment_status text
        )
    """)
    )
    connection.execute(
        text("CREATE TABLE public.spots (id int PRIMARY KEY, label text, status text)")
    )
    connection.execute(text("CREATE TABLE public.vendor_spots (vendor_id int, spot_id int)"))
    connection.execute(
        text("""
        INSERT INTO public.vendors VALUES (1, 'Test Shop', 'FOOD', ARRAY['f1'], 'paid');
        INSERT INTO public.spots VALUES (2, 'f2', 'reserved');
        INSERT INTO public.vendor_spots VALUES (1, 2)
    """)
    )

    [archived] = read_archive(connection)
    assert archived["event_year"] == 2026
    assert archived["category"] == "FOOD"
    assert archived["responses"]["legacy_vendor"]["payment_status"] == "paid"
    assert archived["responses"]["legacy_vendor"]["spot_numbers"] == ["f1"]
    assert archived["responses"]["linked_spots"][0]["spot"]["label"] == "f2"


@pytest.mark.integration
def test_vendor_statistics_cover_year_and_table_search_is_paginated(
    form_csv, pg_session, database_url, staff_auth
):
    historical = [
        {
            "event_year": 2026,
            "source": "legacy_vendor",
            "source_key": "first",
            "business_name": "First 100% Crafts",
            "contact_name": "Drew",
            "responses": {
                "legacy_vendor": {
                    "requested_spot_count": 4,
                    "spot_numbers": [14, "f14"],
                    "paid_before_deadline": False,
                    "amount_paid": "125.50",
                },
                "linked_spots": [{"spot": {"label": "f2"}}],
            },
        },
        {
            "event_year": 2026,
            "source": "legacy_vendor",
            "source_key": "second",
            "business_name": "Second Crafts",
            "contact_name": "Cameron",
            "responses": {
                "legacy_vendor": {"amount_paid": 0},
                "linked_spots": [{"spot": {"label": "f3"}}],
            },
        },
    ]
    current = read_csv(form_csv, event_year=2027, timezone="America/Los_Angeles")
    assert apply_import(pg_session, [*historical, *current]) == 3
    app = create_app(
        Settings(_env_file=None, database_url=database_url, **staff_auth("vendor-test-token"))
    )
    app.dependency_overrides[get_session] = lambda: pg_session
    headers = {"Authorization": "Bearer vendor-test-token"}
    with TestClient(app) as client:
        stats_url = f"{API}/statistics"
        assert client.get(stats_url, params={"event_year": 2026}).status_code == 401
        page = client.get(API, params={"event_year": 2026, "limit": 1}, headers=headers).json()
        assert page["total"] == 2
        [vendor] = page["items"]
        assert vendor["contact_name"] == "Drew"
        assert vendor["requested_spot_count"] == 4
        assert vendor["assigned_spot_labels"] == ["14", "f14"]
        assert vendor["paid_before_deadline"] is False
        found = client.get(API, params={"event_year": 2026, "q": "CAMERON"}, headers=headers)
        assert found.json()["items"][0]["assigned_spot_labels"] == ["f3"]
        literal = client.get(API, params={"event_year": 2026, "q": "%"}, headers=headers)
        assert literal.json()["total"] == 1
        stats = client.get(stats_url, params={"event_year": 2026}, headers=headers)
        assert stats.json() == {
            "total_vendors": 2,
            "total_paid": 125.5,
            "requested_spots": 5,
            "assigned_spots": 3,
        }
        stats = client.get(stats_url, params={"event_year": 2027}, headers=headers)
        assert stats.json() == {
            "total_vendors": 1,
            "total_paid": None,
            "requested_spots": None,
            "assigned_spots": None,
        }
