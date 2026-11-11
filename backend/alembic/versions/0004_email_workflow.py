"""Add application-level email drafts, templates, and staff tasks."""

import json
from pathlib import Path

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE presentation_email_templates (
        key VARCHAR(60) NOT NULL,
        subject VARCHAR(998) NOT NULL,
        body_text TEXT NOT NULL,
        ready_for_use BOOLEAN NOT NULL,
        updated_by VARCHAR(100),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_presentation_email_templates PRIMARY KEY (key)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE presentation_email_messages (
        id UUID NOT NULL,
        inquiry_id UUID NOT NULL,
        presentation_id UUID NOT NULL,
        template_key VARCHAR(60) NOT NULL,
        state_trigger VARCHAR(60) NOT NULL,
        triggering_event VARCHAR(120) NOT NULL,
        recipient_email VARCHAR(320),
        recipient_name TEXT,
        subject VARCHAR(998) NOT NULL,
        body_text TEXT NOT NULL,
        source_subject TEXT,
        source_body TEXT,
        body_html TEXT NOT NULL,
        variables JSONB NOT NULL,
        missing_variables JSONB NOT NULL,
        status VARCHAR(30) NOT NULL,
        requires_approval BOOLEAN NOT NULL,
        approved_by VARCHAR(100),
        approved_at TIMESTAMP WITH TIME ZONE,
        sent_by VARCHAR(100),
        sent_at TIMESTAMP WITH TIME ZONE,
        provider_message_id VARCHAR(200),
        provider_thread_id VARCHAR(200),
        rfc_message_id VARCHAR(200) NOT NULL,
        reply_to_id UUID,
        resend_of_id UUID,
        error_code VARCHAR(100),
        error_message TEXT,
        retryable BOOLEAN NOT NULL,
        delivery_unknown BOOLEAN NOT NULL,
        attempts INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_presentation_email_messages PRIMARY KEY (id),
        CONSTRAINT uq_email_event UNIQUE (inquiry_id, template_key, triggering_event),
        CONSTRAINT ck_presentation_email_messages_email_status_allowed CHECK (status IN
            ('DRAFT','PENDING_APPROVAL','APPROVED','SENDING','SENT','FAILED','CANCELLED')),
        CONSTRAINT ck_presentation_email_messages_email_attempts_bounded CHECK (attempts >=
            0 AND attempts <= 3),
        CONSTRAINT fk_presentation_email_messages_inquiry_id_presentation_requests FOREIGN
            KEY(inquiry_id) REFERENCES presentation_requests (id) ON DELETE RESTRICT,
        CONSTRAINT fk_presentation_email_messages_presentation_id_presenta_e71f FOREIGN
            KEY(presentation_id) REFERENCES presentation_requests (id) ON DELETE RESTRICT,
        CONSTRAINT fk_presentation_email_messages_template_key_presentatio_082b FOREIGN
            KEY(template_key) REFERENCES presentation_email_templates (key),
        CONSTRAINT fk_presentation_email_messages_reply_to_id_presentation_6f47 FOREIGN
            KEY(reply_to_id) REFERENCES presentation_email_messages (id),
        CONSTRAINT fk_presentation_email_messages_resend_of_id_presentatio_c323 FOREIGN
            KEY(resend_of_id) REFERENCES presentation_email_messages (id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX ix_presentation_email_messages_inquiry ON presentation_email_messages
            (inquiry_id, created_at)
        """
    )
    op.execute(
        """
        CREATE TABLE presentation_email_staff_tasks (
        id UUID NOT NULL,
        inquiry_id UUID NOT NULL,
        email_message_id UUID NOT NULL,
        code VARCHAR(100) NOT NULL,
        summary TEXT NOT NULL,
        resolved BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_presentation_email_staff_tasks PRIMARY KEY (id),
        CONSTRAINT uq_email_task_code UNIQUE (email_message_id, code),
        CONSTRAINT fk_presentation_email_staff_tasks_inquiry_id_presentati_43c1 FOREIGN
            KEY(inquiry_id) REFERENCES presentation_requests (id) ON DELETE RESTRICT,
        CONSTRAINT fk_presentation_email_staff_tasks_email_message_id_pres_05e7 FOREIGN
            KEY(email_message_id) REFERENCES presentation_email_messages (id) ON DELETE
            RESTRICT
        )
        """
    )
    op.add_column(
        "presentation_activities", sa.Column("email_message_id", sa.Uuid(), nullable=True)
    )
    op.add_column("presentation_activities", sa.Column("actor_id", sa.String(100), nullable=True))
    op.add_column("presentation_activities", sa.Column("summary", sa.Text(), nullable=True))
    op.create_foreign_key(
        op.f("fk_presentation_activities_email_message_id_presentation_email_messages"),
        "presentation_activities",
        "presentation_email_messages",
        ["email_message_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_constraint(
        "ck_presentation_activities_kind_allowed", "presentation_activities", type_="check"
    )
    op.create_check_constraint(
        "kind_allowed",
        "presentation_activities",
        "kind IN ('created','status_changed','note_added','email_recommended','email_blocked',"
        "'email_draft_created','email_approved','email_cancelled','email_send_started',"
        "'email_sent','email_send_failed','email_send_retried')",
    )
    templates = sa.table(
        "presentation_email_templates",
        sa.column("key", sa.String()),
        sa.column("subject", sa.String()),
        sa.column("body_text", sa.Text()),
        sa.column("ready_for_use", sa.Boolean()),
    )
    seeds = json.loads(
        (Path(__file__).parent.parent / "data" / "email_templates_v1.json").read_text()
    )
    op.bulk_insert(templates, seeds)
    for name in (
        "presentation_email_templates",
        "presentation_email_messages",
        "presentation_email_staff_tasks",
    ):
        op.execute(f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON TABLE {name} FROM PUBLIC")
        for role in ("anon", "authenticated"):
            op.execute(
                "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '"
                + role
                + "') THEN REVOKE ALL ON TABLE "
                + name
                + " FROM "
                + role
                + "; END IF; END $$"
            )


def downgrade() -> None:
    op.execute("DELETE FROM presentation_activities WHERE email_message_id IS NOT NULL")
    op.drop_constraint(
        "ck_presentation_activities_kind_allowed", "presentation_activities", type_="check"
    )
    op.create_check_constraint(
        "kind_allowed",
        "presentation_activities",
        "kind IN ('created','status_changed','note_added')",
    )
    op.drop_column("presentation_activities", "email_message_id")
    op.drop_column("presentation_activities", "actor_id")
    op.drop_column("presentation_activities", "summary")
    op.drop_table("presentation_email_staff_tasks")
    op.drop_table("presentation_email_messages")
    op.drop_table("presentation_email_templates")
