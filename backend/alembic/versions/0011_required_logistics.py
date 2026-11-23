"""Store the Required Logistics checkbox selections on presentation requests."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("presentation_requests", sa.Column("required_logistics", postgresql.JSONB()))
    op.create_check_constraint(
        "required_logistics_array",
        "presentation_requests",
        "required_logistics IS NULL OR jsonb_typeof(required_logistics) = 'array'",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_presentation_requests_required_logistics_array"),
        "presentation_requests",
        type_="check",
    )
    op.drop_column("presentation_requests", "required_logistics")
