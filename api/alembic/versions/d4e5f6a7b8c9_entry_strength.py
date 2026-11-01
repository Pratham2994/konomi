"""strength: the model's exact position behind each rounded score, so titles with the same score keep one order

Revision ID: d4e5f6a7b8c9
Revises: c9d3e4f5a6b7
"""
import sqlalchemy as sa
from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "c9d3e4f5a6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Filled in per user by the first read after deploy (rating.routes.ensure_strength).
    op.add_column("list_entries", sa.Column("strength", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("list_entries", "strength")
