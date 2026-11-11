"""Add presentation operational details and restricted historical import evidence."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "presentation_import_rows",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("source_record_number", sa.Integer(), nullable=False),
        sa.Column("row_sha256", sa.String(length=64), nullable=False),
        sa.Column("original_headers", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("original_cells", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("normalized_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("request_id", sa.Uuid(), nullable=True),
        sa.Column("review_state", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column(
            "rule_codes",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("proposed_status", sa.String(length=30), nullable=True),
        sa.Column(
            "status_basis", sa.String(length=20), server_default="unresolved", nullable=False
        ),
        sa.Column("observed_request_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "jsonb_typeof(normalized_fields) = 'object'",
            name=op.f("ck_presentation_import_rows_normalized_fields_object"),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(original_cells) = 'array'",
            name=op.f("ck_presentation_import_rows_original_cells_array"),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(original_headers) = 'array'",
            name=op.f("ck_presentation_import_rows_original_headers_array"),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(rule_codes) = 'array'",
            name=op.f("ck_presentation_import_rows_rule_codes_array"),
        ),
        sa.CheckConstraint(
            "proposed_status IN ('unknown','new','reviewing','proposal_sent','booked',"
            "'completed','declined','cancelled')",
            name=op.f("ck_presentation_import_rows_proposed_status_allowed"),
        ),
        sa.CheckConstraint(
            "review_state IN ('pending','applied','conflict','skipped')",
            name=op.f("ck_presentation_import_rows_review_state_allowed"),
        ),
        sa.CheckConstraint(
            "row_sha256 ~ '^[0-9a-f]{64}$'",
            name=op.f("ck_presentation_import_rows_row_digest_valid"),
        ),
        sa.CheckConstraint(
            "status_basis IN ('explicit','user_assumption','unresolved')",
            name=op.f("ck_presentation_import_rows_status_basis_allowed"),
        ),
        sa.CheckConstraint(
            "source_record_number > 0",
            name=op.f("ck_presentation_import_rows_source_record_positive"),
        ),
        sa.ForeignKeyConstraint(
            ["batch_id"],
            ["presentation_import_batches.id"],
            name=op.f("fk_presentation_import_rows_batch_id_presentation_import_batches"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["presentation_requests.id"],
            name=op.f("fk_presentation_import_rows_request_id_presentation_requests"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_presentation_import_rows")),
        sa.UniqueConstraint(
            "batch_id", "source_record_number", name="uq_presentation_import_rows_record"
        ),
        sa.UniqueConstraint("request_id", "id", name="uq_import_rows_request_identity"),
    )
    op.create_index(
        "ix_presentation_import_rows_request_id",
        "presentation_import_rows",
        ["request_id"],
        unique=False,
    )
    op.create_index(
        "ix_presentation_import_rows_review_state",
        "presentation_import_rows",
        ["review_state"],
        unique=False,
    )
    op.create_table(
        "presentation_operations",
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("import_row_id", sa.Uuid(), nullable=True),
        sa.Column("quoted_amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("recorded_received_amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("finder_name", sa.Text(), nullable=True),
        sa.Column("payment_status", sa.String(length=20), server_default="unknown", nullable=False),
        sa.Column("payment_basis", sa.String(length=20), server_default="unknown", nullable=False),
        sa.Column("payment_method", sa.String(length=20), server_default="unknown", nullable=False),
        sa.Column("payment_notes", sa.Text(), nullable=True),
        sa.Column(
            "engagement_type", sa.String(length=20), server_default="unknown", nullable=False
        ),
        sa.Column(
            "engagement_basis", sa.String(length=20), server_default="unknown", nullable=False
        ),
        sa.Column("invoice_status", sa.String(length=20), server_default="unknown", nullable=False),
        sa.Column("coi_status", sa.String(length=20), server_default="unknown", nullable=False),
        sa.Column("attendance_count", sa.Integer(), nullable=True),
        sa.Column("roster_count", sa.Integer(), nullable=True),
        sa.Column("attendance_notes", sa.Text(), nullable=True),
        sa.Column("parking_notes", sa.Text(), nullable=True),
        sa.Column("dressing_room_notes", sa.Text(), nullable=True),
        sa.Column("logistics_notes", sa.Text(), nullable=True),
        sa.Column(
            "status_basis", sa.String(length=20), server_default="unresolved", nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "coi_status IN ('unknown','done','not_done')",
            name=op.f("ck_presentation_operations_coi_status_allowed"),
        ),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name=op.f("ck_presentation_operations_currency_valid")
        ),
        sa.CheckConstraint(
            "engagement_basis IN ('unknown','recorded','explicit','user_assumption')",
            name=op.f("ck_presentation_operations_engagement_basis_allowed"),
        ),
        sa.CheckConstraint(
            "engagement_type IN ('unknown','paid','volunteer','calpulli_internal')",
            name=op.f("ck_presentation_operations_engagement_type_allowed"),
        ),
        sa.CheckConstraint(
            "invoice_status IN ('unknown','done','not_done')",
            name=op.f("ck_presentation_operations_invoice_status_allowed"),
        ),
        sa.CheckConstraint(
            "payment_basis IN ('unknown','recorded','explicit','user_assumption')",
            name=op.f("ck_presentation_operations_payment_basis_allowed"),
        ),
        sa.CheckConstraint(
            "payment_method IN ('unknown','check','cash','bank_transfer','other')",
            name=op.f("ck_presentation_operations_payment_method_allowed"),
        ),
        sa.CheckConstraint(
            "payment_status IN ('unknown','paid','unpaid','partial','no_charge','refunded')",
            name=op.f("ck_presentation_operations_payment_status_allowed"),
        ),
        sa.CheckConstraint(
            "status_basis IN ('explicit','user_assumption','unresolved')",
            name=op.f("ck_presentation_operations_status_basis_allowed"),
        ),
        sa.CheckConstraint(
            "attendance_count >= 0",
            name=op.f("ck_presentation_operations_attendance_count_nonnegative"),
        ),
        sa.CheckConstraint(
            "quoted_amount >= 0", name=op.f("ck_presentation_operations_quoted_amount_nonnegative")
        ),
        sa.CheckConstraint(
            "recorded_received_amount >= 0",
            name=op.f("ck_presentation_operations_received_amount_nonnegative"),
        ),
        sa.CheckConstraint(
            "roster_count >= 0", name=op.f("ck_presentation_operations_roster_count_nonnegative")
        ),
        sa.ForeignKeyConstraint(
            ["request_id", "import_row_id"],
            ["presentation_import_rows.request_id", "presentation_import_rows.id"],
            name="fk_operations_request_import_row",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["presentation_requests.id"],
            name=op.f("fk_presentation_operations_request_id_presentation_requests"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("request_id", name=op.f("pk_presentation_operations")),
        sa.UniqueConstraint("import_row_id", name="uq_presentation_operations_import_row"),
    )

    for table in ("presentation_import_rows", "presentation_operations"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON TABLE {table} FROM PUBLIC")
        op.execute(
            "DO $$ BEGIN "
            "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN "
            f"REVOKE ALL ON TABLE {table} FROM anon; "
            "END IF; "
            "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN "
            f"REVOKE ALL ON TABLE {table} FROM authenticated; "
            "END IF; END $$"
        )


def downgrade() -> None:
    op.drop_table("presentation_operations")
    op.drop_table("presentation_import_rows")
