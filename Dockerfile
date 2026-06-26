# Builds the Angular frontend (@scheduler/frontend) from the pnpm workspace.
# Build context is the repo root so the workspace + lockfile are available.
FROM node:lts AS build
WORKDIR /app

# pnpm via corepack (version pinned by package.json "packageManager")
RUN corepack enable

# Copy workspace manifests first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/

# Install workspace deps against the committed lockfile
RUN pnpm install --frozen-lockfile

# Copy sources and build the frontend only
COPY . .
RUN pnpm --filter @scheduler/frontend build

FROM httpd:2.4 AS runtime
COPY --from=build /app/apps/frontend/dist/scheduler/browser /usr/local/apache2/htdocs/
EXPOSE 80
