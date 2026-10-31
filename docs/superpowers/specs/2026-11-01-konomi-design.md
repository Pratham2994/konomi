# Konomi — design

Date: 2026-11-01
Owner: Pratham Panchal
Builder: Claude, unattended, overnight (owner asleep — no questions possible during the build)

"Konomi" (好み) means *taste, preference*.

---

## 1. Intent and the why

Konomi is a personal anime list — like MyAnimeList or AniList — built for Pratham first, then for anyone he
shares the link with. Three things make it worth building instead of using MAL:

1. **Adding anime is instant.** Today, adding a show means search → open page → fill a form. In Konomi it
   must feel like ticking things off: type two letters and press Enter, or sweep through a wall of covers
   and tap what you've seen. No lag, ever.
2. **Ratings you can trust.** Pratham's own words: *"I feel like I give everything a 10."* Numeric sliders
   invite inflation. Konomi never asks for a number. It asks short, easy, psychologically sound questions
   (mostly "which did you enjoy more?") and *derives* a score that actually spreads out.
3. **A taste model that genuinely knows you.** Trained on ~57M real MyAnimeList ratings, it learns hidden
   "taste directions" that tags can't describe, places the user among them from their own answers, and
   recommends with reasons. It must feel mind-blowing, not like a "Because you watched Naruto" row.
   It also has a **visual showcase**: a taste galaxy and a nodes-and-edges view of the model at work.

On top of that: a **vibrant, clean, fluid** look (explicitly *not* AI-slop, not a dashboard), a
**customizable profile**, and **effortless sharing**.

This is a fun project, but the model should be meaningfully good — measured, not claimed.

## 2. Goals

### 2.1 Catalog
- Every anime ever: source is `anime-offline-database` (AOD, GitHub releases, ODbL licence, weekly
  updates). Snapshot already downloaded: 41,537 entries (TV 10.9k, Movie 7.0k, ONA 6.8k, OVA 5.3k,
  Special 11.2k), 10.6k from 2021+, lastUpdate 2026-07-04.
- Fields used: title, synonyms, type, episodes, status, season/year, picture, thumbnail, duration,
  score (cross-site), studios, producers, tags, relatedAnime, sources (provider URLs → MAL id, AniList id).
- Anime only. Adult/hentai entries are excluded from the catalog entirely (Kaggle dataset warns it
  contains them; AOD tags include `hentai`).
- Extra details where AOD lacks them (synopsis): from `archive/anime_with_synopsis.csv` (Kaggle, pre-2021)
  and, for newer titles, the public AniList GraphQL API (no key; respect its rate limit; cache results).
- Specials/music videos/recaps stay searchable but are de-emphasised in discovery surfaces.

### 2.2 Accounts
- Email + password only. No OAuth.
- Sign-up sends a **6-digit email OTP** to verify the address; account is usable only after verifying.
- Password reset also via email OTP.
- Passwords hashed with Argon2id. Sessions via httpOnly, Secure, SameSite=Lax cookie.
- Rate limits on login, sign-up, OTP send and OTP verify. OTPs expire (10 min), single use, max attempts.
- Unique, user-chosen **username** (used in the public URL `/u/<username>`).
- Email delivery: **Resend** in production (owner adds key + sender in the morning). In development,
  SMTP to **Mailpit** running in Docker, so OTP mails can be read by tests and by the owner.

### 2.3 Lists
- Statuses: Completed, Watching, Dropped, Plan to watch. (Optional "on hold" is not needed.)
- Watching may track current episode; nothing more granular (no per-episode logs).
- Adding, changing status and removing are optimistic in the UI (instant), synced in the background.

### 2.4 Fast adding (the main thing)
- **Instant search**: a compact search index of the whole catalog (titles + synonyms + year + type +
  thumbnail URL + popularity) is shipped to the browser once and cached (IndexedDB / HTTP cache), so
  search runs locally with zero network round-trips. Fuzzy, typo-tolerant, romaji/English/Japanese
  synonyms. Results ordered by match quality blended with popularity. **Enter adds the top hit** as
  Completed; modifier keys or a small inline control pick another status. Keyboard-first, also works by
  touch.
- **Sweep mode**: a full-screen wall of covers (popular first, grouped by era/season) where tapping or a
  single key marks *Seen / Dropped / Not seen / Want to watch*. Goal: 100 anime in ~5 minutes.
  The next cards are chosen to be informative (popular ones first, then ones related to what was just
  marked — sequels, same-taste neighbours).
- Sequels/related seasons: when a title is marked seen, offer the related seasons in one tap.
- **Imports** (stretch): MAL XML export upload; AniList public username import. Imported scores are
  kept only as a weak prior (they are inflated — that's the whole point).

### 2.5 The rating system ("Konomi score")
Design principles (human psychology):
- **Compare, don't score.** Pairwise "which did you enjoy more?" is fast and far more reliable than
  absolute numbers; it removes the "everything's a 10" ceiling.
- **Verbal anchors over numbers** for the one coarse question.
- **Recognition over recall**: always show covers, never ask the user to remember a title.
- **Ask about memories and behaviour, not abstractions**: "Do you still think about it?", "Would you
  rewatch it?", "Would you tell a friend to watch it?", "Did the ending land?".
- **Always allow "Too close", "Skip", "Don't remember"** — forced answers are noise.
- **Adaptive questioning**: always ask the question with the most information about the user's
  ordering (uncertain neighbours), so ~20 good questions beat 100 random ones.
- **No anchoring by the model**: the model's predicted score is revealed only *after* the user answers.

Flow when an anime is marked Completed (all steps skippable, total ≤ ~15 seconds):
1. One coarse feeling question, 5 verbal options, e.g. *Loved it · Really liked it · It was fine ·
   Not for me · Regret watching*.
2. 2–6 duels against already-rated anime, chosen by binary insertion within the user's ranking
   (adaptive), "Too close" allowed.
3. Optional facet taps (story, characters, animation, music, ending; rewatch?; still think about it?).
   Facets feed the profile/taste DNA, not the score.

Also a **"rate session"** mode: an endless stream of the most informative duels/questions for when the
user has two minutes; works great after Sweep mode bulk-adds things.

Score derivation: a latent strength per (user, anime) fitted from duels (Bradley–Terry/Elo-style) with
the coarse tier as a prior; mapped to a 1.0–10.0 score (one decimal) so the user's scores *spread*
(their best is ~10, median sits mid-scale). Scores update live as more duels come in. The user never
types a number. The builder chooses the exact maths; the property that matters is: ordering respects the
user's answers, and scores are spread and stable.

### 2.6 The taste model
Training data: Kaggle "Anime Recommendation Database 2020" (Hernan4444), extracted in `archive/`:
`rating_complete.csv` (≈57M scored ratings, 310k users, 16.8k anime), `animelist.csv` (≈109M rows incl.
watching/dropped/plan-to-watch statuses), `anime.csv`, `anime_with_synopsis.csv`. Anime keyed by MAL id;
join to AOD via the MAL source URL.

Two models:

**A. Collaborative taste model** (the core). Learns an embedding per anime from 57M ratings and can
place a *new* user in the same space from their list + Konomi scores, cheaply on CPU at request time.
The builder picks the architecture by evaluation — candidates: EASE, Mult-VAE, a transformer/set encoder
over a user's rated items (BERT4Rec/SASRec-style without time), two-tower. Trained on the local
RTX 5070 (12 GB). Must be evaluated honestly on held-out users against baselines (popularity,
item-kNN, EASE) with Recall@20 / NDCG@20 for recommendations and error on held-out ratings for score
prediction. The best model ships; the comparison goes into `docs/model-report.md`.

**B. Content → taste bridge** (cold start). Maps an anime's metadata (tags, studios, type, year,
episodes, duration, synopsis text embedding from a small sentence-embedding model) into model A's
embedding space. Trained on anime that have rating-based embeddings; applied to anime with no or few
ratings (everything after 2020 — ~10.6k titles). Evaluated on held-out anime (does it land near the
right neighbours?).

What the model powers (user-facing):
- **Predicted Konomi score** for any anime, in *the user's own* scale; shown after they rate
  ("Konomi guessed 8.1 — you said 8.4"), with a running accuracy stat on the profile.
- **Recommendations with reasons**: "Because you loved *X* and *Y*" — attribution from the embedding.
  Filters: type, era, length, "hidden gems" (low popularity). Must not just echo top-popular titles.
- **Taste axes / taste DNA**: principal directions of the embedding space, auto-named from tags that load
  on them (e.g. "Melancholy ↔ Hype"); user's position on each.
- **Taste match** between two profiles: % similarity plus "where you differ" (anime you'd fight about).
- Recommendations update live as the user adds/rates.

Serving: exported item embeddings + user-encoder weights loaded by the API (numpy / onnxruntime, CPU).
Item embeddings also stored in Postgres (pgvector) for similarity queries. Raw ratings never leave the
owner's PC.

Retraining on Konomi's own users' data later is a goal for the design (keep a script), not for tonight.

### 2.7 Visual showcase
- **Taste Galaxy**: every catalog anime as a star, positioned by a 2D/3D projection (e.g. UMAP) of the
  embeddings, clustered and labelled; WebGL (Three.js), smooth camera, hover shows cover/title, click opens
  the anime. The user's anime light up; their taste glows as a region; recommendations are bright
  unvisited stars inside it. Watching it shift as you answer questions is part of the magic.
- **Model view**: a stylised nodes-and-edges network: the user's anime (input nodes) → taste axes
  (hidden nodes) → recommendations (output nodes), edge thickness = contribution, animated. Honest to
  the model's real numbers, not decoration.
- Both live on a "Taste" page; a small galaxy appears on the profile.

### 2.8 Profile and sharing
- **Private by default.** Toggle to public; only then `/u/<username>` is viewable by anyone (logged in
  or not). Private profile URL shows a neutral "this profile is private" page.
- Contents: header (display name, avatar, banner from a chosen anime's art, accent colour), favourites
  showcase (user-picked, default = top Konomi scores), stats (count by status, hours watched from
  episodes × duration, top studios, favourite era), taste DNA, mini galaxy, full list with filters/sort.
- **Customizable**: accent colour, banner, avatar, which favourites are showcased, section order /
  visibility.
- **Shareable**: a polished Open Graph image per public profile (link previews on WhatsApp/Discord/X),
  a downloadable share card image, copy-link button. Logged-in visitors see a Taste match with the owner.

Owner's note: banners, colours and favourites are what every site does. The profile should be *more
innovative* than that. Tonight: build a strong first version; owner and Claude iterate on profile ideas
together afterwards.

### 2.9 Look and feel
- **Every screen designed for these sizes**, always, not as an afterthought: phones of all sizes
  (≈360–430 px wide), 13" laptop (≈1280×800), 14" laptop (≈1440–1536 wide), 15.6" laptop
  (≈1366–1920 wide), 24" monitor (1920×1080), 27" monitor (2560×1440). Large screens must use the
  space well (not a thin centred column), phones must not feel like a squeezed desktop.
- **Easy to understand**: a first-time user knows what to do on every screen without explanation.
- Vibrant but clean: lots of real cover art, colour pulled from covers (dynamic accent per anime),
  confident editorial typography, generous spacing.
- **Fluid**: shared-element transitions (cover → detail), spring-based motion, smooth scrolling, nothing
  janky; 60 fps; respects `prefers-reduced-motion`.
- Dark-first with a light theme.
- Mobile works well (phones are where people share).
- Anti-slop: no generic purple gradients, glassmorphism soup, emoji-as-icons, centred-hero template,
  or dashboard-card grids.
- Credit AOD (ODbL) and MAL data source in the footer/about page.

## 3. Non-goals (v1)
- Manga, non-anime TV, Hollywood/Bollywood (planned later — keep the schema generic enough not to block it).
- OAuth / social login.
- Following, feeds, comments, likes.
- Per-episode logs, reviews, forums.
- Native mobile apps.
- Deploying to the internet tonight (owner deploys with Claude afterwards).

## 4. Anti-goals (failure even if it "works")
- Adding an anime takes more than ~2 seconds, or any visible lag/spinner in search.
- The rating flow feels like a form or a survey; or scores still bunch at the top.
- Recommendations are basically the popularity chart.
- The site looks like a generic AI-generated template or an admin dashboard.
- Adult/hentai content appears anywhere.
- Raw MAL rating data is uploaded to the cloud DB or committed to git.
- Secrets committed to git.

## 5. Constraints
- **Unattended overnight build.** No human available; nothing may block on a prompt. Owner is in auto
  permission mode.
- **Machine**: Windows 11, RTX 5070 12 GB (CUDA, Blackwell — needs a recent PyTorch CUDA build),
  Python 3.14 system install (use an isolated venv; pin a Python version PyTorch supports), Node 24,
  Docker Desktop 29 (running), ~250 GB free on D:.
- **Databases**: local Postgres 18 + pgvector in Docker for all development and tests. Neon Postgres 18
  (Singapore, free tier, 1 GB) is production; its URLs are in `.env` (`DATABASE_URL`,
  `DATABASE_URL_POOLED`). Neon holds only: catalog (~41k rows), embeddings (~41k × d floats), user data.
- **Email**: Mailpit in Docker for dev/test; Resend in production (not configured tonight).
- **Licences**: AOD is ODbL (attribution, share-alike on the database). Kaggle MAL data is used only to
  train; not redistributed.
- **Git**: initialise a repo; `.env`, `archive/`, raw data are ignored. Commits use the owner's git
  identity with no AI co-author trailer (owner's global rule).

## 6. Decided "how" (owner's decisions)
- Anime only, all types, all time.
- Email + password accounts with email OTP; no OAuth.
- Profiles private by default; public toggle makes the link work for anyone.
- Postgres (Neon) instead of MongoDB.
- Use the 2020 Kaggle ratings for training; newer anime handled by the content bridge.
- Build happens overnight on this PC, using its GPU.

## 7. Builder's calls (made by Claude, owner may override)
- Stack: React + TypeScript + Vite, React Router, TanStack Query; Motion for UI transitions, GSAP for
  showcase moments, Three.js (react-three-fiber) for the galaxy, Lenis for scroll.
- API: FastAPI (Python), SQLAlchemy + Alembic, asyncpg/psycopg; Argon2 via `argon2-cffi`.
- ML: PyTorch (CUDA) for training; pandas/polars for the 57M-row pipeline; onnxruntime/numpy for serving.
- pgvector for embedding similarity.
- Docker Compose for local Postgres + Mailpit.
- Dark-first theme.
- E2E tests with Playwright on the main flows (sign-up with OTP via Mailpit, quick add, rate, recs,
  public/private profile). **Owner's rule: run E2E only when absolutely required** (feature complete /
  major milestone), not after every change. Few or no unit tests except for score maths and model
  evaluation.
- **Score bands** (proposed to owner, no objection): the feeling answer sets a band, duels order titles
  within and across bands — Loved it 8.5–10, Really liked 7–8.9, Fine 5–7, Not for me 3–5,
  Regret 1–3. A short or all-"Loved" list stays honest (no forced low scores). Older scores in a band
  may shift slightly when new titles arrive. Predicted scores are in this same scale; taste match
  compares rank/embedding, not raw scores.
- **Adult content line** (proposed, no objection): remove hentai / MAL "Rx" titles from catalog *and*
  training data; keep ecchi ("R+") titles.
- **Time budget**: assume ~8 hours unattended. GPU training may keep running after the owner wakes.
  Train baselines + 2–3 strongest candidates rather than everything; time-box each run.
- **Git**: commit often with short one-line messages, no description, no co-author or AI trailer; push to
  `origin` (github.com/Pratham2994/konomi) whenever useful. Branch: `master`.
- **Installs**: Claude installs everything itself (owner approved): PyTorch CUDA (cu128 wheel, Python
  3.13 venv via uv), Python/npm packages, Docker images `pgvector/pgvector:pg18`, `axllent/mailpit`.
- Seeded demo account for local testing (credentials in a seed/example config file, not in chat).

- **Neon is not touched tonight.** No migrations, seeds or writes to Neon during the overnight build;
  code must only ever use the local Docker DB unless explicitly pointed at Neon. The morning README
  covers "migrate + seed Neon" as one step.
- **Cover images are hotlinked** from the provider CDNs (AOD `picture`/`thumbnail`). Dominant colours are
  extracted once in the data pipeline and stored with the catalog. OG/share images fetch thumbnails at
  render time and are cached; no production file storage tonight.

## 8. Left to the builder
- Exact model architecture, hyper-parameters, embedding size — chosen by measured evaluation.
- Exact score-fitting maths and question-selection strategy (must satisfy §2.5 properties).
- Visual design system details (fonts, palette, components) within §2.9. Use the impeccable design skill.
- Project layout, API shape, DB schema.
- Build order. Suggested: data pipeline → start model training on the GPU early (long job, run in
  background) → auth → quick add + lists → rating system → recommendations → profile + sharing →
  galaxy + model view → imports (stretch).

## 9. Definition of done for the overnight build
- `docker compose up` + one command each for API and web runs the whole app locally.
- All §2 goals working locally, except where marked stretch; anything unfinished is listed honestly.
- `docs/model-report.md` with the evaluation table vs baselines.
- Playwright E2E suite for main flows passes.
- A morning README: how to run, what's done, what's not, next steps (Resend key, deploy).
