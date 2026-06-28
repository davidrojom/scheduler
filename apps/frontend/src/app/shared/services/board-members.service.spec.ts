import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { BoardMember, BoardMembersService } from './board-members.service';
import { environment } from '../../../environments/environment';

describe('BoardMembersService', () => {
  let service: BoardMembersService;
  let httpMock: HttpTestingController;
  const boardId = 'board-1';
  const membersUrl = `${environment.apiBaseUrl}/boards/${boardId}/members`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(BoardMembersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('GETs the members of a board', async () => {
    const members: BoardMember[] = [
      {
        userId: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        avatarUrl: null,
        role: 'owner',
      },
      {
        userId: 'u2',
        name: 'Bob',
        email: 'bob@example.com',
        avatarUrl: null,
        role: 'editor',
      },
    ];

    const result = firstValueFrom(service.getMembers(boardId));

    const req = httpMock.expectOne(membersUrl);
    expect(req.request.method).toBe('GET');
    req.flush(members);

    await expectAsync(result).toBeResolvedTo(members);
  });

  it('DELETEs a member by id', async () => {
    const result = firstValueFrom(service.removeMember(boardId, 'u2'));

    const req = httpMock.expectOne(`${membersUrl}/u2`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });

    await expectAsync(result).toBeResolvedTo({ success: true });
  });

  it('PATCHes a member role and returns the refreshed list', async () => {
    const updated: BoardMember[] = [
      {
        userId: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        avatarUrl: null,
        role: 'editor',
      },
      {
        userId: 'u2',
        name: 'Bob',
        email: 'bob@example.com',
        avatarUrl: null,
        role: 'owner',
      },
    ];

    const result = firstValueFrom(service.updateRole(boardId, 'u2', 'owner'));

    const req = httpMock.expectOne(`${membersUrl}/u2`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role: 'owner' });
    req.flush(updated);

    await expectAsync(result).toBeResolvedTo(updated);
  });
});
