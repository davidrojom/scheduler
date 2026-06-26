import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export type InviteRole = 'editor' | 'viewer';

export interface InviteLink {
  id: string;
  token: string;
  role: InviteRole;
  url: string;
}

export interface InviteInfo {
  boardId: string | null;
  boardName: string | null;
  role: InviteRole | null;
  valid: boolean;
}

export interface InviteAcceptResult {
  boardId: string;
}

export const PENDING_INVITE_KEY = 'scheduler_pending_invite';

@Injectable({
  providedIn: 'root',
})
export class InvitesService {
  private get baseUrl(): string {
    return `${environment.apiBaseUrl}/boards`;
  }

  private get invitesUrl(): string {
    return `${environment.apiBaseUrl}/invites`;
  }

  constructor(private readonly http: HttpClient) {}

  createInvite(boardId: string, role: InviteRole): Observable<InviteLink> {
    return this.http.post<InviteLink>(`${this.baseUrl}/${boardId}/invites`, {
      role,
    });
  }

  getInvite(token: string): Observable<InviteInfo> {
    return this.http.get<InviteInfo>(
      `${this.invitesUrl}/${encodeURIComponent(token)}`
    );
  }

  acceptInvite(token: string): Observable<InviteAcceptResult> {
    return this.http.post<InviteAcceptResult>(
      `${this.invitesUrl}/${encodeURIComponent(token)}/accept`,
      {}
    );
  }

  /**
   * Persists the token of an invite an anonymous visitor still wants to accept
   * so the join can resume after the login round-trip (Google OAuth or the
   * impersonate → /auth/callback recipe used by validators).
   */
  setPendingInvite(token: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PENDING_INVITE_KEY, token);
    }
  }

  getPendingInvite(): string | null {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(PENDING_INVITE_KEY)
      : null;
  }

  clearPendingInvite(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PENDING_INVITE_KEY);
    }
  }
}
