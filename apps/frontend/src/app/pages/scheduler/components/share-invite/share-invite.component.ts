import { Component, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable, combineLatest, map } from 'rxjs';

import { ProjectService } from '../../../../shared/services/project.service';
import { AuthService } from '../../../../shared/services/auth.service';
import {
  InviteRole,
  InvitesService,
} from '../../../../shared/services/invites.service';

@Component({
  selector: 'sch-share-invite',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './share-invite.component.html',
})
export class ShareInviteComponent {
  readonly roles: InviteRole[] = ['editor', 'viewer'];
  readonly canShare$: Observable<boolean>;

  private currentBoardId: string | null = null;

  role: InviteRole = 'editor';
  inviteUrl: string | null = null;
  generating = false;
  copied = false;
  errorMessage: string | null = null;

  constructor(
    private readonly projectService: ProjectService,
    private readonly authService: AuthService,
    private readonly invitesService: InvitesService,
    private readonly modal: NgbModal
  ) {
    this.canShare$ = combineLatest([
      this.authService.authState$,
      this.projectService.currentProject$,
    ]).pipe(
      map(([authenticated, project]) => {
        this.currentBoardId = project?.id ?? null;
        return (
          authenticated &&
          (project?.myRole === 'owner' || project?.myRole === 'editor')
        );
      })
    );
  }

  open(content: TemplateRef<unknown>): void {
    this.role = 'editor';
    this.inviteUrl = null;
    this.copied = false;
    this.generating = false;
    this.errorMessage = null;
    this.modal.open(content, { ariaLabelledBy: 'share-invite-modal' });
  }

  generate(): void {
    if (!this.currentBoardId || this.generating) {
      return;
    }

    this.generating = true;
    this.copied = false;
    this.errorMessage = null;

    this.invitesService.createInvite(this.currentBoardId, this.role).subscribe({
      next: (invite) => {
        this.inviteUrl =
          invite.url || `${window.location.origin}/join/${invite.token}`;
        this.generating = false;
      },
      error: () => {
        this.errorMessage =
          'Could not create an invite link. Please try again.';
        this.generating = false;
      },
    });
  }

  async copy(): Promise<void> {
    if (!this.inviteUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(this.inviteUrl);
      this.copied = true;
    } catch {
      this.copied = false;
    }
  }
}
