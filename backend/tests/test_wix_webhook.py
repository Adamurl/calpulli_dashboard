from collections.abc import Iterator
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.integrations import wix
from app.main import create_app
from app.modules.presentations.services import PresentationConflict
from tests.conftest import UNAVAILABLE_URL

TEST_SECRET = "fictional-webhook-test-token-1234567890"


def fields() -> dict:
    return {
        "webhook_token": TEST_SECRET,
        "form_id": "fictional-form",
        "submission_id": "fictional-submission",
        "event_date": "2027-03-20",
        "start_time": "14:00",
        "end_time": "15:00",
        "event_types": ["cultural_organization"],
        "event_purpose": "Fictional cultural education event",
        "venue_address": "Fictional venue, San Jose, CA",
        "estimated_guests": 100,
        "audience_distance_12ft": "yes",
        "unavailable_logistics": "None",
        "contact_first_name": "Sample",
        "contact_last_name": "Coordinator",
        "contact_email": "sample@example.org",
        "contact_phone": "+1 555 010 0200",
    }


@pytest.fixture
def webhook_app() -> FastAPI:
    return create_app(
        Settings(
            _env_file=None,
            database_url=UNAVAILABLE_URL,
            app_env="test",
            wix_webhook_token=TEST_SECRET,
            wix_form_id="fictional-form",
        )
    )


@pytest.fixture
def webhook_client(webhook_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(webhook_app) as client:
        yield client


def test_webhook_unconfigured_is_disabled(client: TestClient) -> None:
    response = client.post("/api/v1/integrations/wix/presentations", json={"data": fields()})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "http_503"


def test_webhook_authentication(webhook_client: TestClient) -> None:
    payload = fields()
    payload["webhook_token"] = "wrong"
    response = webhook_client.post("/api/v1/integrations/wix/presentations", json={"data": payload})
    assert response.status_code == 401
    assert "wrong" not in response.text


def test_other_form_forbidden(webhook_client: TestClient) -> None:
    payload = fields()
    payload["form_id"] = "other-form"
    response = webhook_client.post("/api/v1/integrations/wix/presentations", json={"data": payload})
    assert response.status_code == 403


def test_new_and_duplicate_acknowledgements(
    webhook_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    request_id = uuid4()
    calls = []

    def store(session, submission):
        calls.append(submission)
        assert not hasattr(submission, "webhook_token")
        return request_id, len(calls) == 1

    monkeypatch.setattr(wix, "persist_submission", store)
    first = webhook_client.post("/api/v1/integrations/wix/presentations", json={"data": fields()})
    second = webhook_client.post("/api/v1/integrations/wix/presentations", json={"data": fields()})
    assert first.status_code == 201
    assert first.json() == {"id": str(request_id), "status": "created"}
    assert second.status_code == 200
    assert second.json() == {"id": str(request_id), "status": "duplicate"}
    assert "sample@example.org" not in first.text


def test_wix_conflicting_retry(webhook_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def conflict(session, submission):
        raise PresentationConflict

    monkeypatch.setattr(wix, "persist_submission", conflict)
    response = webhook_client.post(
        "/api/v1/integrations/wix/presentations", json={"data": fields()}
    )
    assert response.status_code == 409


@pytest.mark.parametrize("payload", [{}, {"data": []}, {"data": {}}])
def test_invalid_envelope(webhook_client: TestClient, payload: dict) -> None:
    response = webhook_client.post("/api/v1/integrations/wix/presentations", json=payload)
    assert response.status_code in {401, 422}


def test_oversized_body_rejected(webhook_client: TestClient) -> None:
    response = webhook_client.post(
        "/api/v1/integrations/wix/presentations", content=b"x" * (wix.MAX_BODY_BYTES + 1)
    )
    assert response.status_code == 413


def test_invalid_json_and_form_are_safe(webhook_client: TestClient) -> None:
    malformed = webhook_client.post("/api/v1/integrations/wix/presentations", content=b"{")
    assert malformed.status_code == 400
    payload = fields()
    payload["contact_email"] = "private-invalid-email"
    invalid = webhook_client.post("/api/v1/integrations/wix/presentations", json={"data": payload})
    assert invalid.status_code == 422
    assert "private-invalid-email" not in invalid.text
    assert TEST_SECRET not in invalid.text
