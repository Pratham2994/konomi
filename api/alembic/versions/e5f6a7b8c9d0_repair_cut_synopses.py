"""repair synopses that lost their first letters in the Kaggle source ('hen Subaru...'): AniList's text for the same
title, found by its AniList or MAL id (repair/synopsis_repair.json.gz, 4,097 titles)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
"""
import gzip
import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None

DATA = Path(__file__).resolve().parents[1] / "repair" / "synopsis_repair.json.gz"


def upgrade() -> None:
    rows = json.loads(gzip.decompress(DATA.read_bytes()))
    # Only rows still cut are touched, matched by AniList id (or MAL id when AniList has none), so this is safe to run
    # on any copy of the catalogue and never overwrites a synopsis that was fixed another way.
    for key, col in (("anilist_id", "anilist_id"), ("mal_id", "mal_id")):
        part = [{"k": r[key], "s": r["synopsis"]} for r in rows if r[key] and (key == "anilist_id" or not r["anilist_id"])]
        if part:
            op.get_bind().execute(sa.text(
                f"update anime a set synopsis = f.s from jsonb_to_recordset(cast(:rows as jsonb)) as f(k int, s text) "
                f"where a.{col} = f.k and a.synopsis ~ '^[a-z]'"), {"rows": json.dumps(part)})


def downgrade() -> None:
    pass  # the cut text is not worth restoring
