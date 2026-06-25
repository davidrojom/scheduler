import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { LocalBoardPersistence } from './local-board-persistence.service';

const MIGRATED_FLAG_PREFIX = 'scheduler_migrated_';

/**
 * Imports a user's anonymous localStorage boards into the database on their
 * first authenticated session (architecture §7.6, §10.1). Keyed per user via a
 * `scheduler_migrated_<userId>` flag so re-login/reload never re-imports, and
 * the backend additionally skips boards whose client uuid already exists.
 * Local data is read only and never deleted, so logout returns to it intact.
 */
@Injectable({
  providedIn: 'root',
})
export class BoardMigrationService {
  constructor(
    private readonly http: HttpClient,
    private readonly local: LocalBoardPersistence
  ) {}

  hasMigrated(userId: string): boolean {
    return localStorage.getItem(this.flagKey(userId)) === 'true';
  }

  migrateLocalBoards(userId: string): Observable<void> {
    if (this.hasMigrated(userId)) {
      return of(undefined);
    }

    const boards = this.local.exportForMigration();
    if (boards.length === 0) {
      this.markMigrated(userId);
      return of(undefined);
    }

    return this.http
      .post(`${environment.apiBaseUrl}/boards/import`, { boards })
      .pipe(
        map(() => {
          this.markMigrated(userId);
          return undefined as void;
        }),
        // Leave the flag unset on failure so a later login retries; the import
        // is idempotent, so a retry cannot create duplicates.
        catchError(() => of(undefined))
      );
  }

  private markMigrated(userId: string): void {
    localStorage.setItem(this.flagKey(userId), 'true');
  }

  private flagKey(userId: string): string {
    return `${MIGRATED_FLAG_PREFIX}${userId}`;
  }
}
