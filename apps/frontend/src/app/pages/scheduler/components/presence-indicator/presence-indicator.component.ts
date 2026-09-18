import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';

import { CollaborationService } from '../../../../shared/collaboration/collaboration.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { PresenceMember } from '../../../../shared/collaboration/collaboration.types';

@Component({
  selector: 'sch-presence-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './presence-indicator.component.html',
})
export class PresenceIndicatorComponent {
  readonly members$: Observable<PresenceMember[]>;

  constructor(
    private readonly collab: CollaborationService,
    private readonly auth: AuthService
  ) {
    this.members$ = this.collab.presence$;
  }

  initial(member: PresenceMember): string {
    return (member.name || '?').charAt(0).toUpperCase();
  }

  /** Follow mode only makes sense for remote cursors (own cursor is never
   * broadcast back), so your own avatar is a plain non-interactive badge. */
  get selfId(): string | null {
    return this.auth.currentUser?.id ?? null;
  }

  isFollowed(member: PresenceMember): boolean {
    return this.collab.followedUserId() === member.userId;
  }

  toggleFollow(member: PresenceMember): void {
    this.collab.toggleFollow(member.userId);
  }

  avatarTitle(member: PresenceMember): string {
    if (member.userId === this.selfId) {
      return member.name;
    }
    return this.isFollowed(member)
      ? `Stop following ${member.name}`
      : `Follow ${member.name}'s cursor`;
  }
}
