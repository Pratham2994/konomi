"""rescore every chart under soft bands, so old scores don't wait for the next answer to change

Revision ID: c9d3e4f5a6b7
Revises: b7c1d2e3f4a5
"""
import sqlalchemy as sa
from alembic import op

from konomi_api.rating.score import DuelRec, fit_scores

revision = "c9d3e4f5a6b7"
down_revision = "b7c1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    users = bind.execute(sa.text("select distinct user_id from list_entries where tier is not null")).scalars().all()
    for u in users:
        rows = bind.execute(sa.text("select anime_id, tier, between, predicted from list_entries "
                                    "where user_id = :u and tier is not null"), {"u": u}).all()
        duels = [DuelRec(a, b, o) for a, b, o in bind.execute(
            sa.text("select a_id, b_id, outcome from duels where user_id = :u order by id"), {"u": u}).all()]
        scores = fit_scores({a: t for a, t, _, _ in rows}, duels, {a for a, _, b, _ in rows if b},
                            {a: g for a, _, _, g in rows if g is not None})
        if scores:
            bind.execute(sa.text("update list_entries set score = :s where user_id = :u and anime_id = :a"),
                         [{"s": s, "u": u, "a": a} for a, s in scores.items()])


def downgrade() -> None:
    pass  # scores are derived data; the next rating answer recomputes them under whichever model runs
