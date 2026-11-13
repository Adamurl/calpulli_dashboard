from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.core.config import Settings


def build_engine(settings: Settings) -> Engine:
    if settings.app_env == "production":
        # Vercel functions use Supabase's transaction pooler; session options don't persist there.
        engine = create_engine(
            settings.database_url.get_secret_value(),
            poolclass=NullPool,
            pool_pre_ping=True,
            connect_args={
                "connect_timeout": settings.db_connect_timeout,
                "prepare_threshold": None,
            },
            hide_parameters=True,
        )

        def set_statement_timeout(connection: Connection) -> None:
            connection.exec_driver_sql(
                f"SET LOCAL statement_timeout = {settings.db_statement_timeout_ms}"
            )

        event.listen(engine, "begin", set_statement_timeout)
        return engine
    connect_args: dict[str, object] = {
        "connect_timeout": settings.db_connect_timeout,
        "options": f"-c statement_timeout={settings.db_statement_timeout_ms}",
    }
    return create_engine(
        settings.database_url.get_secret_value(),
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout,
        connect_args=connect_args,
        hide_parameters=True,
    )


def get_session(request: Request) -> Iterator[Session]:
    with request.app.state.session_factory() as session:
        yield session
