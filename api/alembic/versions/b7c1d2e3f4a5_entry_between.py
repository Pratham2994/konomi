"""in-between feelings: a title can start on the edge between its band and the one below

Revision ID: b7c1d2e3f4a5
Revises: a1b2c3d4e5f6
"""
import sqlalchemy as sa
from alembic import op

revision = "b7c1d2e3f4a5"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("list_entries", sa.Column("between", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("list_entries", "between")
