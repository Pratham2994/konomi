# One service: FastAPI serves the API and the built web app.
# Build:  docker build -t konomi .
# After retraining or a catalogue refresh, run scripts/pack-artifacts.sh and commit deploy/konomi-artifacts.tar.gz.

FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM python:3.13-slim
# MALLOC_ARENA_MAX: glibc otherwise grows a memory pool per worker thread, which alone can blow a 512 MB host.
# One maths thread: the host shows ~20 cores but gives a fraction of one, so numpy's thread pool fights itself
# (one taste guess took 7 s live instead of 0.1 s).
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MALLOC_ARENA_MAX=2 \
    OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
WORKDIR /app/api
COPY api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Taste-model artifacts: committed as deploy/konomi-artifacts.tar.gz (scripts/pack-artifacts.sh), ~78 MB.
COPY deploy/konomi-artifacts.tar.gz /tmp/artifacts.tar.gz
RUN python -c "import tarfile; tarfile.open('/tmp/artifacts.tar.gz').extractall('/app/data/build', filter='data')"  && rm /tmp/artifacts.tar.gz && test -f /app/data/build/artifacts/items.parquet
COPY api/ ./
COPY --from=web /web/dist /app/web/dist
RUN useradd --create-home konomi && chown -R konomi /app
USER konomi
EXPOSE 8000
# Pending database migrations run first on every start, so a deploy never meets an older schema.
# Behind Render/Cloudflare: trust the proxy's forwarded client address so rate limits key on real users.
CMD ["sh", "-c", "alembic upgrade head && uvicorn konomi_api.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
