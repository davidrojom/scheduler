import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../shared/services/auth.service';
import { InvitesService } from '../../shared/services/invites.service';

@Component({
  selector: 'sch-auth-callback',
  standalone: true,
  template: `
    <div class="flex h-dvh items-center justify-center bg-muted/40 text-foreground">
      <div class="flex flex-col items-center gap-3">
        <i class="ph ph-circle-notch text-4xl animate-spin text-muted-foreground"></i>
        <span class="text-lg">Signing you in...</span>
      </div>
    </div>
  `,
})
export class AuthCallbackComponent implements OnInit {
  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly invitesService: InvitesService,
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      void this.router.navigate(['/']);
      return;
    }

    this.authService.handleCallbackToken(token).subscribe((user) => {
      const pendingInvite = this.invitesService.getPendingInvite();

      if (user && pendingInvite) {
        void this.router.navigate(['/join', pendingInvite]);
        return;
      }

      void this.router.navigate(['/']);
    });
  }
}
