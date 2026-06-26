import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { InvitesService, InviteLink } from './invites.service';
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
});
