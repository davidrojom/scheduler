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

@Injectable({
  providedIn: 'root',
})
export class InvitesService {
  private get baseUrl(): string {
    return `${environment.apiBaseUrl}/boards`;
  }

  constructor(private readonly http: HttpClient) {}

  createInvite(boardId: string, role: InviteRole): Observable<InviteLink> {
    return this.http.post<InviteLink>(`${this.baseUrl}/${boardId}/invites`, {
      role,
    });
  }
}
