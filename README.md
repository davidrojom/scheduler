# 📅 Event Scheduler

<div align="center">

An intuitive web-based scheduler for managing multi-location events with participant tracking and export capabilities, now full-stack with an optional NestJS + PostgreSQL backend for accounts, database persistence, and real-time collaboration.

[![Angular](https://img.shields.io/badge/Angular-18-DD0031?style=flat&logo=angular)](https://angular.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat&logo=nestjs)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Features](#-features) • [Architecture](#-architecture) • [Getting Started](#-getting-started) • [Scripts](#-scripts) • [Testing](#-testing) • [Tech Stack](#-tech-stack)

</div>

---

## ✨ Features

### 📍 **Multi-Location Scheduling**

- Create and manage multiple locations/rooms/stages (columns)
- Drag-and-drop reordering of locations
- Visual organization of concurrent events

### 👥 **Participant Management**

- Add and manage participants across all events
- Assign multiple participants to each task
- Track participant schedules and workload
- Prevent scheduling conflicts for the same participant
- Detailed participant statistics with task breakdown

### 📊 **Smart Scheduling**

- Multiple projects (boards)
- Drag-and-drop task creation and repositioning
- Resize tasks to adjust duration
- Visual time-based calendar view
- Adjustable interval precision
- Time conflict detection for participants

### 📥 **Powerful Export Options**

- **Screenshot Export**: Capture entire schedule as PNG
- **Bulk Export**: Download all participant schedules as ZIP of individual PDFs with task details
- **Share Configuration**: Export/import via base64-encoded JSON, no server required

### 🔐 **Optional Google Login**

- Sign in with Google to unlock accounts and persistence; the app stays fully usable anonymously
- A built-in impersonation/test-mode path (`AUTH_TEST_MODE`) provides a local login flow for development and automated testing without the real Google consent screen

### 💾 **Persistence Model**

- **Anonymous users**: schedules are saved to `localStorage`, exactly as before, with no backend calls
- **Logged-in users**: boards persist to PostgreSQL and survive reloads and devices
- **First-login migration**: existing local boards are imported into your account once (idempotent), and local data is preserved, just no longer used while authenticated

### 🤝 **Collaborative Boards**

- Share a board through a generated invite link
- Assign an **owner / editor / viewer** role per invite
- Viewers are read-only: editing, dragging, resizing, and creation are disabled
- Role enforcement happens server-side on every change

### ⚡ **Real-Time Collaboration**

- Live sync over a Socket.IO `/collab` gateway: tasks, columns, and participants update instantly across collaborators
- Live presence and **collaborator cursors** rendered on the board, each with a per-user color and name label
- Last-write-wins per entity; presence cursors are ephemeral and never persisted

---

## 🏗 Architecture

The project is a monorepo: the Angular app lives at the repository root and the NestJS backend lives in `backend/`. Anonymous use requires only the frontend; the backend is additive and selected only when a user is authenticated.

```
┌──────────────────────────┐        REST  /api        ┌──────────────────────────┐
│  Frontend (Angular 18)   │ ───────────────────────▶ │   Backend (NestJS 11)    │
│  http://localhost:4200   │                          │  http://localhost:3100   │
│                          │ ◀──────────────────────  │  global prefix: /api     │
│  localStorage (anon)     │   Socket.IO  /collab     │                          │
└──────────────────────────┘ ◀──────────────────────▶ └────────────┬─────────────┘
                                                                    │ Kysely + pg
                                                                    ▼
                                                       ┌──────────────────────────┐
                                                       │   PostgreSQL 16          │
                                                       │  localhost:5432          │
                                                       │  dbs: scheduler,         │
                                                       │       scheduler_test     │
                                                       └──────────────────────────┘
```

- **Frontend** (`:4200`): Angular 18 SPA. Anonymous boards live in `localStorage`; authenticated boards are read/written via REST and synced in real time over WebSockets.
- **Backend** (`:3100`, API prefix `/api`): NestJS REST API plus a Socket.IO gateway on the `/collab` namespace. Health endpoint at `http://localhost:3100/api/health`.
- **Database** (`:5432`): PostgreSQL accessed through Kysely with a `pg` pool.

**Naming convention:** the database is **snake_case**; REST and WebSocket JSON payloads are **camelCase**, mapped at the API boundary. Kysely is used directly (no `CamelCasePlugin`).

### Backend modules

| Module                | Responsibility                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `DatabaseModule`      | Global Kysely provider (token `KYSELY`) over a `pg.Pool`; migrations and shutdown hook          |
| `AuthModule`          | Google OAuth + JWT, `JwtAuthGuard`, `GET /api/auth/me`, and test-only `POST /api/auth/impersonate` |
| `UsersModule`         | User repository (upsert by Google id / email, find by id)                                       |
| `BoardsModule`        | Boards plus their content (columns, tasks, participants) with membership/role enforcement, `POST /api/boards/import` |
| `InvitesModule`       | Shareable invite links, role assignment, and invite acceptance                                  |
| `CollaborationModule` | Socket.IO `/collab` gateway: JWT handshake, board rooms, entity ops, and presence cursors       |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or higher (developed on Node 20) and npm
- **PostgreSQL** 16 running locally on port `5432`

### 1. Clone and install

```bash
git clone https://github.com/davidrojom/scheduler.git
cd scheduler

# Frontend (repo root)
npm install

# Backend
cd backend && npm install
cd ..
```

> The frontend alone is enough to run the app anonymously. The steps below add the backend for accounts, persistence, and collaboration.

### 2. Create the databases

```bash
createdb scheduler
createdb scheduler_test   # used by the backend e2e tests
```

### 3. Configure the backend environment

Copy the example file and adjust as needed:

```bash
cp backend/.env.example backend/.env
```

| Variable               | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `PORT`                 | Backend port (`3100`)                                                       |
| `DATABASE_URL`         | PostgreSQL connection string for the `scheduler` database                   |
| `JWT_SECRET`           | Secret used to sign JWTs (use a long random value)                          |
| `GOOGLE_CLIENT_ID`     | Google OAuth client id (optional placeholder for local dev)                 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (optional placeholder for local dev)             |
| `GOOGLE_CALLBACK_URL`  | OAuth callback, e.g. `http://localhost:3100/api/auth/google/callback`       |
| `FRONTEND_URL`         | Frontend origin for CORS and redirects (`http://localhost:4200`)            |
| `AUTH_TEST_MODE`       | When `true`, enables the local impersonation login path (`/api/auth/impersonate`) |

> The Google credentials are optional and may stay as placeholders for local development; the real consent flow is not required. Set `AUTH_TEST_MODE=true` to enable the local impersonation login path used for development and automated testing. The impersonate endpoint is inert unless `AUTH_TEST_MODE=true`. `backend/.env` is gitignored, only `backend/.env.example` is versioned, never commit secrets.

### 4. Run database migrations

```bash
cd backend && npm run migrate
```

### 5. Start the backend

```bash
cd backend && PORT=3100 npm run start:dev
```

Verify it is up: `http://localhost:3100/api/health`.

### 6. Start the frontend

```bash
npm start
```

Open `http://localhost:4200`.

---

## 📜 Scripts

### Frontend (repo root)

| Command              | Description                                      |
| -------------------- | ------------------------------------------------ |
| `npm start`          | Start dev server on localhost:4200               |
| `npm run start:host` | Start dev server accessible on network (0.0.0.0) |
| `npm run build`      | Production build to `dist/scheduler`             |
| `npm run watch`      | Development build with watch mode                |
| `npm test`           | Run Karma/Jasmine tests                          |
| `npm run lint`       | Run ESLint (angular-eslint)                      |

### Backend (`backend/`)

| Command               | Description                                       |
| --------------------- | ------------------------------------------------- |
| `npm run start:dev`   | Start NestJS in watch mode (`nest start --watch`) |
| `npm run start`       | Start NestJS once                                 |
| `npm run build`       | Build to `dist/`                                  |
| `npm run migrate`     | Apply Kysely migrations (`tsx scripts/migrate.ts`) |
| `npm test`            | Run Jest unit tests                               |
| `npm run test:e2e`    | Run Jest e2e tests (supertest) against `scheduler_test` |
| `npm run lint`        | Run ESLint                                        |

---

## 🧪 Testing

### Frontend (Karma / Jasmine)

```bash
npm test -- --watch=false
```

Headless Chrome example:

```bash
CHROME_BIN=/usr/bin/google-chrome npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
```

### Backend (Jest)

```bash
cd backend
npm test -- --runInBand            # unit tests
npm run test:e2e -- --runInBand    # e2e tests against scheduler_test
```

The e2e suite runs against the real `scheduler_test` database, so make sure it exists and migrations have been applied.

---

## 📖 Usage

### Creating Your First Schedule

1. **Add Locations (Columns)**: click "Add Column", name it (e.g. "Main Stage", "Room A"), and drag to reorder.
2. **Add Participants**: open "Manage Participants" and add names to your board.
3. **Create Tasks**: click the calendar to create a task, set its title, assign participants, and adjust time by dragging.
4. **Manage Your Schedule**: drag tasks between columns, resize to change duration, edit by clicking, and delete as needed.

### Participant Statistics

- Total time scheduled per participant
- Complete task breakdown with times and locations
- Task count and distribution
- Remove participants from tasks or delete them entirely

### Sharing & Collaboration

- **Offline share**: export a base64 configuration and import it elsewhere, no account needed.
- **Live collaboration** (logged in): generate an invite link, choose a role (editor or viewer), and share it. Collaborators who open `/join/<token>` join the board and see live updates and each other's cursors. Viewers have read-only access.

---

## 📥 Export Options

### Screenshot Export

- Captures the entire schedule grid as PNG
- High-resolution output, ideal for quick sharing and presentations

### PDF Export (Individual Participants)

- One PDF per participant showing their assigned tasks
- Includes task names, times, locations, and durations
- Bundled into a single ZIP file

### Share Configuration

- Generates a shareable base64 code
- No server required, all data lives in the code

---

## 🛠 Tech Stack

### Frontend

**Core**

- **Angular 18**: modern web framework with standalone components
- **TypeScript 5.5**: type-safe development
- **RxJS**: reactive state management

**UI & Styling**

- **TailwindCSS**: utility-first CSS framework
- **Bootstrap 5** + **ng-bootstrap**: component library
- **SCSS**: advanced styling

**Scheduling & Calendar**

- **angular-calendar-scheduler**: calendar component with drag-and-drop
- **date-fns**: modern date manipulation
- **angularx-flatpickr**: date picker

**Export & PDF Generation**

- **@pdfme/generator**: PDF generation engine
- **html-to-image**: screenshot capture
- **@zip.js/zip.js**: ZIP file creation

**Real-time client**

- **socket.io-client**: WebSocket client for the `/collab` namespace

### Backend

- **NestJS 11**: modular Node.js framework
- **Kysely + pg**: type-safe SQL query builder over a PostgreSQL pool (no TypeORM/Prisma, and no `CamelCasePlugin`)
- **@nestjs/jwt + passport** (`passport-jwt`, `passport-google-oauth20`): JWT auth and Google OAuth
- **@nestjs/websockets + @nestjs/platform-socket.io + socket.io**: real-time `/collab` gateway
- **class-validator / class-transformer**: request validation and transformation

---

## 🔮 Future Enhancements

- [x] Custom time ranges and intervals
- [x] Multiple project support
- [x] Mobile-responsive improvements
- [x] Real-time collaboration via WebSockets
- [ ] Dark mode support
- [ ] Undo/Redo functionality
- [ ] Task color customization

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with [Angular](https://angular.io/) and [NestJS](https://nestjs.com/)
- Calendar component by [angular-calendar-scheduler](https://github.com/michelebombardi/angular-calendar-scheduler)
- PDF generation by [@pdfme](https://pdfme.com/)
- Icons from [Heroicons](https://heroicons.com/)
