"""media_type column; half-precision embeddings with an HNSW index

Revision ID: a1b2c3d4e5f6
Revises: 5c0e8699774c
"""
import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "5c0e8699774c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("anime", sa.Column("media_type", sa.String(10), nullable=False, server_default="anime"))
    op.create_index("ix_anime_media_type", "anime", ["media_type"])
    op.execute("alter table anime alter column embedding type halfvec(200) using embedding::halfvec(200)")
    op.execute("create index ix_anime_embedding_hnsw on anime using hnsw (embedding halfvec_ip_ops)")


def downgrade() -> None:
    op.execute("drop index if exists ix_anime_embedding_hnsw")
    op.execute("alter table anime alter column embedding type vector using embedding::vector")
    op.drop_index("ix_anime_media_type", "anime")
    op.drop_column("anime", "media_type")
