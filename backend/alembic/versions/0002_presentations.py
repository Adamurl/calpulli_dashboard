"""Store current and historical presentation requests with protected access."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "presentation_import_batches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_key", sa.String(length=200), nullable=False),
        sa.Column("file_sha256", sa.String(length=64), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("imported_count", sa.Integer(), nullable=False),
        sa.Column("skipped_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "imported_count >= 0",
            name=op.f("ck_presentation_import_batches_imported_count_nonnegative"),
        ),
        sa.CheckConstraint(
            "row_count >= 0", name=op.f("ck_presentation_import_batches_row_count_nonnegative")
        ),
        sa.CheckConstraint(
            "skipped_count >= 0",
            name=op.f("ck_presentation_import_batches_skipped_count_nonnegative"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_presentation_import_batches")),
        sa.UniqueConstraint(
            "source_key", "file_sha256", name="uq_presentation_import_batches_file"
        ),
    )
    op.create_table(
        "presentation_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("source_key", sa.String(length=200), nullable=True),
        sa.Column("external_id", sa.String(length=200), nullable=True),
        sa.Column("form_version", sa.String(length=30), nullable=False),
        sa.Column("import_batch_id", sa.Uuid(), nullable=True),
        sa.Column("source_row_number", sa.Integer(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("event_date", sa.Date(), nullable=True),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("event_timezone", sa.String(length=100), nullable=True),
        sa.Column("event_access", sa.String(length=20), nullable=True),
        sa.Column("event_setting", sa.String(length=20), nullable=True),
        sa.Column(
            "event_types",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("event_purpose", sa.Text(), nullable=True),
        sa.Column("venue_address", sa.Text(), nullable=True),
        sa.Column("estimated_guests", sa.Integer(), nullable=True),
        sa.Column("audience_distance_12ft", sa.String(length=20), nullable=True),
        sa.Column("unavailable_logistics", sa.Text(), nullable=True),
        sa.Column("organization_name", sa.Text(), nullable=True),
        sa.Column("contact_full_name", sa.Text(), nullable=True),
        sa.Column("contact_first_name", sa.Text(), nullable=True),
        sa.Column("contact_last_name", sa.Text(), nullable=True),
        sa.Column("contact_email", sa.Text(), nullable=True),
        sa.Column("contact_phone", sa.Text(), nullable=True),
        sa.Column("organization_website", sa.Text(), nullable=True),
        sa.Column(
            "referral_sources",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("referral_reference", sa.Text(), nullable=True),
        sa.Column("additional_notes", sa.Text(), nullable=True),
        sa.Column("internal_notes", sa.Text(), nullable=True),
        sa.Column(
            "original_fields",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.CheckConstraint(
            "audience_distance_12ft IN ('yes','no','unsure')",
            name=op.f("ck_presentation_requests_audience_distance_allowed"),
        ),
        sa.CheckConstraint(
            "event_access IN ('public','private')",
            name=op.f("ck_presentation_requests_access_allowed"),
        ),
        sa.CheckConstraint(
            "event_setting IN ('indoor','outdoor','unsure')",
            name=op.f("ck_presentation_requests_setting_allowed"),
        ),
        sa.CheckConstraint(
            "form_version IN ('legacy_v1','presentation_v2')",
            name=op.f("ck_presentation_requests_form_version_allowed"),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(event_types) = 'array'",
            name=op.f("ck_presentation_requests_event_types_array"),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(original_fields) = 'object'",
            name=op.f("ck_presentation_requests_original_fields_object"),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(referral_sources) = 'array'",
            name=op.f("ck_presentation_requests_referral_sources_array"),
        ),
        sa.CheckConstraint(
            "source = 'manual' OR (source_key IS NOT NULL AND external_id IS NOT NULL)",
            name=op.f("ck_presentation_requests_external_source_identity"),
        ),
        sa.CheckConstraint(
            "source IN ('legacy_csv','manual','wix')",
            name=op.f("ck_presentation_requests_source_allowed"),
        ),
        sa.CheckConstraint(
            "status IN ('unknown','new','reviewing','proposal_sent','booked',"
            "'completed','declined','cancelled')",
            name=op.f("ck_presentation_requests_status_allowed"),
        ),
        sa.CheckConstraint(
            "estimated_guests >= 0", name=op.f("ck_presentation_requests_guests_nonnegative")
        ),
        sa.CheckConstraint(
            "source_row_number > 0", name=op.f("ck_presentation_requests_source_row_positive")
        ),
        sa.ForeignKeyConstraint(
            ["import_batch_id"],
            ["presentation_import_batches.id"],
            name=op.f("fk_presentation_requests_import_batch_id_presentation_import_batches"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_presentation_requests")),
        sa.UniqueConstraint(
            "source", "source_key", "external_id", name="uq_presentation_source_identity"
        ),
    )
    op.create_index(
        "ix_presentation_requests_created_id",
        "presentation_requests",
        ["created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_presentation_requests_event_date", "presentation_requests", ["event_date"], unique=False
    )
    op.create_index(
        "ix_presentation_requests_import_batch_id",
        "presentation_requests",
        ["import_batch_id"],
        unique=False,
    )
    op.create_index(
        "ix_presentation_requests_status", "presentation_requests", ["status"], unique=False
    )
    op.create_table(
        "presentation_activities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("previous_status", sa.String(length=30), nullable=True),
        sa.Column("new_status", sa.String(length=30), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('created','status_changed','note_added')",
            name=op.f("ck_presentation_activities_kind_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["presentation_requests.id"],
            name=op.f("fk_presentation_activities_request_id_presentation_requests"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_presentation_activities")),
    )
    op.create_index(
        "ix_presentation_activities_request_created",
        "presentation_activities",
        ["request_id", "created_at", "id"],
        unique=False,
    )

    op.execute("ALTER TABLE presentation_import_batches ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE presentation_import_batches FROM PUBLIC")
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN "
        "REVOKE ALL ON TABLE presentation_import_batches FROM anon; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN "
        "REVOKE ALL ON TABLE presentation_import_batches FROM authenticated; "
        "END IF; END $$"
    )

    op.execute("ALTER TABLE presentation_requests ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE presentation_requests FROM PUBLIC")
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN "
        "REVOKE ALL ON TABLE presentation_requests FROM anon; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN "
        "REVOKE ALL ON TABLE presentation_requests FROM authenticated; "
        "END IF; END $$"
    )

    op.execute("ALTER TABLE presentation_activities ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE presentation_activities FROM PUBLIC")
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN "
        "REVOKE ALL ON TABLE presentation_activities FROM anon; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN "
        "REVOKE ALL ON TABLE presentation_activities FROM authenticated; "
        "END IF; END $$"
    )


def downgrade() -> None:
    op.drop_table("presentation_activities")
    op.drop_table("presentation_requests")
    op.drop_table("presentation_import_batches")
