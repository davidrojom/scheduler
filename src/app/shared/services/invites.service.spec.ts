import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import {
  InvitesService,
  InviteLink,
  InviteInfo,
  PENDING_INVITE_KEY,
} from './invites.service';
import { environment } from '../../../environments/environment';

describe('InvitesService', () => {
  let service: InvitesService;
  let httpMock: HttpTestingController;
  const boardId = 'board-1';
  const invitesUrl = `${environment.apiBaseUrl}/boards/${boardId}/invites`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(InvitesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem(PENDING_INVITE_KEY);
  });

  it('POSTs the chosen role to /api/boards/:id/invites and returns the link', async () => {
    const response: InviteLink = {
      id: 'invite-1',
      token: 'abc123',
      role: 'editor',
      url: 'http://localhost:4200/join/abc123',
    };

    const result = firstValueFrom(service.createInvite(boardId, 'editor'));

    const req = httpMock.expectOne(invitesUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ role: 'editor' });
    req.flush(response);

    await expectAsync(result).toBeResolvedTo(response);
  });

  it('supports creating a viewer invite', async () => {
    const response: InviteLink = {
      id: 'invite-2',
      token: 'xyz789',
      role: 'viewer',
      url: 'http://localhost:4200/join/xyz789',
    };

    const result = firstValueFrom(service.createInvite(boardId, 'viewer'));

    const req = httpMock.expectOne(invitesUrl);
    expect(req.request.body).toEqual({ role: 'viewer' });
    req.flush(response);

    await expectAsync(result).toBeResolvedTo(response);
  });

  it('GETs invite info from /api/invites/:token', async () => {
    const info: InviteInfo = {
      boardId: 'board-1',
      boardName: 'Contract Board',
      role: 'viewer',
      valid: true,
    };

    const result = firstValueFrom(service.getInvite('tok123'));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/invites/tok123`);
    expect(req.request.method).toBe('GET');
    req.flush(info);

    await expectAsync(result).toBeResolvedTo(info);
  });

  it('reports an invalid invite for a nonexistent token', async () => {
    const info: InviteInfo = {
      boardId: null,
      boardName: null,
      role: null,
      valid: false,
    };

    const result = firstValueFrom(service.getInvite('missing'));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/invites/missing`);
    req.flush(info);

    await expectAsync(result).toBeResolvedTo(info);
  });

  it('POSTs to /api/invites/:token/accept and returns the boardId', async () => {
    const result = firstValueFrom(service.acceptInvite('tok123'));

    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/invites/tok123/accept`
    );
    expect(req.request.method).toBe('POST');
    req.flush({ boardId: 'board-1' });

    await expectAsync(result).toBeResolvedTo({ boardId: 'board-1' });
  });

  it('stores, reads, and clears a pending invite token', () => {
    expect(service.getPendingInvite()).toBeNull();

    service.setPendingInvite('tok123');
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBe('tok123');
    expect(service.getPendingInvite()).toBe('tok123');

    service.clearPendingInvite();
    expect(service.getPendingInvite()).toBeNull();
  });
});
