import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from tests.conftest import UNAVAILABLE_URL


def test_not_found(client: TestClient) -> None:
    response = client.get("/missing?private=value")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "http_404"
    assert response.json()["error"]["request_id"] == response.headers["x-request-id"]


def test_validation_and_unexpected_error_are_sanitized(app: FastAPI) -> None:
    @app.get("/test-validation/{number}")
    def validation(number: int) -> dict[str, int]:
        return {"number": number}

    @app.get("/test-error")
    def fail() -> None:
        raise RuntimeError("private credentials")

    with TestClient(app) as client:
        invalid = client.get("/test-validation/private-data")
        assert invalid.status_code == 422
        assert invalid.json()["error"]["code"] == "validation_error"
        assert "private-data" not in invalid.text
        error = client.get("/test-error")
        assert error.status_code == 500
        assert error.json()["error"]["code"] == "internal_error"
        assert error.json()["error"]["request_id"] == error.headers["x-request-id"]
        assert "private credentials" not in error.text


def test_docs_configuration() -> None:
    app = create_app(Settings(_env_file=None, database_url=UNAVAILABLE_URL, docs_enabled=False))
    with TestClient(app) as client:
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404
    app = create_app(Settings(_env_file=None, database_url=UNAVAILABLE_URL, docs_enabled=True))
    with TestClient(app) as client:
        assert client.get("/docs").status_code == 200
        assert "/api/v1/health" in client.get("/openapi.json").json()["paths"]


def test_cors_requires_explicit_origin(client: TestClient) -> None:
    response = client.get("/api/v1/health", headers={"Origin": "https://untrusted.example"})
    assert "access-control-allow-origin" not in response.headers


def test_logs_exclude_request_data(client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    import logging

    with caplog.at_level(logging.INFO):
        client.get(
            "/missing?email=private@example.org",
            headers={"Authorization": "Bearer private-token"},
        )
    assert "private@example.org" not in caplog.text
    assert "private-token" not in caplog.text
    assert "request_completed" in caplog.text
