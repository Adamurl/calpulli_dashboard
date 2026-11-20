"""Store the source booth inventory for each archived Mexica New Year season."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    table = "mny_spot_inventories"
    op.create_table(
        table,
        sa.Column("event_year", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("spots", postgresql.JSONB(), nullable=False),
        sa.CheckConstraint("event_year BETWEEN 2000 AND 9999", name="year_range"),
    )
    op.execute("ALTER TABLE mny_spot_inventories ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE mny_spot_inventories FROM PUBLIC")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                REVOKE ALL ON TABLE mny_spot_inventories FROM anon;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                REVOKE ALL ON TABLE mny_spot_inventories FROM authenticated;
            END IF;
        END $$
    """)


def downgrade() -> None:
    if op.get_bind().execute(sa.text("SELECT 1 FROM mny_spot_inventories LIMIT 1")).first():
        raise RuntimeError("Preserve spot inventory before downgrading")
    op.drop_table("mny_spot_inventories")
