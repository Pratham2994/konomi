# One service: FastAPI serves the API and the built web app.
# Build:  docker build --build-arg ARTIFACTS_URL=<url of konomi-artifacts.tar.gz> -t konomi .   (required in production)
# The taste-model artifacts (~110 MB) are not in git; scripts/pack-artifacts.sh makes the tarball.

FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/api
COPY api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Production: pass ARTIFACTS_URL so the image carries the model. Without it, mount the artifacts at
# /app/data/build/artifacts at run time (local testing).
ARG ARTIFACTS_URL=""
RUN if [ -n "$ARTIFACTS_URL" ]; then \
      python -c "import io,sys,tarfile,urllib.request; tarfile.open(fileobj=io.BytesIO(urllib.request.urlopen(sys.argv[1]).read())).extractall('/app/data/build', filter='data')" "$ARTIFACTS_URL" \
      && test -f /app/data/build/artifacts/items.parquet; \
    fi
COPY api/ ./
COPY --from=web /web/dist /app/web/dist
RUN useradd --create-home konomi && chown -R konomi /app
USER konomi
EXPOSE 8000
# Behind Render/Cloudflare: trust the proxy's forwarded client address so rate limits key on real users.
CMD ["sh", "-c", "uvicorn konomi_api.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
