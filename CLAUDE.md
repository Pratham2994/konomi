# Konomi

Anime list with a taste model. Live at https://konomi.prathampanchal.dev (Render free, Neon, Cloudflare, Resend).
React 19 + Vite + TanStack Query in `web/`, FastAPI + SQLAlchemy + Alembic in `api/`.

**Read [docs/HANDOFF.md](docs/HANDOFF.md) before the first change.** It has the live setup, new-device setup,
the owner's design taste, how scoring works, commands and open items.

## Rules from the owner

- Talk in ASD-STE100 Simplified Technical English: short sentences, simple words. The owner types fast with typos.
- Commits: one short line, no body, owner's git identity only. No Co-Authored-By or any Claude/AI mention.
  Push to `master` is allowed and deploys live. Never force-push. Never commit `.env` or secrets.
- Live speed and live behaviour matter most. Measure on the live site (`Server-Timing` header), not only locally.
- Do not write to the owner's live account (`/u/pratham`) or create live accounts unless asked right then.
  Report every live action you take.
- E2E only when a feature is done. Do not run tests after every small change.
- Every UI change must fit phones 360–430 px (iPhone too), 13–16" laptops, 24"/27" monitors.
  Grid columns: `minmax(0, 1fr)`, never bare `1fr` next to inputs. `web/scripts/fit-audit.mjs [--webkit]`.
- Design: vibrant, clean, fluid, dark-first, cover-art driven. No AI-slop templates, no em dashes in copy.
  Remember small settings (`useStored`). Plain words over jargon.
- Free plans only. Anime only for now (`media_type` exists for later).
- Keep `OMP/OPENBLAS/MKL_NUM_THREADS=1` in the Dockerfile (7 s → 0.1 s live).
- After a new migration, migrate the `konomi_test` database too before running API tests.
