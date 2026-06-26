import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../shared/services/auth.service';
import {
  InviteInfo,
  InvitesService,
} from '../../shared/services/invites.service';
import { ProjectService } from '../../shared/services/project.service';

type JoinStatus = 'loading' | 'login' | 'ready' | 'accepting' | 'invalid';

@Component({
  selector: 'sch-join',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './join.component.html',
})
export class JoinComponent implements OnInit {
  status: JoinStatus = 'loading';
  boardName: string | null = null;
  role: string | null = null;
  errorMessage: string | null = null;

  private token: string | null = null;
  private boardId: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly invitesService: InvitesService,
    private readonly projectService: ProjectService
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token');

    if (!this.token) {
      this.status = 'invalid';
      return;
    }

    this.invitesService.getInvite(this.token).subscribe({
      next: (info) => this.handleInvite(info),
      error: () => {
        this.status = 'invalid';
      },
    });
  }

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated;
  }

  login(): void {
    if (this.token) {
      this.invitesService.setPendingInvite(this.token);
    }
    this.authService.login();
  }

  accept(): void {
    if (!this.token || this.status === 'accepting') {
      return;
    }

    this.status = 'accepting';
    this.errorMessage = null;

    this.invitesService.acceptInvite(this.token).subscribe({
      next: ({ boardId }) => {
        this.invitesService.clearPendingInvite();
        this.boardId = boardId;
        this.projectService.openBoard(boardId).subscribe({
          next: () => this.goToBoard(),
          error: () => this.goToBoard(),
        });
      },
      error: () => {
        this.status = 'ready';
        this.errorMessage =
          'Could not accept this invitation. Please try again.';
      },
    });
  }

  private handleInvite(info: InviteInfo): void {
    if (!info.valid) {
      this.status = 'invalid';
      this.clearPendingIfMine();
      return;
    }

    this.boardName = info.boardName;
    this.role = info.role;
    this.boardId = info.boardId;

    if (!this.isAuthenticated) {
      if (this.token) {
        this.invitesService.setPendingInvite(this.token);
      }
      this.status = 'login';
      return;
    }

    this.status = 'ready';

    // Resuming after the login round-trip: the visitor already chose to accept
    // this invite before authenticating, so complete it automatically.
    if (this.token && this.invitesService.getPendingInvite() === this.token) {
      this.accept();
    }
  }

  private clearPendingIfMine(): void {
    if (this.token && this.invitesService.getPendingInvite() === this.token) {
      this.invitesService.clearPendingInvite();
    }
  }

  private goToBoard(): void {
    void this.router.navigate(['/']);
  }
}
