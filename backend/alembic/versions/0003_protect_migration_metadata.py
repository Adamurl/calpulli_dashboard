"""Keep migration metadata inaccessible to Supabase browser roles."""

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE alembic_version ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE alembic_version FROM PUBLIC")
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN "
        "REVOKE ALL ON TABLE alembic_version FROM anon; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN "
        "REVOKE ALL ON TABLE alembic_version FROM authenticated; "
        "END IF; END $$"
    )


def downgrade() -> None:
    # Keep metadata private when rolling back application tables.
    pass
