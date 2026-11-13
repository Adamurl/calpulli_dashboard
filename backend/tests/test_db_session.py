from sqlalchemy.pool import NullPool

from app.core.config import Settings
from app.db import session as db_session

DATABASE_URL = "postgresql+psycopg://app:fictional-password@db.example.org:5432/app"


def test_production_engine_avoids_process_local_pool_and_prepared_statements(monkeypatch):
    captured = {}
    listener = {}

    def create_engine(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(db_session, "create_engine", create_engine)
    monkeypatch.setattr(db_session.event, "listen", lambda *args: listener.update(args=args))
    settings = Settings(_env_file=None, database_url=DATABASE_URL, app_env="production")

    db_session.build_engine(settings)

    assert captured["poolclass"] is NullPool
    assert captured["connect_args"]["prepare_threshold"] is None
    assert "options" not in captured["connect_args"]
    assert "pool_size" not in captured
    assert "max_overflow" not in captured
    assert listener["args"][1] == "begin"

    statements = []

    class Connection:
        def exec_driver_sql(self, statement):
            statements.append(statement)

    listener["args"][2](Connection())
    assert statements == ["SET LOCAL statement_timeout = 3000"]


def test_nonproduction_engine_keeps_configured_pool(monkeypatch):
    captured = {}

    def create_engine(url, **kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(db_session, "create_engine", create_engine)
    settings = Settings(
        _env_file=None,
        database_url=DATABASE_URL,
        db_pool_size=2,
        db_max_overflow=3,
        db_pool_timeout=7,
    )

    db_session.build_engine(settings)

    assert captured["pool_size"] == 2
    assert captured["max_overflow"] == 3
    assert captured["pool_timeout"] == 7
    assert "prepare_threshold" not in captured["connect_args"]


def test_production_engine_constructs_without_opening_a_connection():
    settings = Settings(_env_file=None, database_url=DATABASE_URL, app_env="production")

    engine = db_session.build_engine(settings)
    try:
        assert isinstance(engine.pool, NullPool)
    finally:
        engine.dispose()
