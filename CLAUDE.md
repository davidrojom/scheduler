# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **pnpm monorepo** for a collaborative scheduler. It contains two applications:

- **`apps/frontend`** (`@scheduler/frontend`) — the Angular 18 app for creating and managing daily schedules with participants: create columns (places/locations), schedule tasks within those columns, assign participants to tasks, and export individual participant schedules as PDFs.
- **`apps/backend`** (`@scheduler/backend`) — a NestJS + Postgres (Kysely) API providing auth (Google OAuth + JWT), board persistence, invites, and realtime collaboration over Socket.IO.

## Repository Structure

```
.
├── pnpm-workspace.yaml      # workspace globs (apps/*)
├── package.json             # root: private, workspace scripts (pnpm --filter ...)
├── apps/
│   ├── frontend/            # Angular app (angular.json, src/, public/, tailwind, eslint)
│   └── backend/             # NestJS app (nest-cli.json, src/, test/, scripts/)
└── Dockerfile               # workspace-aware; builds the frontend into an httpd image
```

Use pnpm (v10+, Node 22+). Install once at the root with `pnpm install` — there is a single root `pnpm-lock.yaml`.

## Development Commands

Run from the repo root. Convenience scripts wrap pnpm filters; you can also use `pnpm --filter <pkg> <script>` directly.

### Frontend (`@scheduler/frontend`)

```bash
pnpm start:frontend                              # ng serve on localhost:4200
pnpm --filter @scheduler/frontend start:host     # serve on 0.0.0.0 (network)
pnpm build:frontend                              # production build to apps/frontend/dist/scheduler
pnpm --filter @scheduler/frontend test           # Karma/Jasmine tests
```

### Backend (`@scheduler/backend`)

```bash
pnpm start:backend                               # nest start --watch
pnpm build:backend                               # nest build
pnpm --filter @scheduler/backend test            # Jest (DB suites need a Postgres scheduler_test DB)
pnpm --filter @scheduler/backend migrate         # run database migrations
```

### Whole workspace

```bash
pnpm build            # build every app (pnpm -r build)
pnpm lint             # lint every app (pnpm -r lint)
```

## Architecture

### Core Data Model

The application has three main entities stored in localStorage:

1. **Columns**: Represent places/locations (e.g., rooms, stages)

   - Structure: `{ id: string, title: string }`
   - Draggable/reorderable

2. **Tasks**: Scheduled events assigned to columns

   - Structure: `{ id: string, columnId: string, title: string, start: Date, end: Date, participants: string[] }`
   - Stored as time-only (hours/minutes) since the scheduler doesn't support fixed days
   - Draggable and resizable within the calendar view

3. **Participants**: List of people who can be assigned to tasks
   - Structure: `string[]` (array of names)

### Service Layer Architecture

**State Management Services** (all use RxJS BehaviorSubject pattern):

- `TasksService`: Manages task CRUD operations and syncs with ConfigService
- `ColumnsService`: Manages column CRUD operations and ordering
- `ParticipantsService`: Manages participant list

**Persistence Layer**:

- `ConfigService`: Acts as the main interface to LocalstorageService, handles date serialization/deserialization
- `LocalstorageService`: Low-level localStorage operations with three scopes: columns, tasks, participants

**Export/Import Services**:

- `ExportService`: Generates participant-specific PDFs using @pdfme/generator, creates screenshots using html-to-image, and packages multiple PDFs into ZIP files using @zip.js/zip.js
- `ShareService`: Exports/imports config as base64-encoded JSON for sharing schedules

**UI/UX Services**:

- `MobileDetectionService`: Detects mobile devices (touch screen + small viewport or mobile user agent) with reactive resize handling
- `LogoService`: Manages custom SVG logo upload/storage with DOMPurify sanitization to prevent XSS

### Component Structure

(rooted at `apps/frontend/src/`)

```
app/
├── pages/
│   └── scheduler/
│       ├── scheduler.component.ts       # Main container with column management
│       └── components/
│           ├── schedule/
│           │   ├── schedule.component.ts     # Calendar view per column (angular-calendar)
│           │   └── date-formatter.ts         # Custom 24h time formatting
│           └── modals/
│               └── task/
│                   └── task-modal.component.ts  # Task creation/editing modal
└── shared/
    ├── services/                        # All injectable services
    ├── constants/
    │   ├── config.ts                    # Day hours: 6-21, 6 segments/hour (10min intervals)
    │   └── task.colors.ts               # Color scheme for tasks
    └── ui/components/modals/
        └── modal-header/                # Reusable modal header component
```

### Key Libraries

- **angular-calendar**: Day view scheduler with drag-and-drop and resize
- **@ng-bootstrap/ng-bootstrap**: Modal dialogs
- **@pdfme/generator**: PDF generation for participant schedules
- **html-to-image**: Screenshot capture of the schedule
- **@zip.js/zip.js**: Bundling multiple PDFs into a zip file
- **date-fns**: Date manipulation
- **dompurify**: SVG sanitization for logo uploads
- **TailwindCSS**: Utility-first styling

### Important Technical Details

1. **Time-Only Scheduling**: Tasks are stored as hours/minutes only because angular-calendar-scheduler doesn't support fixed-day scheduling. Dates are always set to "today" when rendering.

2. **Component Prefix**: Use `sch-` prefix for all component selectors (configured in angular.json).

3. **Drag and Drop**:

   - Columns use Angular CDK drag-drop
   - Tasks use angular-calendar's built-in drag/resize

4. **Export Functionality**:

   - Whole schedule: Screenshot as PNG
   - Per participant: Filtered schedules as PDFs in a ZIP file
   - Share: Base64-encoded JSON config for import/export

5. **Localization**: Spanish locale (es) registered for date formatting.

6. **Styles**: TailwindCSS with custom colors defined in tailwind.config.js. Use tailwind classes but if theres a complex style, create component-specific SCSS files.

## Future Development Notes

From README.md future features:

- Refactor the whole codebase
- Add websockets support (for real-time collaboration)
- Add proper alerts and error handling

Known TODO comments in code:

- Add schema validations for localStorage data (localstorage.service.ts:93)
