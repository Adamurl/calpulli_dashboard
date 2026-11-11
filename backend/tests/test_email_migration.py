import io

import pytest
from alembic.config import Config

from alembic import command


@pytest.mark.parametrize(
    ("direction", "revisions"),
    [("upgrade", "0003:0004"), ("downgrade", "0004:0003")],
)
def test_email_migration_drops_the_existing_activity_constraint(
    monkeypatch: pytest.MonkeyPatch, direction: str, revisions: str
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://test@localhost/calpulli_test")
    monkeypatch.setenv("APP_ENV", "test")
    output = io.StringIO()
    config = Config("alembic.ini", output_buffer=output)
    getattr(command, direction)(config, revisions, sql=True)
    assert (
        "ALTER TABLE presentation_activities DROP CONSTRAINT "
        "ck_presentation_activities_kind_allowed;"
    ) in output.getvalue()
