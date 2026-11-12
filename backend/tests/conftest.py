import os
from collections.abc import Callable, Iterator
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

from app.core.config import Settings
from app.integrations.supabase_auth import AuthenticatedUser, InvalidAccessToken
from app.main import create_app

UNAVAILABLE_URL = "postgresql+psycopg://test@127.0.0.1:1/calpulli_test"
STAFF_ID = UUID("11111111-1111-4111-8111-111111111111")


@pytest.fixture
def staff_auth(monkeypatch: pytest.MonkeyPatch) -> Callable[[str], dict[str, object]]:
    def configure(token: str) -> dict[str, object]:
        def verify(client, *, url, publishable_key, access_token):
            if access_token != token:
                raise InvalidAccessToken
            return AuthenticatedUser(id=STAFF_ID)

        monkeypatch.setattr("app.core.security.verify_user", verify)
        return {
            "supabase_url": "https://auth.example.org",
            "supabase_publishable_key": "fictional-publishable-key",
            "staff_user_ids": [STAFF_ID],
        }

    return configure


@pytest.fixture(autouse=True)
def clean_settings_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for field in Settings.model_fields:
        if field != "database_url":
            monkeypatch.delenv(field.upper(), raising=False)


@pytest.fixture
def app() -> FastAPI:
    return create_app(Settings(_env_file=None, database_url=UNAVAILABLE_URL, app_env="test"))


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


@pytest.fixture
def database_url() -> str:
    raw = os.getenv("TEST_DATABASE_URL")
    if not raw:
        pytest.skip("Set TEST_DATABASE_URL to run PostgreSQL integration tests")
    url = make_url(raw)
    development = os.getenv("DATABASE_URL")
    if (
        url.drivername != "postgresql+psycopg"
        or not url.database
        or not url.database.endswith("_test")
        or (development and url.database == make_url(development).database)
    ):
        pytest.fail("TEST_DATABASE_URL must use a distinct PostgreSQL database ending in _test")
    return raw


@pytest.fixture
def database_app(database_url: str) -> FastAPI:
    # No schema changes or destructive cleanup. Each request closes and rolls back its session.
    return create_app(Settings(_env_file=None, database_url=database_url, app_env="test"))
