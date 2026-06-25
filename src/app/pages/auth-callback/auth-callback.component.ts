import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'sch-auth-callback',
  standalone: true,
  template: `
    <div class="flex h-dvh items-center justify-center bg-gray-900 text-white">
      <div class="flex flex-col items-center gap-3">
        <i class="ph ph-circle-notch text-4xl animate-spin"></i>
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
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      void this.router.navigate(['/']);
      return;
    }

    this.authService.handleCallbackToken(token).subscribe(() => {
      void this.router.navigate(['/']);
    });
  }
}
