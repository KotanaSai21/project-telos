# Project Telos - one Cloud Run service hosting the web app and the API.
# Build:  docker build -t project-telos .
# Run:    docker run -p 8080:8080 --env-file .env project-telos

# --- Stage 1: build the React web app -------------------------------------
FROM node:22-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build

# --- Stage 2: Python API that also serves the built web app ---------------
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# The API locates the repo root by package.json + packages/, and reads contract
# schemas and the reviewed demo corpus (JSON only) at runtime.
COPY package.json ./
COPY packages/contracts/schemas packages/contracts/schemas
COPY corpus corpus
COPY services/api services/api
RUN pip install -e "services/api[google,cloud]" \
    && find corpus -type f ! -name "*.json" -delete

COPY --from=web /app/apps/web/dist /app/web

RUN useradd --system --uid 10001 --home /app telos \
    && mkdir -p /tmp/project-telos \
    && chown -R telos /tmp/project-telos
USER telos

# Twelve-factor: every other setting comes from the environment at deploy time.
ENV PROJECT_TELOS_ENV=production \
    PROJECT_TELOS_WEB_DIST=/app/web \
    PROJECT_TELOS_LOCAL_DATA_DIR=/tmp/project-telos \
    PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "exec uvicorn project_telos_api.main:create_app --factory --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
