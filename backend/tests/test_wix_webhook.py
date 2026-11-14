import json
import logging
from collections.abc import Iterator
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.logging import JsonFormatter
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
    monkeypatch.setattr(wix, "dispatch_automatic", lambda *args: None)
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


def test_validation_logs_identify_fields_without_exposing_answers(
    webhook_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    payload = fields()
    del payload["end_time"]
    payload["estimated_guests"] = "private-guest-answer"
    payload["event_types"] = ["private-event-answer"]
    payload["contact_email"] = "private-invalid-email"
    payload["event_timezone"] = "private-invalid-timezone"
    payload["private-unknown-key"] = "private-extra-answer"
    with caplog.at_level(logging.WARNING, logger="calpulli.wix"):
        response = webhook_client.post(
            "/api/v1/integrations/wix/presentations",
            json={"data": payload},
            headers={"Authorization": "Bearer private-header"},
        )
    assert response.status_code == 422
    entries = [
        json.loads(JsonFormatter().format(r)) for r in caplog.records if r.name == "calpulli.wix"
    ]
    assert len(entries) == 1
    entry = entries[0]
    assert entry["event"] == "wix_webhook_rejected"
    assert entry["webhook_reason"] == "invalid_submission"
    assert entry["request_id"] == response.json()["error"]["request_id"]
    assert entry["request_id"] == response.headers["x-request-id"]
    assert entry["status_code"] == 422
    assert {"field": "data.end_time", "code": "missing"} in entry["validation_errors"]
    assert {"field": "data.estimated_guests", "code": "int_type"} in entry["validation_errors"]
    assert {"field": "data.event_types", "code": "literal_error"} in entry["validation_errors"]
    assert {"field": "data.<unknown>", "code": "extra_forbidden"} in entry["validation_errors"]
    assert entry["validation_error_count"] == 6
    serialized = json.dumps(entry) + response.text
    for secret in [
        TEST_SECRET,
        "private-",
        "sample@example.org",
        "fictional-submission",
        "fictional-form",
    ]:
        assert secret not in serialized


def test_validation_logs_are_bounded_and_unknown_keys_are_redacted(
    webhook_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    payload = fields() | {f"private-key-{i}": "private-value" for i in range(100)}
    with caplog.at_level(logging.WARNING, logger="calpulli.wix"):
        response = webhook_client.post(
            "/api/v1/integrations/wix/presentations", json={"data": payload}
        )
    assert response.status_code == 422
    record = next(r for r in caplog.records if r.name == "calpulli.wix")
    entry = json.loads(JsonFormatter().format(record))
    assert entry["validation_error_count"] == 100
    assert len(entry["validation_errors"]) == wix.MAX_LOGGED_ERRORS
    assert "private-" not in JsonFormatter().format(record)


@pytest.mark.parametrize(
    ("body", "status", "reason"),
    [
        (b"{", 400, "invalid_json"),
        (b'{"data": []}', 422, "expected_data_object"),
        (b'{"data": {"webhook_token": "private-wrong-token"}}', 401, "invalid_webhook_token"),
    ],
)
def test_rejection_logs_are_safe_and_correlated(
    webhook_client: TestClient,
    caplog: pytest.LogCaptureFixture,
    body: bytes,
    status: int,
    reason: str,
) -> None:
    with caplog.at_level(logging.WARNING, logger="calpulli.wix"):
        response = webhook_client.post("/api/v1/integrations/wix/presentations", content=body)
    assert response.status_code == status
    entry = json.loads(
        JsonFormatter().format(next(r for r in caplog.records if r.name == "calpulli.wix"))
    )
    assert entry["webhook_reason"] == reason
    assert entry["request_id"] == response.headers["x-request-id"]
    assert "validation_errors" not in entry
    assert "private-wrong-token" not in json.dumps(entry)


def test_model_validation_log_does_not_include_exception_context(
    webhook_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    payload = fields() | {"end_time": "13:00"}
    with caplog.at_level(logging.WARNING, logger="calpulli.wix"):
        response = webhook_client.post(
            "/api/v1/integrations/wix/presentations", json={"data": payload}
        )
    assert response.status_code == 422
    record = next(r for r in caplog.records if r.name == "calpulli.wix")
    entry = json.loads(JsonFormatter().format(record))
    assert entry["validation_errors"] == [{"field": "data.<model>", "code": "value_error"}]
    assert "13:00" not in json.dumps(entry)
