# Backend (@scheduler/backend) production image for Coolify.
# Build context is the repo root so the pnpm workspace + lockfile are available:
#   docker build -f apps/backend/Dockerfile .
#
# In Coolify (Application → Dockerfile):
#   Dockerfile location: /apps/backend/Dockerfile   Base directory: /
#   Ports exposes: 3100

# ---- Build stage: install all deps and compile the backend ----
FROM node:22-slim AS build
WORKDIR /app

# pnpm via corepack (version pinned by the root package.json "packageManager")
RUN corepack enable

# Copy workspace manifests first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/

RUN pnpm install --frozen-lockfile

# Compile the backend only (nest build → apps/backend/dist)
COPY . .
RUN pnpm --filter @scheduler/backend build

# ---- Runtime stage: production deps + compiled output ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

# Reinstall production-only dependencies against the committed lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/
RUN pnpm install --filter @scheduler/backend --prod --frozen-lockfile

# Compiled JS (includes dist/main.js, dist/database/migrate.js and the migrations)
COPY --from=build /app/apps/backend/dist ./apps/backend/dist

WORKDIR /app/apps/backend
EXPOSE 3100

# Run migrations (idempotent) and then start the API. If migrations fail the
# container exits non-zero and the API never starts.
CMD ["sh", "-c", "node dist/database/migrate.js && node dist/main"]
