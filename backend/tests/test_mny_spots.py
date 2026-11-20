import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.core.config import Settings
from app.db.session import get_session
from app.imports.mny_vendors import apply_import, read_archive, read_spot_inventory
from app.main import create_app
from app.modules.mny.models import VendorApplication
from tests.conftest import UNAVAILABLE_URL
from tests.test_presentations_database import pg_session as pg_session  # noqa: F401

API = "/api/v1/mny/spots"


def test_spot_inventory_requires_staff(staff_auth):
    app = create_app(
        Settings(
            _env_file=None,
            database_url=UNAVAILABLE_URL,
            **staff_auth("spot-test-token"),
        )
    )
    with TestClient(app) as client:
        assert client.get(API, params={"event_year": 2026}).status_code == 401


@pytest.mark.integration
def test_spot_inventory_backfill_preserves_free_booths_and_vendor_links(
    pg_session, database_url: str, staff_auth
):
    pg_session.execute(
        text("""
        CREATE TABLE public.vendors (id int PRIMARY KEY, business_name text, vendor_type text);
        CREATE TABLE public.spots (id int PRIMARY KEY, label text, status text, price numeric);
        CREATE TABLE public.vendor_spots (vendor_id int, spot_id int);
        INSERT INTO public.vendors VALUES (1, 'Test Food', 'FOOD'), (2, 'Test Art', 'CRAFT');
        INSERT INTO public.spots VALUES
            (44, 'f14', 'reserved', 70.50), (45, '7', NULL, NULL), (46, NULL, NULL, NULL);
        INSERT INTO public.vendor_spots VALUES (1, 44), (2, 44);
    """)
    )
    records = read_archive(pg_session.connection())
    spots = read_spot_inventory(pg_session.connection())
    pg_session.commit()

    assert apply_import(pg_session, records) == 2
    assert apply_import(pg_session, records, legacy_spots=spots) == 0
    assert apply_import(pg_session, records, legacy_spots=[]) == 0

    vendor_ids = {
        name: str(vendor_id)
        for name, vendor_id in pg_session.execute(
            select(VendorApplication.business_name, VendorApplication.id).where(
                VendorApplication.event_year == 2026
            )
        )
    }
    for table in ("mny_spots", "mny_vendor_spots"):
        assert pg_session.scalar(
            text("SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(:name)"),
            {"name": table},
        )

    app = create_app(
        Settings(
            _env_file=None,
            app_env="test",
            database_url=database_url,
            **staff_auth("spot-test-token"),
        )
    )
    app.dependency_overrides[get_session] = lambda: pg_session
    headers = {"Authorization": "Bearer spot-test-token"}
    with TestClient(app) as client:
        response = client.get(API, params={"event_year": 2026}, headers=headers)
        assert response.status_code == 200
        assert response.json() == {
            "event_year": 2026,
            "inventory_available": True,
            "spots": [
                {"id": "45", "label": "7", "status": "free", "price": None, "vendors": []},
                {
                    "id": "44",
                    "label": "f14",
                    "status": "reserved",
                    "price": 70.50,
                    "vendors": [
                        {
                            "id": vendor_ids["Test Food"],
                            "business_name": "Test Food",
                            "category": "FOOD",
                        },
                        {
                            "id": vendor_ids["Test Art"],
                            "business_name": "Test Art",
                            "category": "CRAFT",
                        },
                    ],
                },
                {"id": "46", "label": None, "status": "free", "price": None, "vendors": []},
            ],
        }
        response = client.get(API, params={"event_year": 2027}, headers=headers)
        assert response.status_code == 200
        assert response.json() == {"event_year": 2027, "inventory_available": False, "spots": []}
