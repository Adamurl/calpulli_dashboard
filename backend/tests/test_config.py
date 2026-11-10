import pytest
from pydantic import ValidationError

from app.core.config import Settings
from tests.conftest import UNAVAILABLE_URL


def test_database_url_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


@pytest.mark.parametrize("url", ["sqlite:///test.db", "postgresql://localhost/test", "invalid"])
def test_database_url_validation(url: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url=url)


def test_credentials_not_in_settings_repr() -> None:
    settings = Settings(
        _env_file=None, database_url="postgresql+psycopg://user:sensitive@localhost/calpulli"
    )
    assert "sensitive" not in repr(settings)


@pytest.mark.parametrize("origin", ["*", "https://*.example.org", "https://example.org/path"])
def test_reject_unsafe_cors(origin: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url=UNAVAILABLE_URL, cors_origins=[origin])


def test_production_defaults_and_docs_opt_in() -> None:
    url = "postgresql+psycopg://user:externally-provided@localhost/calpulli"
    settings = Settings(_env_file=None, database_url=url, app_env="production")
    assert settings.expose_docs is False
    assert settings.cors_origins == []
    assert Settings(
        _env_file=None, database_url=url, app_env="production", docs_enabled=True
    ).expose_docs


def test_development_credential_rejected_in_production() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            app_env="production",
            database_url="postgresql+psycopg://user:calpulli_dev_only@localhost/calpulli",
        )


def test_pool_limits() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url=UNAVAILABLE_URL, db_pool_size=0)
