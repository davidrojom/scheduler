import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';

import { CollaborationService } from '../../../../shared/collaboration/collaboration.service';
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

  constructor(private readonly collab: CollaborationService) {
    this.members$ = this.collab.presence$;
  }

  initial(member: PresenceMember): string {
    return (member.name || '?').charAt(0).toUpperCase();
  }
}
