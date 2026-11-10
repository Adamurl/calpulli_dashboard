from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import create_app
from app.modules.presentations import services
from app.modules.presentations.schemas import NewPresentation, PresentationPatch
from tests.conftest import UNAVAILABLE_URL

TOKEN = "fictional-test-access-token-32-characters"


@pytest.fixture
def form_data() -> dict[str, object]:
    return {
        "event_date": "2027-03-20",
        "start_time": "14:00:00",
        "end_time": "15:00:00",
        "event_types": ["k12_school", "cultural_organization"],
        "event_purpose": "Cultural education",
        "venue_address": "Fictional community center",
        "estimated_guests": 50,
        "audience_distance_12ft": "unsure",
        "unavailable_logistics": "None",
        "contact_first_name": "Test",
        "contact_last_name": "Contact",
        "contact_email": "test@example.org",
        "contact_phone": "+1 555 0100",
    }


def test_new_form_keeps_required_data_and_optional_blanks(form_data: dict[str, object]) -> None:
    payload = NewPresentation.model_validate(
        {**form_data, "organization_name": "   ", "contact_first_name": " Test "}
    )
    assert payload.organization_name is None
    assert payload.contact_first_name == "Test"
    assert payload.event_timezone == "America/Los_Angeles"
    assert payload.referral_sources == []


@pytest.mark.parametrize(
    "invalid",
    [
        {"contact_email": "invalid"},
        {"estimated_guests": -1},
        {"estimated_guests": "50"},
        {"event_types": []},
        {"event_types": ["other", "other"]},
        {"event_types": ["invented"]},
        {"referral_sources": ["website", "website"]},
        {"event_purpose": "   "},
        {"event_timezone": "not/a/timezone"},
        {"start_time": "14:00:00Z"},
        {"end_time": "13:00:00"},
        {"status": "booked"},
        {"source": "legacy_csv"},
    ],
)
def test_new_form_rejects_invalid_or_server_owned_fields(
    form_data: dict[str, object], invalid: dict[str, object]
) -> None:
    with pytest.raises(ValidationError):
        NewPresentation.model_validate({**form_data, **invalid})


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"status": "booked"},
        {"expected_current_status": "new"},
        {"status": None, "internal_notes": "test"},
        {"internal_notes": None},
        {"internal_notes": "   "},
    ],
)
def test_patch_requires_explicit_valid_change(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        PresentationPatch.model_validate(payload)


def test_internal_api_denies_unconfigured_or_invalid_access() -> None:
    unconfigured = create_app(
        Settings(_env_file=None, database_url=UNAVAILABLE_URL, app_env="test")
    )
    with TestClient(unconfigured) as client:
        assert client.get("/api/v1/presentations").status_code == 503
    configured = create_app(
        Settings(
            _env_file=None, database_url=UNAVAILABLE_URL, app_env="test", internal_api_token=TOKEN
        )
    )
    with TestClient(configured) as client:
        for headers in [{}, {"Authorization": "Bearer incorrect-token"}]:
            response = client.get("/api/v1/presentations", headers=headers)
            assert response.status_code == 401
            assert response.headers["www-authenticate"] == "Bearer"
            assert TOKEN not in response.text


def test_authorized_list_filters_pagination_and_summary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def list_records(session, **kwargs):
        captured.update(kwargs)
        now = datetime.now(UTC)
        return [
            {
                "id": uuid4(),
                "source": "legacy_csv",
                "form_version": "legacy_v1",
                "status": "unknown",
                "received_at": None,
                "created_at": now,
                "updated_at": now,
                "event_date": None,
                "start_time": None,
                "end_time": None,
                "event_timezone": None,
                "organization_name": None,
                "contact_full_name": None,
                "contact_email": None,
                "event_types": [],
                "venue_address": None,
                "estimated_guests": None,
                "original_fields": {"legacy_private": "hidden"},
                "internal_notes": "hidden",
            }
        ]

    monkeypatch.setattr(services, "list_presentations", list_records)
    app = create_app(
        Settings(
            _env_file=None, database_url=UNAVAILABLE_URL, app_env="test", internal_api_token=TOKEN
        )
    )
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/presentations?limit=5&offset=10&source=legacy_csv&status=unknown",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        assert response.status_code == 200
        assert captured == {"limit": 5, "offset": 10, "source": "legacy_csv", "status": "unknown"}
        item = response.json()["items"][0]
        assert item["event_date"] is None
        assert "original_fields" not in item
        assert "internal_notes" not in item
        invalid = client.get(
            "/api/v1/presentations?limit=1000", headers={"Authorization": f"Bearer {TOKEN}"}
        )
        assert invalid.status_code == 422


def test_not_found_and_status_conflict_are_http_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    def missing(*args, **kwargs):
        raise services.PresentationNotFound

    def conflict(*args, **kwargs):
        raise services.PresentationConflict

    monkeypatch.setattr(services, "get_presentation", missing)
    monkeypatch.setattr(services, "update_presentation", conflict)
    app = create_app(
        Settings(
            _env_file=None, database_url=UNAVAILABLE_URL, app_env="test", internal_api_token=TOKEN
        )
    )
    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {TOKEN}"}
        assert client.get(f"/api/v1/presentations/{uuid4()}", headers=headers).status_code == 404
        response = client.patch(
            f"/api/v1/presentations/{uuid4()}",
            json={"status": "booked", "expected_current_status": "new"},
            headers=headers,
        )
        assert response.status_code == 409
