"""Store Outlook delivery receipts and the provider of presentation sends."""

import sqlalchemy as sa

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("presentation_email_messages", sa.Column("delivery_provider", sa.String(20)))
    op.alter_column("presentation_email_messages", "provider_message_id", type_=sa.Text())
    op.alter_column("presentation_email_messages", "provider_thread_id", type_=sa.Text())
    op.create_table(
        "outlook_send_attempts",
        sa.Column("staff_id", sa.Uuid(), primary_key=True),
        sa.Column("request_id", sa.Uuid(), primary_key=True),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("message_id", sa.Text()),
        sa.Column("conversation_id", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "(message_id IS NULL) = (conversation_id IS NULL)", name="complete_receipt"
        ),
    )
    op.execute("ALTER TABLE outlook_send_attempts ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON outlook_send_attempts FROM PUBLIC")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                REVOKE ALL ON outlook_send_attempts FROM anon;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                REVOKE ALL ON outlook_send_attempts FROM authenticated;
            END IF;
        END $$
    """)


def downgrade() -> None:
    raise RuntimeError("Revision 0010 is forward-only to preserve Outlook send receipts")
