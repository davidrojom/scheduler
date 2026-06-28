import { Component, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable, combineLatest, map } from 'rxjs';

import { ProjectService } from '../../../../shared/services/project.service';
import { AuthService } from '../../../../shared/services/auth.service';
import {
  BoardMember,
  BoardMembersService,
} from '../../../../shared/services/board-members.service';
import { CollaborationService } from '../../../../shared/collaboration/collaboration.service';
import { BoardRole } from '../../../../shared/models/project.model';
import {
  HlmBadgeDirective,
  HlmButtonDirective,
  HlmInputDirective,
} from '../../../../shared/ui/spartan';

@Component({
  selector: 'sch-collaborators',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmButtonDirective,
    HlmBadgeDirective,
    HlmInputDirective,
  ],
  templateUrl: './collaborators.component.html',
})
export class CollaboratorsComponent {
  /** The control is shown to any member of a DB board (anyone can see who collaborates). */
  readonly canView$: Observable<boolean>;
  /** Only the owner sees the remove controls. */
  readonly isOwner$: Observable<boolean>;

  /** Roles the owner can assign via the quick selector; `owner` is its own action. */
  readonly assignableRoles: BoardRole[] = ['editor', 'viewer'];

  private currentBoardId: string | null = null;

  members: BoardMember[] = [];
  loading = false;
  errorMessage: string | null = null;
  confirmingUserId: string | null = null;
  removingUserId: string | null = null;
  promoteConfirmUserId: string | null = null;
  updatingUserId: string | null = null;

  constructor(
    private readonly projectService: ProjectService,
    private readonly authService: AuthService,
    private readonly membersService: BoardMembersService,
    private readonly collab: CollaborationService,
    private readonly modal: NgbModal
  ) {
    this.canView$ = combineLatest([
      this.authService.authState$,
      this.projectService.currentProject$,
    ]).pipe(
      map(([authenticated, project]) => {
        this.currentBoardId = project?.id ?? null;
        return authenticated && !!project?.myRole;
      })
    );

    this.isOwner$ = this.projectService.currentProject$.pipe(
      map((project) => project?.myRole === 'owner')
    );

    // Keep the open list in sync when a collaborator is removed elsewhere.
    this.collab.memberRemoved$
      .pipe(takeUntilDestroyed())
      .subscribe(({ boardId, userId }) => {
        if (boardId === this.currentBoardId) {
          this.members = this.members.filter((m) => m.userId !== userId);
        }
      });

    // Keep role badges/selectors in sync when a role changes elsewhere (incl.
    // the two events of an ownership transfer).
    this.collab.memberRoleChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(({ boardId, userId, role }) => {
        if (boardId === this.currentBoardId) {
          this.members = this.members.map((m) =>
            m.userId === userId ? { ...m, role } : m
          );
        }
      });
  }

  open(content: TemplateRef<unknown>): void {
    this.errorMessage = null;
    this.confirmingUserId = null;
    this.removingUserId = null;
    this.promoteConfirmUserId = null;
    this.updatingUserId = null;
    this.members = [];
    this.modal.open(content, { ariaLabelledBy: 'collaborators-modal' });
    this.load();
  }

  changeRole(userId: string, role: BoardRole): void {
    const member = this.members.find((m) => m.userId === userId);
    if (!this.currentBoardId || this.updatingUserId || member?.role === role) {
      return;
    }
    this.applyRoleChange(userId, role);
  }

  askPromote(userId: string): void {
    this.promoteConfirmUserId = userId;
  }

  cancelPromote(): void {
    this.promoteConfirmUserId = null;
  }

  promote(userId: string): void {
    if (!this.currentBoardId || this.updatingUserId) {
      return;
    }
    this.applyRoleChange(userId, 'owner');
  }

  private applyRoleChange(userId: string, role: BoardRole): void {
    if (!this.currentBoardId) {
      return;
    }
    this.updatingUserId = userId;
    this.errorMessage = null;

    this.membersService
      .updateRole(this.currentBoardId, userId, role)
      .subscribe({
        next: (members) => {
          this.members = members;
          this.updatingUserId = null;
          this.promoteConfirmUserId = null;
        },
        error: () => {
          this.errorMessage = 'Could not update the role. Please try again.';
          this.updatingUserId = null;
          this.promoteConfirmUserId = null;
        },
      });
  }

  askRemove(userId: string): void {
    this.confirmingUserId = userId;
  }

  cancelRemove(): void {
    this.confirmingUserId = null;
  }

  remove(userId: string): void {
    if (!this.currentBoardId || this.removingUserId) {
      return;
    }
    this.removingUserId = userId;
    this.errorMessage = null;

    this.membersService.removeMember(this.currentBoardId, userId).subscribe({
      next: () => {
        this.members = this.members.filter((m) => m.userId !== userId);
        this.removingUserId = null;
        this.confirmingUserId = null;
      },
      error: () => {
        this.errorMessage = 'Could not remove this collaborator. Please try again.';
        this.removingUserId = null;
        this.confirmingUserId = null;
      },
    });
  }

  initials(member: BoardMember): string {
    const source = member.name?.trim() || member.email;
    return source ? source.charAt(0).toUpperCase() : '?';
  }

  private load(): void {
    if (!this.currentBoardId) {
      return;
    }
    this.loading = true;
    this.errorMessage = null;

    this.membersService.getMembers(this.currentBoardId).subscribe({
      next: (members) => {
        this.members = members;
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Could not load collaborators.';
        this.loading = false;
      },
    });
  }
}
