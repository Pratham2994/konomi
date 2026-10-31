# 好み Konomi

An anime list that never asks you for a number.

- **Add in one keystroke.** The whole catalogue (39,800 anime, adult titles removed) lives in your browser.
  Type, press Enter. Or walk back through past seasons and tap what you've seen. Or import from MAL / AniList.
- **Scores you can trust.** One feeling ("One of my favourites" … "Didn't like it") picks a band, then a few
  "which did you enjoy more?" duels place the title inside it. Your very best lands on exactly 10.0.
- **A taste model that knows you.** Trained on 56.5M MyAnimeList ratings from 293k people on a local RTX 5070.
  It recommends with reasons, guesses your score *before* you answer (then shows how close it was), maps your
  taste DNA, draws your taste as a 3D galaxy, and compares you with friends. See [docs/model-report.md](docs/model-report.md).

## Run it locally

Needs Docker, Node 20+, [uv](https://docs.astral.sh/uv/).

```bash
docker compose up -d                       # Postgres 18 + pgvector on :5433, Mailpit (fake inbox) on :8025
cd api && uv venv .venv --python 3.13 && uv pip install --python .venv -r requirements.txt
.venv/Scripts/alembic upgrade head          # (macOS/Linux: .venv/bin/...)
.venv/Scripts/python seed.py                # catalogue + taste artifacts + demo user
.venv/Scripts/python -m uvicorn konomi_api.main:app --port 8000 --reload
```

```bash
cd web && npm install && npm run dev        # http://localhost:5173 (proxies /api to :8000)
```

- Demo login: see `api/seed_users.example.json`.
- Sign-up emails (6-digit codes) land in Mailpit: http://localhost:8025.

### Rebuilding the data and the model (optional, ~1 h on a 12 GB GPU)

```bash
# raw inputs: data/raw/aod.json (anime-offline-database release) and archive/ (Kaggle
# "Anime Recommendation Database 2020" by hernan4444)
api/.venv/Scripts/python pipeline/anilist.py     # AniList metadata (cached, ~15 min, rate-limited)
api/.venv/Scripts/python pipeline/catalog.py     # -> data/build/catalog.parquet
api/.venv/Scripts/python pipeline/ratings.py     # -> data/build/ratings.parquet
cd ml && uv venv .venv --python 3.13 && uv pip install --python .venv torch --index-url https://download.pytorch.org/whl/cu128
uv pip install --python .venv -r requirements.txt
.venv/Scripts/python train.py                    # baselines, EASE, Mult-VAE -> docs/model-report.md
.venv/Scripts/python ensemble.py                 # Mult-VAE + EASE blend weight
.venv/Scripts/python export.py                   # bridge, taste axes, galaxy -> data/build/artifacts/
.venv/Scripts/python calibrate.py                # score prediction (rank + title quality)
cd ../api && .venv/Scripts/python seed.py
```

## Tests

```bash
cd api && .venv/Scripts/python -m pytest -q      # needs docker compose up; uses its own konomi_test database
cd web && npm test                               # search ranking on the real catalogue
cd web && npm run e2e                            # full journey in a browser (API + web dev servers running)
```

The API tests run against a separate `konomi_test` database (they truncate user tables). Create it once:

```bash
docker compose exec db psql -U konomi -c "create database konomi_test"
cd api && KONOMI_DATABASE_URL=postgresql+psycopg://konomi:konomi@localhost:5433/konomi_test .venv/Scripts/alembic upgrade head
KONOMI_DATABASE_URL=postgresql+psycopg://konomi:konomi@localhost:5433/konomi_test .venv/Scripts/python seed.py --no-demo
```

## Layout

| Path | What |
|---|---|
| `pipeline/` | catalogue + ratings builders (AOD, Kaggle, AniList) |
| `ml/` | training (`train.py`), evaluation, content bridge + taste space export (`export.py`) |
| `api/` | FastAPI: auth (email + password + OTP), lists, rating maths, taste engine, profiles, share images, imports |
| `web/` | React + Vite app |
| `docs/superpowers/` | design spec and build plan |

## Credits

Catalogue: [anime-offline-database](https://github.com/manami-project/anime-offline-database) (ODbL 1.0).
Ratings: MyAnimeList via the Kaggle "Anime Recommendation Database 2020" (training only, not redistributed).
Metadata and cover colours: [AniList](https://anilist.co) API. Fonts: Dela Gothic One, Zen Kaku Gothic New (OFL).
