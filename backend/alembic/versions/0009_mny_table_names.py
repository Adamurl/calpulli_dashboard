"""Name the canonical MNY tables and backfill season-scoped booth assignments."""

import sqlalchemy as sa

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("mny_vendor_applications", "mny_vendors")
    for prefix, suffix in (
        ("pk", ""),
        ("uq", "_event_year"),
        ("ck", "_year_range"),
        ("ck", "_source_allowed"),
        ("ck", "_nonnegative_followers"),
    ):
        op.execute(
            f"ALTER TABLE mny_vendors RENAME CONSTRAINT "
            f"{prefix}_mny_vendor_applications{suffix} TO {prefix}_mny_vendors{suffix}"
        )
    op.execute(
        "ALTER INDEX ix_mny_vendor_applications_year_business "
        "RENAME TO ix_mny_vendors_year_business"
    )
    op.create_unique_constraint("uq_mny_vendors_event_year_id", "mny_vendors", ["event_year", "id"])
    op.create_table(
        "mny_spots",
        sa.Column("event_year", sa.Integer(), primary_key=True),
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("label", sa.String()),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("price", sa.Float()),
        sa.CheckConstraint("event_year BETWEEN 2000 AND 9999", name="year_range"),
    )
    op.create_table(
        "mny_vendor_spots",
        sa.Column("event_year", sa.Integer(), primary_key=True),
        sa.Column("spot_id", sa.String(), primary_key=True),
        sa.Column("vendor_id", sa.Uuid(), primary_key=True),
        sa.ForeignKeyConstraint(
            ["event_year", "spot_id"], ["mny_spots.event_year", "mny_spots.id"]
        ),
        sa.ForeignKeyConstraint(
            ["event_year", "vendor_id"], ["mny_vendors.event_year", "mny_vendors.id"]
        ),
    )
    op.execute("""
        INSERT INTO mny_spots (event_year, id, label, status, price)
        SELECT inventory.event_year, spot.id, spot.label, spot.status, spot.price
        FROM mny_spot_inventories AS inventory
        CROSS JOIN LATERAL jsonb_to_recordset(inventory.spots)
            AS spot(id text, label text, status text, price double precision)
    """)
    op.execute("""
        INSERT INTO mny_vendor_spots (event_year, spot_id, vendor_id)
        SELECT DISTINCT inventory.event_year, spot.id, vendor.id
        FROM mny_spot_inventories AS inventory
        CROSS JOIN LATERAL jsonb_to_recordset(inventory.spots)
            AS spot(id text, vendor_source_keys jsonb)
        CROSS JOIN LATERAL jsonb_array_elements_text(spot.vendor_source_keys) AS legacy(source_key)
        JOIN mny_vendors AS vendor
            ON vendor.event_year = inventory.event_year
            AND vendor.source = 'legacy_vendor'
            AND vendor.source_key = legacy.source_key
    """)
    for table in ("mny_spots", "mny_vendor_spots"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE VIEW mny_vendor_applications WITH (security_invoker = true) AS
        SELECT id, event_year, source, source_key, business_name, contact_name, email, phone,
               category, submitted_at, follower_count, follower_response, responses
        FROM mny_vendors
    """)
    op.execute("REVOKE ALL ON mny_spots, mny_vendor_spots, mny_vendor_applications FROM PUBLIC")
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                REVOKE ALL ON mny_spots, mny_vendor_spots, mny_vendor_applications FROM anon;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                REVOKE ALL ON mny_spots, mny_vendor_spots, mny_vendor_applications
                FROM authenticated;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                REVOKE ALL ON mny_vendor_applications FROM service_role;
                IF has_table_privilege('service_role', 'mny_vendors', 'SELECT') THEN
                    GRANT SELECT ON mny_vendor_applications TO service_role;
                END IF;
            END IF;
        END
        $$
    """)


def downgrade() -> None:
    raise RuntimeError("Revision 0009 is forward-only to preserve canonical booth assignments")
