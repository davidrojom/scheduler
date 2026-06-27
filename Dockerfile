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

# Copy sources
COPY . .

# Angular embeds its environment at build time, so the backend API/WebSocket URLs
# are injected here as build args and written into environment.prod.ts before the
# production build (which swaps environment.ts → environment.prod.ts).
# In Coolify set these as Build Args on the frontend application.
ARG API_BASE_URL=http://localhost:3100/api
ARG WS_URL=http://localhost:3100
RUN printf "export const environment = {\n  production: true,\n  apiBaseUrl: '%s',\n  wsUrl: '%s',\n};\n" \
      "$API_BASE_URL" "$WS_URL" > apps/frontend/src/environments/environment.prod.ts

# Build the frontend only
RUN pnpm --filter @scheduler/frontend build

# Serve the static SPA with nginx (try_files fallback so deep links / the OAuth
# /auth/callback route resolve to index.html instead of 404).
FROM nginx:1.27-alpine AS runtime
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist/scheduler/browser /usr/share/nginx/html
EXPOSE 80
