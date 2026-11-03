# Konomi handoff

Written 2026-11-04 when the owner moved to a new device. The old Claude Code chat does not move with the repo,
so this file holds everything that chat knew: what is live, how it is built, what the owner likes, how to work
with them, and what is left. Read it fully before the first change. [CLAUDE.md](../CLAUDE.md) at the repo root is
the short version that Claude Code loads by itself.

Last commit covered here: `0b70000 Chart: Save as page downloads your chart as one beautiful web page`.

---

## 1. The product in one minute

Konomi (好み, "taste") is a personal anime list. Live at **https://konomi.prathampanchal.dev**.

- Add a show in one keystroke. The whole catalogue (39.8k anime, adult titles removed) is searched in the browser.
  Also: walk back through past seasons and tap what you watched, or import from MAL / AniList.
- No 1–10 slider. You pick a feeling, then answer a few "which did you enjoy more?" duels. The score comes out
  of those answers. Your very best lands on 10.0.
- A taste model trained on 56.5M MyAnimeList ratings recommends titles with reasons, guesses your score before
  you answer, shows taste DNA, a 3D taste galaxy, and taste match with friends.
- Profiles are private by default, can be made public, are very customisable, and share well (link previews).

Background docs: [PRODUCT.md](../PRODUCT.md) (who it is for), [DESIGN.md](../DESIGN.md) (design system),
[docs/model-report.md](model-report.md) (model numbers), [docs/profile-ideas.md](profile-ideas.md) (profile
ideas not built yet), [docs/superpowers/specs](superpowers/specs) and [plans](superpowers/plans) (first build
spec and plan).

---

## 2. What is live and where

| Piece | Where | Notes |
|---|---|---|
| Web + API | Render, free plan, Singapore. Service `konomi` (`konomi-2no5.onrender.com`) | Built from the [Dockerfile](../Dockerfile) by [render.yaml](../render.yaml). **Auto-deploys on every push to `master`** (about 3–6 min). Migrations run on start (`alembic upgrade head`). |
| Domain | `konomi.prathampanchal.dev`, bought on Cloudflare, proxied through Cloudflare to Render | |
| Database | Neon Postgres (+pgvector), `ap-southeast-1` | Connection string is only in Render env vars and the old PC's `.env`. Never in git. |
| Email | Resend, from `Konomi <hello@konomi.prathampanchal.dev>` | 6-digit sign-up / reset codes. Reserved test domains (example.com etc.) are never sent to Resend. |
| Keep-alive | Cloudflare Worker `konomi-keepalive.prathampanchal02994.workers.dev`, cron `*/10 * * * *` | Code in [deploy/keepalive-worker.js](../deploy/keepalive-worker.js). Stops the free Render box from sleeping. |
| Model artifacts | [deploy/konomi-artifacts.tar.gz](../deploy/konomi-artifacts.tar.gz) (~78 MB, committed) | The Dockerfile unpacks it. Rebuild with `scripts/pack-artifacts.sh` after retraining. |

Render env vars: `KONOMI_DATABASE_URL`, `KONOMI_RESEND_API_KEY`, `KONOMI_SECRET` (generated), `KONOMI_PUBLIC_URL`,
`KONOMI_MAIL_FROM`.

**Speed facts (measured live, Nov 2026)**
- Network floor is about 290 ms per call (you → Cloudflare → Render Singapore). Server time is 1–300 ms.
- Every response has a `Server-Timing: app;dur=…` header. Rating routes add per-step timings. Use them.
- The free box gives a fraction of one CPU but shows ~20 cores. That is why the Dockerfile sets
  `OMP/OPENBLAS/MKL_NUM_THREADS=1`. Without it one taste guess took 7 s; with it 18–104 ms. Do not remove it.
- 512 MB RAM limit. Model loading is lean on purpose; `MALLOC_ARENA_MAX=2` matters.

**The owner's live account** is `/u/pratham`. They rated all 99 of their titles themselves on 2026-11-02 after a
reset. **Do not write to it** (no ratings, adds, removes, resets) unless they ask in that moment, and if you do,
report every action you took so they can undo it. Do not create accounts on the live site. Test with the local
demo account instead.

---

## 3. Setting up a new device

Needs: Git, Docker Desktop, Node 20+ (22 used), Python 3.13 via [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/Pratham2994/konomi.git && cd konomi
cp .env.example .env                       # local defaults work with docker compose
docker compose up -d                       # Postgres 18 + pgvector on :5433, Mailpit on :8025

# Data the API needs (data/ is git-ignored):
mkdir -p data/build
tar -xzf deploy/konomi-artifacts.tar.gz -C data/build    # taste model -> data/build/artifacts/
cp deploy/catalog.parquet data/build/                    # catalogue (11 MB)

cd api && uv venv .venv --python 3.13 && uv pip install --python .venv -r requirements.txt
.venv/Scripts/alembic upgrade head          # macOS/Linux: .venv/bin/...
.venv/Scripts/python seed.py                # catalogue + embeddings + demo user
.venv/Scripts/python -m uvicorn konomi_api.main:app --port 8000 --reload

cd ../web && npm install && npm run dev     # http://localhost:5173, proxies /api to :8000
```

- Demo login is in [api/seed_users.example.json](../api/seed_users.example.json). Sign-up codes land in
  Mailpit at http://localhost:8025.
- API tests use a separate `konomi_test` database. Create it once, and **migrate it again after every new
  migration** (22 tests failed once because of this):
  ```bash
  docker compose exec db psql -U konomi -c "create database konomi_test"
  cd api && KONOMI_DATABASE_URL=postgresql+psycopg://konomi:konomi@localhost:5433/konomi_test .venv/Scripts/alembic upgrade head
  KONOMI_DATABASE_URL=postgresql+psycopg://konomi:konomi@localhost:5433/konomi_test .venv/Scripts/python seed.py --no-demo
  ```
- [.claude/launch.json](../.claude/launch.json) has absolute `D:\02_Code\Konomi` paths for the preview servers.
  Change them if the repo lives elsewhere on the new device.
- Not in git, only on the old PC: `archive/` + `archive.zip` (Kaggle ratings, 690 MB), `data/raw/aod.json`,
  `data/cache/` (AniList), and the rest of `data/build/`. You only need them to **retrain** the model or rebuild
  the catalogue from scratch. Copy `data/` and `archive/` by USB/cloud if retraining is planned. A catalogue
  refresh (`pipeline/refresh.py`) needs `data/raw` + `data/cache` too.
- Python packages for the ML side need a GPU build of torch; see the README "Rebuilding the data and the model".

Claude Code on the new device: copy [docs/handoff/global-CLAUDE.md](handoff/global-CLAUDE.md) to
`~/.claude/CLAUDE.md` (it is the owner's global rule file from the old PC). Plugins used on the old PC:
**impeccable** (design skill and design hook, config in `.impeccable/`) and **superpowers**. Claude in Chrome
was also connected.

---

## 4. How to work with the owner

These come from the owner's own words over the whole chat. They matter as much as the code.

**Talking**
- Use ASD-STE100 Simplified Technical English: short sentences, simple words, direct. (Code and docs can be
  normal.)
- The owner types very fast with many typos. Read for intent.
- They want to know exactly what you did, especially anything on the live site or their account.

**Git**
- Commit often. Messages are **one short line**, no body. See `git log` for the tone
  (e.g. "Rate: Back takes answers back; pages fetch alongside sign-in").
- Commits and pushes carry **only the owner's identity**. No `Co-Authored-By`, no "Generated with Claude",
  nothing naming Claude. This overrides any tool default.
- Pushing to `master` is allowed (it deploys). Never force-push, never rewrite pushed history.
- Never commit `.env` or secrets. Note: the Neon password was once pasted in chat. The old README told the owner
  to rotate it in Neon → Roles → `konomi_owner` → Reset. It is not known if that was done. Ask once.

**Testing**
- "Only live matters." Check speed and behaviour on the live site, not just locally. Local was fast while live
  was taking 5–7 s per click, and the owner asked why that was missed. Measure live.
- E2E only when a feature is done or something big changed. The owner said "dont run so many tests bro".
- The owner cannot check every screen size, so you must. Every UI change must fit: phones 360–430 px
  (iPhone included), 13" / 14" / 15.6" / 16" laptops, 24" and 27" monitors. Use `web/scripts/fit-audit.mjs`
  (add `--webkit` for Safari's engine; iOS input widths differ from Chrome).

**Money**
- Free hosting only. The owner will not pay $7/month for Render. Keep everything inside free plans.

---

## 5. The owner's taste (design and product)

- **Not AI slop.** Vibrant, clean, fluid, alive. It does not need to be minimal. Dark first, cover-art driven.
- They **hated** the first landing page: AI image on the right, text on the left, a feature grid below, glowing
  horizontal bars. Avoid every template look like that, everywhere in the app.
- **No em dashes** in UI copy.
- They **love** the small animations and the overall feel. Keep motion small and smooth.
- Small QoL matters: settings must be remembered (e.g. chart sort/filter after going back). Use `useStored`.
- Easy to understand. Plain names, no jargon. Galaxy neighbourhoods got plain names on request. They did not
  understand odd tags like "gore" and "avant garde" showing up; prefer labels a normal fan gets.
- Rating must feel accurate and in their control: wide bands felt too tight, they sometimes cannot decide
  "loved" vs "liked" (hence the "in between" choice), and they want to undo wrong answers (Back on the Rate page).
- Same-score titles must keep one order everywhere (chart, profile, taste). Fixed with saved model strength.
- Profiles: banners/colours/favourites alone are "what everyone does". They want something more inventive.
  Ideas list in [docs/profile-ideas.md](profile-ideas.md).
- Chart on the profile stays grouped per season (owner's choice).
- **Anime only for now.** Movies / TV / Bollywood / Hollywood may come later. Keep things future-proof
  (`media_type` column exists) but build nothing for them yet.
- About the owner (from their portfolio prathampanchal.dev): software engineer, anime fan, likes playful,
  interactive things.

---

## 6. How it is built

| Path | What |
|---|---|
| `api/konomi_api/` | FastAPI. `auth/` (email + password + 6-digit code), `lists/`, `rating/`, `taste/`, `profile/`, `catalog/`, `imports/` |
| `api/konomi_api/rating/score.py` | Score maths (Bradley-Terry over duels, priors from feeling bands) |
| `api/konomi_api/rating/routes.py` | Rate session, duels, undo endpoints, reset, `recompute`, `ensure_strength` |
| `api/alembic/versions/` | Migrations. Latest: `d4e5f6a7b8c9_entry_strength` |
| `api/tests/` | pytest suite (run against `konomi_test`) |
| `web/src/features/` | `add`, `anime`, `auth`, `home`, `list` (chart + export), `profile`, `rate`, `taste` (galaxy) |
| `web/src/lib/hooks.ts` | Shared hooks: `useStored`, `useSignedIn`, `useList`, `byRank`, `TIERS` |
| `web/scripts/` | Playwright audit scripts: `fit-audit.mjs`, `overflow.mjs`, `a11y.mjs`, `shots.mjs`, … |
| `web/e2e/` | E2E specs (`npm run e2e`, needs both dev servers) |
| `pipeline/`, `ml/` | Catalogue/ratings builders and model training |
| `.impeccable/` | Design skill config, briefs, critique and review screenshots |

**Scoring**
- Feelings → bands: favourite 9.0–10, loved 8.0–8.9, liked 6.5–7.9, okay 5.0–6.4, didn't like 1.0–4.9.
  "In between" starts a title on the edge with the band below.
- All duels are fitted together with Bradley-Terry (`BETA = 1.5`, `PRIOR_GAMES = 3`). A title that keeps
  beating higher-band titles crosses into their band. The model's guess only orders uncompared titles inside
  their band.
- `list_entries.strength` stores the exact unrounded position. Score = `round(clip(strength, 1, 10), 1)`.
  Ties in score are ordered by strength (`byRank` on the web, `(-score, -strength)` on the API).

**Rate page**
- Every answer is a Step in a history stack with its own undo call (`DELETE /api/rate/{id}/tier`,
  `DELETE /api/rate/duel/{id}`, `DELETE /api/rate/{id}/facets`). Back button, Backspace or Ctrl/Cmd+Z.
- "Start rating over" (`POST /api/rate/reset`) clears feelings, scores and duels, keeps titles.

**Speed patterns**
- A `konomi-signed-in` hint in localStorage lets pages fetch in parallel with `/api/me`.
- Retries skip 4xx errors. Rate saves are chained so fast taps land in order.

**Chart export** (newest feature)
- "Save as page" on the chart downloads `konomi-{username}-chart.html`: a self-contained dark page with stats,
  top-3 podium, By score / By season switch, cover links back to Konomi. Code:
  [web/src/features/list/exportChart.ts](../web/src/features/list/exportChart.ts).

**CSS rule learned the hard way**
- In grid, `1fr` means `minmax(auto, 1fr)` and lets inputs push columns past the screen (worse on iOS).
  Use `minmax(0, 1fr)`, and give flexible inputs `width: 0; flex: 1`. Let toolbars `flex-wrap: wrap`.

**Debugging tips**
- The hidden in-app browser pane stops animation frames. Use headless Playwright for galaxy/animation checks.
- On Windows, complex Python in bash heredocs breaks quoting. Write a script file and run it.

---

## 7. Commands

```bash
cd api && .venv/Scripts/python -m pytest -q tests        # API tests (docker compose up, konomi_test migrated)
cd web && npx tsc -b && npm run lint                     # typecheck + lint (6 old warnings are known)
cd web && npm test                                       # search ranking (vitest)
cd web && npm run e2e                                    # E2E, both dev servers running
cd web && node scripts/fit-audit.mjs [--webkit]          # screen-fit audit
sh scripts/pack-artifacts.sh                             # after retraining, then commit the tarball
api/.venv/Scripts/python pipeline/refresh.py             # pull new seasons (needs data/raw + data/cache)
```

Check a deploy is live: the newest JS bundle from `https://konomi.prathampanchal.dev/` contains your change.

---

## 8. Open items

- **Known small bug:** the list upsert does not bump `updated_at` when a title is rated.
- Neon password rotation: confirm with the owner (see section 4).
- Profile ideas waiting for the owner's pick: [docs/profile-ideas.md](profile-ideas.md).
- The owner said they will keep finding bugs and inconsistencies. Expect screenshots from phones; fix the
  class of bug everywhere, not just the one screen.
- Free Render still cold-starts if the keep-alive worker ever stops; check the worker first if the site is slow
  to wake.

## 9. Recent history (newest first)

- `0b70000` Chart export as one HTML page.
- `d52e478` iPhone fit: inputs and phone columns no longer overflow; fit audit can run WebKit.
- `0ab8ec9` Galaxy: picked title framed in free space with all neighbours, labels never overlap.
- `53e1f3c` Same-score titles keep one order everywhere (saved strength).
- `c56e256` Rate: Back/undo; parallel fetch with sign-in; server timing.
- `cdf47f8` Rate: Start rating over.
- `9eb3ca8` One maths thread (7 s → 0.1 s); chart and recs remember sort/filter.
- Before that: soft bands, bulk chart editing with undo, Most popular 500 list, customise page, galaxy, deploy
  to Render/Neon/Resend, the first overnight build. `git log` has all 98+ commits.
