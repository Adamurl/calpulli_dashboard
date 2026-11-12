from pathlib import Path
from runpy import run_path

import pytest
from fastapi.testclient import TestClient


def test_vercel_entrypoint_preserves_api_paths(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    entrypoint = Path(__file__).resolve().parents[1] / "asgi.py"
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql+psycopg://test:entrypoint_test@127.0.0.1:1/calpulli_test"
    )
    app = run_path(str(entrypoint))["app"]

    with TestClient(app) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        assert client.get("/api/v1/health/ready").status_code == 503
        assert client.get("/api/v1/presentations").status_code == 503
        assert client.get("/api/missing").status_code == 404
        assert client.get("/docs").status_code == 404
