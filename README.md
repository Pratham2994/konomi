# 好み Konomi

**An anime list that never asks you for a number.** You say how a show felt, answer a few "which did you enjoy
more?" questions, and Konomi works out every score on your chart. A taste model trained on 56.5 million ratings
then tells you what to watch next, and why.

**Live: [konomi.prathampanchal.dev](https://konomi.prathampanchal.dev)** · Status: **finished** (v1.0, November 2026)

<p align="center">
  <img src="docs/screens/landing.jpg" alt="Konomi landing page: a wall of popular anime covers around the headline" width="100%">
</p>
<p align="center">
  <img src="docs/screens/title.jpg" alt="A title page laid out like a magazine spread" width="68%">
  &nbsp;
  <img src="docs/screens/landing-phone.jpg" alt="Konomi on a phone" width="26%">
</p>

## What it does

- **Add in one keystroke.** The whole catalogue (39,842 anime, adult titles removed) is searched in your browser.
  Type, press Enter. Or walk back through past seasons and tap what you watched, tap the most popular 500, or import
  from MyAnimeList or AniList.
- **Scores without sliders.** Pick a feeling ("One of my favourites", "Loved it", "Liked it", "It was okay",
  "Didn't like it", or in between). Then Konomi asks which of two titles you enjoyed more, and every answer moves
  the whole chart. Your very best lands on 10.0, and you can take any answer back.
- **Know which season is which.** Every rating card says what happens in that season, so Season 3 Part 2 never
  gets mixed up with Season 3. The 500 most popular titles have a summary written for them.
- **Recommendations with reasons.** "Because you loved Naruto and One Piece", "Next season of Mob Psycho 100, which
  you loved", "Top pick in Action and Adventure, which you rate highly". It weighs your ratings, the genres you
  rate highly, how popular and well liked a title is, and how close it sits to what you loved.
- **Your taste, mapped.** A 3D galaxy of every anime, with your titles lit up and neighbourhoods named in plain
  words; taste DNA on six axes; Konomi's guess of your score before you answer, and how often it was right.
- **Profiles worth sharing.** Private by default. When public: favourites, hot takes (where you disagree with
  everyone), the hill you'll die on, anime by year, the full chart, link previews, and a chart you can save as one
  web page.

## How the scores work

1. **A feeling sets the starting band.** Favourite 9.0 to 10, loved 8.0 to 8.9, liked 6.5 to 7.9, okay 5.0 to 6.4,
   didn't like 1.0 to 4.9. "In between" starts a title on the edge of the band below.
2. **Duels place it.** All answers are fitted together with a Bradley-Terry model, anchored by each title's band
   (and the model's guess inside it). A title that keeps beating higher-band titles crosses into their band. One
   direct answer always beats the starting guess, so the chart never contradicts you.
3. **The right questions, in the right order.** Each next duel is the one that tells the most about your chart
   (expected information gain, as in Hybrid-MST and ASAP), never a pair already asked and never a pair whose answer
   is certain. Every other duel settles your top 10 first; the rest go wherever the chart is least sure, top or
   bottom. In simulation (100 titles, 300 answers) the bottom half of a chart is ordered far better than with plain
   neighbour duels (Kendall tau 0.74 → 0.82), and the top 5 are in the right order pair by pair 94 to 97% of the
   time with consistent answers (83 to 87% with noisy ones).

The whole fit runs in about 7 ms for 500 titles and 2,000 duels.

## The taste model

Trained locally on an RTX 5070: 14,085 anime, 263,739 users, 27 million positive ratings, evaluated on 14,653
held-out users. Full report: [docs/model-report.md](docs/model-report.md).

| | NDCG@20 | Recall@20 | Rating error (MAE) |
|---|---|---|---|
| Popularity baseline | 0.158 | 0.163 | |
| Your own mean score | | | 1.092 |
| **Served: Mult-VAE + EASE blend** | **0.477** | **0.483** | |
| **Score guess: model rank + title quality** | | | **0.886** |

- NDCG@20 is 3× the popularity baseline. Score guesses are off by under 0.9 points on average.
- New titles with no ratings yet (25,757 of them, mostly after 2020) are placed in the taste space from their tags,
  studios, genres and synopsis by a small content model (cosine 0.81 to their true position).
- At serving time a hybrid re-rank blends the model with your genre affinity, popularity and quality, liked-title
  neighbours, one pick per franchise (a sequel only after you finished the season before it), and variety (MMR).

## Built with

| | |
|---|---|
| Web | React 19, Vite, TanStack Query, Motion, React Three Fiber |
| API | FastAPI, SQLAlchemy, Alembic, numpy, scipy |
| Data | PostgreSQL with pgvector (Neon), catalogue built with polars |
| Model | PyTorch (Mult-VAE), EASE, sentence embeddings for the content bridge |
| Hosting | Render (free), Cloudflare (domain, proxy, keep-alive worker), Resend (email codes) |

Everything runs on free plans. The API lives in 512 MB on a fraction of one CPU, so the model loads lean, numeric
libraries run single-threaded (one taste guess went from 7 s to 0.1 s), and every response carries a
`Server-Timing` header. Most calls finish in 10 to 300 ms on the server.

## Run it locally

Needs Docker, Node 20+ and [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env
docker compose up -d                                     # Postgres 18 + pgvector on :5433, Mailpit on :8025
mkdir -p data/build && tar -xzf deploy/konomi-artifacts.tar.gz -C data/build
# data/build/catalog.parquet is built by pipeline/catalog.py (see below)
cd api && uv venv .venv --python 3.13 && uv pip install --python .venv -r requirements.txt
.venv/Scripts/alembic upgrade head                       # macOS/Linux: .venv/bin/...
.venv/Scripts/python seed.py                             # catalogue, embeddings, demo user
.venv/Scripts/python -m uvicorn konomi_api.main:app --port 8000 --reload
```

```bash
cd web && npm install && npm run dev                     # http://localhost:5173, proxies /api to :8000
```

The demo login is in `api/seed_users.example.json`. Sign-up codes land in Mailpit at http://localhost:8025.

### New seasons and retraining

The catalogue comes from anime-offline-database, which publishes weekly. New titles are placed in the taste space
by the content bridge, so no retraining is needed:

```bash
api/.venv/Scripts/python pipeline/refresh.py             # then restart the API
```

Rebuilding everything from raw data (about an hour on a 12 GB GPU):

```bash
api/.venv/Scripts/python pipeline/anilist.py             # AniList metadata (cached, rate limited)
api/.venv/Scripts/python pipeline/catalog.py             # -> data/build/catalog.parquet
api/.venv/Scripts/python pipeline/ratings.py             # -> data/build/ratings.parquet
cd ml && uv venv .venv --python 3.13
uv pip install --python .venv torch --index-url https://download.pytorch.org/whl/cu128
uv pip install --python .venv -r requirements.txt
.venv/Scripts/python train.py && .venv/Scripts/python ensemble.py
.venv/Scripts/python export.py && .venv/Scripts/python calibrate.py
sh scripts/pack-artifacts.sh                             # then commit deploy/konomi-artifacts.tar.gz
```

## Tests

```bash
cd api && .venv/Scripts/python -m pytest -q tests        # API, against its own konomi_test database
cd web && npx tsc -b && npm run lint                     # types and lint
cd web && npm test                                       # search ranking on the real catalogue
cd web && npm run e2e                                    # full journeys in a browser (both dev servers running)
cd web && node scripts/fit-audit.mjs --webkit            # every page against every phone and screen size
```

Create the test database once, and migrate it again after every new migration:

```bash
docker compose exec db psql -U konomi -c "create database konomi_test"
cd api && KONOMI_DATABASE_URL=postgresql+psycopg://konomi:konomi@localhost:5433/konomi_test .venv/Scripts/alembic upgrade head
KONOMI_DATABASE_URL=postgresql+psycopg://konomi:konomi@localhost:5433/konomi_test .venv/Scripts/python seed.py --no-demo
```

## Layout

| Path | What |
|---|---|
| `web/` | React app: `features/` per page (add, anime, auth, home, list, profile, rate, taste), shared `components/` |
| `api/konomi_api/` | FastAPI: `auth/`, `lists/`, `rating/` (score maths, question picker), `taste/` (engine, re-rank, galaxy), `profile/`, `catalog/`, `imports/` |
| `api/alembic/` | Migrations, run on every start |
| `pipeline/` | Catalogue and ratings builders (anime-offline-database, Kaggle, AniList) |
| `ml/` | Training, evaluation, content bridge and taste space export |
| `deploy/` | Model artifacts and the Cloudflare keep-alive worker |

## Credits

- Catalogue: [anime-offline-database](https://github.com/manami-project/anime-offline-database) (ODbL 1.0).
- Ratings: MyAnimeList via the Kaggle "Anime Recommendation Database 2020" (used for training only, not redistributed).
- Metadata, synopses and cover colours: [AniList](https://anilist.co).
- Fonts: Dela Gothic One and Zen Kaku Gothic New (OFL).

Built by [Pratham Panchal](https://prathampanchal.dev).
