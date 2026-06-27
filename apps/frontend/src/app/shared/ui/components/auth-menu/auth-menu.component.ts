import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';

import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';
import { HlmButtonDirective } from '../../spartan';

@Component({
  selector: 'sch-auth-menu',
  standalone: true,
  imports: [CommonModule, HlmButtonDirective],
  templateUrl: './auth-menu.component.html',
})
export class AuthMenuComponent {
  readonly currentUser$: Observable<User | null>;

  menuOpen = false;

  constructor(private readonly authService: AuthService) {
    this.currentUser$ = this.authService.currentUser$;
  }

  login(): void {
    this.authService.login();
  }

  logout(): void {
    this.menuOpen = false;
    this.authService.logout();
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  initial(user: User): string {
    const source = user.name || user.email || '?';
    return source.charAt(0);
  }
}
