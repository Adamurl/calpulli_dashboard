from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_startup_and_liveness_without_database(app: FastAPI, client: TestClient) -> None:
    assert app.state.engine is not None
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    UUID(response.headers["x-request-id"])


def test_unavailable_database(client: TestClient) -> None:
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 503
    assert response.json() == {
        "error": {
            "code": "database_unavailable",
            "message": "Database unavailable",
            "request_id": response.headers["x-request-id"],
        }
    }
    assert "postgresql" not in response.text


@pytest.mark.integration
def test_available_database(database_app: FastAPI) -> None:
    with TestClient(database_app) as client:
        response = client.get("/api/v1/health/ready")
        assert response.status_code == 200
        assert response.json() == {"status": "ready"}
        assert database_app.state.engine.pool.checkedout() == 0


def test_valid_request_id_preserved(client: TestClient) -> None:
    request_id = str(uuid4())
    response = client.get("/api/v1/health", headers={"X-Request-ID": request_id})
    assert response.headers["x-request-id"] == request_id


def test_invalid_request_id_replaced(client: TestClient) -> None:
    response = client.get("/api/v1/health", headers={"X-Request-ID": "untrusted-personal-data"})
    UUID(response.headers["x-request-id"])
    assert "untrusted-personal-data" not in response.text
