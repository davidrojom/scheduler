# Design — Owner changes collaborator roles & transfers ownership

Date: 2026-06-28
Status: Approved

## Goal

Let a board owner change a collaborator's role and promote a collaborator to
owner. Promotion uses a **single-owner transfer**: the promoted collaborator
becomes owner and the current owner is demoted to editor.

Out of scope (YAGNI): co-owners (multiple owners); an owner self-demoting without
naming a successor.

## Data model (unchanged)

- `boards.owner_id` — the single owner (denormalized).
- `board_members.role` — enum `owner | editor | viewer`, one row per member.
- Invariant kept: exactly one `owner` row per board, matching `boards.owner_id`.

## Backend

`BoardsService.changeMemberRole(boardId, callerId, targetUserId, role)`:

- **editor ⇄ viewer** (target is not the owner): a plain
  `UPDATE board_members SET role` for the target.
- **promote to owner** (`role === 'owner'`): an atomic transaction —
  set the target's row to `owner`, set the caller's row to `editor`, and
  `UPDATE boards SET owner_id = target`.
- **Validation:**
  - Owner-only (enforced at the route).
  - `NotFoundException` if the target is not a member.
  - `BadRequestException` if the target is the current owner and the requested
    role is not `owner` (an owner cannot be demoted directly — transfer instead).
  - Changing to the role the member already has is a no-op (returns current state).
- **Realtime:** emit `board:member_role_changed` `{ boardId, userId, role }` for
  each affected member via `realtime.emitToBoard`. A transfer emits two events
  (old owner → editor, new owner → owner).
- Returns the refreshed member list (`BoardMemberDto[]`).

`PATCH /api/boards/:id/members/:userId` — body `{ role }` (validated DTO
restricted to `owner|editor|viewer`), `@BoardRoles('owner')` + `BoardRoleGuard`.

## Frontend

- `BoardMembersService.updateRole(boardId, userId, role)` →
  `PATCH …/members/:userId`, returns `BoardMember[]`.
- `CollaborationService.memberRoleChanged$` — a dedicated
  `board:member_role_changed` socket listener (distinct payload/handling from
  content events and from `memberRemoved$`).
- `ProjectService`: on a role change **for the current user**, update
  `project.myRole` and re-emit `currentProject$` so the UI gains/loses
  owner/editor controls immediately — essential for the user who just
  transferred ownership and drops to editor.
- **Collaborators modal** (owner view, per non-owner row):
  - an editor/viewer `<select>` for quick role changes;
  - a confirm-gated **"Make owner"** button (it demotes the current owner);
  - the existing remove button stays.
  - On `memberRoleChanged$`, update that row's role; if the change demoted the
    viewer of the modal from owner, the owner-only controls disappear (driven by
    `isOwner$`).

## Testing

- **Backend (Jest):** `changeMemberRole` — editor↔viewer; transfer (target=owner,
  caller=editor, `owner_id` updated, all in one transaction); `404` for a
  non-member; rejects demoting the owner without transfer — in
  `boards.service.spec.ts`. Owner-only `PATCH` authorization and the transfer
  round-trip in `boards.e2e-spec.ts`.
- **Frontend (Karma):** `BoardMembersService.updateRole`; `ProjectService`
  updates `myRole` on a transfer; `CollaboratorsComponent` (select changes role,
  "Make owner" confirms then calls the service, realtime role update reflected).
