# Design — Google account selection & owner-removes-collaborators

Date: 2026-06-28
Status: Approved

## Goals

1. **Log in with different Google accounts.** Today the `GoogleStrategy` sends no
   `prompt`, so Google silently re-authenticates with the browser's active
   account and never offers a chooser. We want the account picker every time.
2. **Owner removes collaborators.** A board owner must be able to remove an
   editor/viewer from the board. No remove-member endpoint or members-list UI
   exists today.

Out of scope (YAGNI): "leave board" (non-owner self-removal), changing a
member's role, and multiple simultaneous Google sessions.

## Feature 1 — Force the Google account chooser

Add `prompt: 'select_account'` to the `passport-google-oauth20` strategy options
in `apps/backend/src/auth/strategies/google.strategy.ts`. Backend-only change;
the frontend already redirects to `/auth/google` after logout, so "Sign in with
Google" will always show the chooser.

## Feature 2 — Owner removes collaborators

### Backend

- `BoardsService.removeMember(boardId, targetUserId)`:
  - `NotFoundException` if the target is not a member.
  - `ForbiddenException` if the target's role is `owner` (the owner cannot be
    removed — this also blocks the owner removing themselves; there is exactly
    one owner because invites never grant `owner`).
  - Deletes the `board_members` row.
  - Emits `board:member_removed` `{ boardId, userId }` to the board room via the
    optional `RealtimeBroadcaster` (same `this.realtime?.emitToBoard(...)`
    pattern as `update`).
- `GET /api/boards/:id/members` — any member (`BoardRoleGuard`, no role
  restriction). Returns `[{ userId, name, email, avatarUrl, role }]`, reusing the
  member query already in `getDetail`. Keeps the modal's fetch light (avoids
  pulling full board content).
- `DELETE /api/boards/:id/members/:userId` — `@BoardRoles('owner')` +
  `BoardRoleGuard`. Returns `{ success: true }` (mirrors `DELETE /:id`).

### Realtime

When the owner removes a member, the backend emits `board:member_removed` to the
room. The frontend reacts:

- **Removed user is me:** the client drops the board from local state and
  switches to another board (or none). Leaving triggers the existing
  `board:leave`/`presence:left` flow so other members' presence updates.
- **Removed user is someone else:** the open Collaborators modal removes that row
  from its list.

No server-side socket eviction: authorization is already revalidated per op
(`withEditor`/`board:join` check the role each time) and a resync GET returns
404, so a removed user cannot mutate or re-read the board in the brief window
before the event lands. The event drives prompt UX + local cleanup only.

### Frontend

- `BoardMembersService`: `getMembers(boardId)` → `GET /boards/:id/members`;
  `removeMember(boardId, userId)` → `DELETE /boards/:id/members/:userId`. A
  `BoardMember` interface `{ userId, name, email, avatarUrl, role }`.
- `CollaborationService`: a dedicated `board:member_removed` socket listener
  exposing `memberRemoved$` (separate from `REMOTE_EVENT_NAMES` — different
  payload/handling).
- `ApiBoardPersistence.removeBoardLocally(id)`: like `deleteProject` but with no
  HTTP DELETE (membership is already gone server-side).
- `ProjectService`: subscribes to `memberRemoved$`; when the removed user is the
  current user, drops the board locally and switches.
- `CollaboratorsComponent` (`sch-collaborators`): a dedicated modal opened from a
  new topbar button next to the invite button. Lists members (avatar/initial,
  name, email, role badge); each non-owner member shows a confirm-gated "Remove"
  button **only when the current user is the owner**. The topbar button is
  visible to any member (viewing collaborators is useful for everyone); the
  remove action renders for the owner only.

## Testing

- **Backend (Jest):** `BoardsService.removeMember` (removes a member; forbids
  removing the owner; 404 for a non-member) in `boards.service.spec.ts`; members
  endpoints authorization (owner-only DELETE, any-member GET, non-member 404) in
  `boards.e2e-spec.ts`.
- **Frontend (Karma):** `BoardMembersService` HTTP calls; `CollaboratorsComponent`
  (renders members, remove button owner-only, calls the service); the Google
  `prompt` change is verified manually.
