"""Create the staff-only Mexica New Year application archive."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    table = "mny_vendor_applications"
    op.create_table(
        table,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("event_year", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("source_key", sa.String(), nullable=False),
        sa.Column("business_name", sa.String()),
        sa.Column("contact_name", sa.String()),
        sa.Column("email", sa.String()),
        sa.Column("phone", sa.String()),
        sa.Column("category", sa.String()),
        sa.Column("submitted_at", sa.DateTime(timezone=True)),
        sa.Column("follower_count", sa.Integer()),
        sa.Column("follower_response", sa.String()),
        sa.Column("responses", postgresql.JSONB(), nullable=False),
        sa.UniqueConstraint("event_year", "source", "source_key"),
        sa.CheckConstraint("event_year BETWEEN 2000 AND 9999", name="year_range"),
        sa.CheckConstraint("source IN ('form_csv', 'legacy_vendor')", name="source_allowed"),
        sa.CheckConstraint("follower_count >= 0", name="nonnegative_followers"),
    )
    op.create_index(
        "ix_mny_vendor_applications_year_business", table, ["event_year", "business_name", "id"]
    )
    op.execute("ALTER TABLE mny_vendor_applications ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE mny_vendor_applications FROM PUBLIC")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                REVOKE ALL ON TABLE mny_vendor_applications FROM anon;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                REVOKE ALL ON TABLE mny_vendor_applications FROM authenticated;
            END IF;
        END $$
    """)


def downgrade() -> None:
    if op.get_bind().execute(sa.text("SELECT 1 FROM mny_vendor_applications LIMIT 1")).first():
        raise RuntimeError("Preserve application records before downgrading")
    op.drop_table("mny_vendor_applications")
