"""Store website contact form messages for the staff Inbox."""

import sqlalchemy as sa

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contact_messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("form_id", sa.String(200), nullable=False),
        sa.Column("submission_id", sa.String(200), nullable=False),
        sa.Column("first_name", sa.String(150)),
        sa.Column("last_name", sa.String(150)),
        sa.Column("email", sa.String(254)),
        sa.Column("phone", sa.String(80)),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("form_id", "submission_id"),
    )
    op.create_index("ix_contact_messages_received_at_id", "contact_messages", ["received_at", "id"])
    op.execute("ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON contact_messages FROM PUBLIC")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                REVOKE ALL ON contact_messages FROM anon;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                REVOKE ALL ON contact_messages FROM authenticated;
            END IF;
        END $$
    """)


def downgrade() -> None:
    raise RuntimeError("Revision 0012 is forward-only to preserve contact messages")
