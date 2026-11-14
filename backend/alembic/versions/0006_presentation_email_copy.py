"""Add the reviewed presentation email copy and missing workflow templates."""

import json
from pathlib import Path

import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def _templates(filename: str) -> list[dict[str, object]]:
    return json.loads((Path(__file__).parent.parent / "data" / filename).read_text())


def upgrade() -> None:
    op.drop_constraint(
        op.f("ck_presentation_activities_kind_allowed"),
        "presentation_activities",
        type_="check",
    )
    op.create_check_constraint(
        "kind_allowed",
        "presentation_activities",
        "kind IN ('created','status_changed','note_added','email_recommended','email_blocked',"
        "'email_draft_created','email_draft_updated','email_approved','email_cancelled',"
        "'email_send_started','email_sent','email_send_failed','email_send_retried',"
        "'details_updated')",
    )
    table = sa.table(
        "presentation_email_templates",
        sa.column("key", sa.String(60)),
        sa.column("subject", sa.String(998)),
        sa.column("body_text", sa.Text()),
        sa.column("ready_for_use", sa.Boolean()),
        sa.column("updated_by", sa.String(100)),
    )
    connection = op.get_bind()
    for template in _templates("email_templates_v2.json"):
        result = connection.execute(
            sa.update(table)
            .where(table.c.key == template["key"], table.c.updated_by.is_(None))
            .values(subject=template["subject"], body_text=template["body_text"])
        )
        if (
            result.rowcount == 0
            and template["key"]
            in {
                "alternative_dates",
                "quote_follow_up",
                "day_of_confirmation",
            }
            and connection.execute(
                sa.select(table.c.key).where(table.c.key == template["key"])
            ).first()
            is None
        ):
            op.bulk_insert(table, [template])


def downgrade() -> None:
    connection = op.get_bind()
    if connection.execute(
        sa.text(
            "SELECT 1 FROM presentation_activities "
            "WHERE kind IN ('details_updated', 'email_draft_updated') LIMIT 1"
        )
    ).first():
        raise RuntimeError(
            "Cannot downgrade while new activity kinds exist; preserve audit history"
        )
    table = sa.table(
        "presentation_email_templates",
        sa.column("key", sa.String(60)),
        sa.column("subject", sa.String(998)),
        sa.column("body_text", sa.Text()),
        sa.column("ready_for_use", sa.Boolean()),
        sa.column("updated_by", sa.String(100)),
    )
    original = {template["key"]: template for template in _templates("email_templates_v1.json")}
    for key, template in original.items():
        connection.execute(
            sa.update(table)
            .where(table.c.key == key, table.c.updated_by.is_(None))
            .values(subject=template["subject"], body_text=template["body_text"])
        )
    for key in ("alternative_dates", "quote_follow_up", "day_of_confirmation"):
        connection.execute(sa.delete(table).where(table.c.key == key, table.c.updated_by.is_(None)))
    op.drop_constraint(
        op.f("ck_presentation_activities_kind_allowed"),
        "presentation_activities",
        type_="check",
    )
    op.create_check_constraint(
        "kind_allowed",
        "presentation_activities",
        "kind IN ('created','status_changed','note_added','email_recommended','email_blocked',"
        "'email_draft_created','email_approved','email_cancelled','email_send_started',"
        "'email_sent','email_send_failed','email_send_retried')",
    )
