import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { BoardRole } from '../models/project.model';

export interface BoardMember {
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: BoardRole;
}

@Injectable({
  providedIn: 'root',
})
export class BoardMembersService {
  private get baseUrl(): string {
    return `${environment.apiBaseUrl}/boards`;
  }

  constructor(private readonly http: HttpClient) {}

  /** Lists the collaborators of a board (owner included). Any member may read. */
  getMembers(boardId: string): Observable<BoardMember[]> {
    return this.http.get<BoardMember[]>(`${this.baseUrl}/${boardId}/members`);
  }

  /** Removes a collaborator from a board. Owner-only (enforced server-side). */
  removeMember(
    boardId: string,
    userId: string
  ): Observable<{ success: true }> {
    return this.http.delete<{ success: true }>(
      `${this.baseUrl}/${boardId}/members/${userId}`
    );
  }

  /**
   * Changes a member's role. Owner-only (enforced server-side). Setting `owner`
   * transfers ownership: the target becomes owner and the caller drops to editor.
   * Returns the refreshed member list.
   */
  updateRole(
    boardId: string,
    userId: string,
    role: BoardRole
  ): Observable<BoardMember[]> {
    return this.http.patch<BoardMember[]>(
      `${this.baseUrl}/${boardId}/members/${userId}`,
      { role }
    );
  }
}
