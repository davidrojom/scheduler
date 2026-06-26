# Scheduler Backend

NestJS 11 + [Kysely](https://kysely.dev/) + PostgreSQL API for the Event Scheduler project. It serves a
REST API under the global `/api` prefix on port `3100` and a Socket.IO `/collab` namespace for real-time
collaboration (live board edits and presence cursors). The database is **snake_case** throughout, while the
REST and WebSocket JSON payloads are **camelCase**; the mapping happens at the API/DTO boundary. Kysely runs
**without** `CamelCasePlugin` (the `DB` type definitions are hand-written in snake_case).

This is the `@scheduler/backend` package of the pnpm monorepo (it lives in `apps/backend`). The Angular
frontend is `@scheduler/frontend` in `apps/frontend` (port `4200`) and is unaffected by anonymous,
logged-out usage; the DB-backed path is additive and used only when a user is authenticated.

## Requirements

- Node.js 22+ and pnpm 10+
- PostgreSQL 16, with two databases:
  - `scheduler` for development
  - `scheduler_test` for the e2e test suite
  - The easiest way to get both is the repo-root `docker-compose.yml` (see below); a
    native local Postgres works too.

## Setup

Install dependencies once from the **repo root** (single workspace lockfile):

```bash
pnpm install
```

All commands below can be run from the repo root with `pnpm --filter @scheduler/backend <script>`.

Copy the example environment file and adjust values as needed:

```bash
cp .env.example .env
```

### Environment variables

`.env` is gitignored; `.env.example` is versioned and contains placeholders only. Never commit secrets.

| Variable | Purpose |
| --- | --- |
| `PORT` | Port the API listens on. Defaults to `3100`. |
| `DATABASE_URL` | PostgreSQL connection string used by the Kysely `pg.Pool` (e.g. the local `scheduler` database). |
| `JWT_SECRET` | Secret used to sign and verify JWTs. Use a long random value. |
| `GOOGLE_CLIENT_ID` | Google OAuth client id. Optional placeholder for local dev. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. Optional placeholder for local dev. |
| `GOOGLE_CALLBACK_URL` | OAuth callback URL, e.g. `http://localhost:3100/api/auth/google/callback`. |
| `FRONTEND_URL` | Frontend origin (`http://localhost:4200`). Used for CORS and the post-login redirect. |
| `AUTH_TEST_MODE` | When `true`, enables the local impersonation login path (`POST /api/auth/impersonate`). Must be `false` or removed in production. |

The Google credentials are optional placeholders for local development; the real consent flow is not
exercised by the automated tests. Setting `AUTH_TEST_MODE=true` enables a test-only impersonation endpoint
that mints a JWT for any email so that authenticated flows can be validated locally. The impersonation
endpoint is inert (returns 404/403) unless `AUTH_TEST_MODE === 'true'`, and it must never be enabled in
production.

## Database & migrations

Create the two databases (names must match `DATABASE_URL` for dev, and `scheduler_test` for e2e).

**Option A — Docker (recommended).** From the repo root, start Postgres 16 with both databases
created automatically (the init script also enables `pgcrypto`):

```bash
docker compose up -d        # postgres on localhost:5432, user/password: postgres/postgres
```

**Option B — native Postgres.**

```bash
createdb scheduler
createdb scheduler_test
```

Run the Kysely migrations (the migrate script loads `apps/backend/.env`, runs with `tsx`, and ensures the
`pgcrypto` extension exists for `gen_random_uuid()`):

```bash
pnpm --filter @scheduler/backend migrate
```

### Schema overview

All tables use uuid primary keys with `created_at`/`updated_at` timestamps where applicable; foreign keys
cascade on delete. Columns are snake_case.

- **users**: `id`, `google_id` (unique, nullable), `email` (unique), `name`, `avatar_url`.
- **boards**: `id` (client-provided or generated), `owner_id` -> users, `name`, `config` jsonb
  (`{ dayStartHour, dayEndHour, segmentsByHour, logo? }`).
- **board_members**: composite pk (`board_id`, `user_id`), `role` in (`owner`, `editor`, `viewer`).
- **board_invites**: `id`, `board_id`, `token` (unique), `role` in (`editor`, `viewer`), `created_by`,
  `expires_at` (nullable), `revoked` boolean.
- **columns**: `id` (client-provided), `board_id`, `title`, `position`.
- **tasks**: `id` (client-provided), `board_id`, `column_id`, `title`, `start_hour`, `end_hour`,
  `participants` text[], `position`. Task times are stored as non-zero-padded `"H:M"` strings (for example
  `"9:5"`); the frontend fabricates a `Date` against today on read.
- **participants**: `id`, `board_id`, `name`, unique on (`board_id`, `name`).

## Running

Development (watch mode):

```bash
pnpm --filter @scheduler/backend start:dev
```

Health check:

```bash
curl -sf http://localhost:3100/api/health   # -> { "status": "ok" }
```

Production build and start:

```bash
pnpm --filter @scheduler/backend build
pnpm --filter @scheduler/backend start:prod
```

## Modules overview

- **database**: Global module providing a hand-rolled Kysely instance (injection token `KYSELY`) over a
  single `pg.Pool`. Destroys the pool on application shutdown. Holds the snake_case `DB` types and the
  Kysely migrations.
- **auth**: Google OAuth (`passport-google-oauth20`) plus JWT issuance/verification (`@nestjs/jwt` +
  `passport-jwt`). Provides `JwtAuthGuard`, the `@CurrentUser()` decorator, and a test-mode impersonation
  endpoint guarded by `TestModeGuard` (active only when `AUTH_TEST_MODE=true`).
- **users**: User repository with upsert-by-Google, upsert-by-email (impersonation), and find-by-id.
- **boards**: Board lifecycle plus board content (columns, tasks, participants). Access is gated by a
  `BoardRoleGuard` that checks membership in `board_members`. All routes require JWT.
- **invites**: Shareable invite links with a role guard. Owners/editors create invite tokens; accepting an
  invite adds the current user to `board_members` with owner > editor > viewer ranking and a no-downgrade
  rule (an existing higher role is preserved; the owner is never altered).
- **collaboration**: Socket.IO gateway on the `/collab` namespace. Validates the JWT on connection, manages
  per-board rooms and presence, enforces roles server-side, persists mutations through the same content
  services as REST, and broadcasts authoritative results to the board room (last-write-wins).

## API surface

All routes are prefixed with `/api`. Unless noted, board routes require a JWT and enforce board membership
and role server-side.

### Health

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | Liveness probe. Returns `{ status: "ok" }`. |

### Auth

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/auth/google` | Initiates Google OAuth (302 redirect to Google). |
| GET | `/api/auth/google/callback` | OAuth callback; signs a JWT and redirects to `${FRONTEND_URL}/auth/callback?token=<jwt>`. |
| POST | `/api/auth/impersonate` | Test-only. Body `{ email, name? }` -> `{ token, user }`. Inert unless `AUTH_TEST_MODE=true`. |
| GET | `/api/auth/me` | JWT. Returns `{ id, email, name, avatarUrl }`. |

### Boards

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/boards` | Member. Lists boards for the user, each with `myRole`. |
| POST | `/api/boards` | Authenticated. Creates a board (client-provided id accepted) and an owner membership. |
| POST | `/api/boards/import` | Authenticated. Body `{ boards: [...] }`; imports local boards, skipping ids that already exist. |
| GET | `/api/boards/:id` | Member (owner/editor/viewer). Full board payload. |
| PATCH | `/api/boards/:id` | owner/editor. Updates `name`/`config`. |
| DELETE | `/api/boards/:id` | owner only. |

### Board content (owner/editor; viewer -> 403)

| Method | Path |
| --- | --- |
| POST | `/api/boards/:id/columns` |
| PATCH | `/api/boards/:id/columns/reorder` (body `{ orderedIds }`) |
| PATCH | `/api/boards/:id/columns/:columnId` |
| DELETE | `/api/boards/:id/columns/:columnId` |
| POST | `/api/boards/:id/tasks` |
| PATCH | `/api/boards/:id/tasks/:taskId` |
| DELETE | `/api/boards/:id/tasks/:taskId` |
| POST | `/api/boards/:id/participants` (body `{ name }`) |
| DELETE | `/api/boards/:id/participants` (body `{ name }`) |

### Invites

| Method | Path | Role |
| --- | --- | --- |
| POST | `/api/boards/:id/invites` | owner/editor. Body `{ role }` where role is `editor` or `viewer` -> `{ token, role, url }`. |
| DELETE | `/api/boards/:id/invites/:inviteId` | owner. Revokes an invite. |
| GET | `/api/invites/:token` | Public-ish. Returns invite info `{ boardId, boardName, role, valid }`. |
| POST | `/api/invites/:token/accept` | JWT. Adds the current user as a member; returns `{ boardId }`. |

### Socket.IO `/collab` events

Clients connect to `${WS_URL}/collab` with the JWT in the handshake `auth.token` (or an
`Authorization: Bearer` header). Invalid tokens are rejected on connect. Content mutation events require
owner/editor; viewers receive an `error { code: 'FORBIDDEN' }`.

Client to server:

- Rooms/presence: `board:join`, `board:leave`, `cursor:move`
- Columns: `column:create`, `column:update`, `column:delete`, `column:reorder`
- Tasks: `task:create`, `task:update`, `task:delete`
- Participants: `participant:add`, `participant:remove`
- Board: `board:update`

Server to client:

- Presence: `presence:sync`, `presence:joined`, `presence:left`
- Cursors: `cursor:moved`
- Columns: `column:created`, `column:updated`, `column:deleted`, `column:reordered`
- Tasks: `task:created`, `task:updated`, `task:deleted`
- Participants: `participant:added`, `participant:removed`
- Board: `board:updated`
- Errors: `error` (`{ code, event, message }`)

Mutations are persisted first, then broadcast to the `board:<boardId>` room as the authoritative entity
(last-write-wins). REST content mutations broadcast to the same room so REST and WS edits stay consistent.
Presence cursors are ephemeral and never persisted.

## Roles & permissions

Roles are ranked owner > editor > viewer:

- **owner**: full access, can delete the board and manage invites.
- **editor**: can edit content, rename the board, change config, and create invites.
- **viewer**: read-only; receives live updates and presence but cannot mutate anything.

Role enforcement is server-side on every REST and WS mutation (the client is never trusted). Accepting an
invite never downgrades an existing higher role, and the owner is never altered by invites.

## Testing

```bash
pnpm --filter @scheduler/backend test          # Jest unit tests
pnpm --filter @scheduler/backend test:e2e      # Supertest e2e tests against the scheduler_test database
```

Use `--runInBand` to run tests serially (recommended for the DB-backed e2e suite):

```bash
pnpm --filter @scheduler/backend test -- --runInBand
pnpm --filter @scheduler/backend test:e2e -- --runInBand
```

Migrations must be applied to `scheduler_test` before running the e2e suite.
