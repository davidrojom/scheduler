import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

import { ShareInviteComponent } from './share-invite.component';
import { ProjectService } from '../../../../shared/services/project.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { InvitesService } from '../../../../shared/services/invites.service';
import { Project, BoardRole } from '../../../../shared/models/project.model';
import { environment } from '../../../../../environments/environment';

function makeProject(role?: BoardRole): Project {
  return {
    id: 'board-1',
    name: 'Contract Board',
    config: { dayStartHour: 6, dayEndHour: 21, segmentsByHour: 6 },
    createdAt: new Date(),
    updatedAt: new Date(),
    myRole: role,
  };
}

describe('ShareInviteComponent', () => {
  let authState$: BehaviorSubject<boolean>;
  let currentProject$: BehaviorSubject<Project | null>;
  let httpMock: HttpTestingController;

  function setup(authenticated: boolean, project: Project | null) {
    authState$ = new BehaviorSubject<boolean>(authenticated);
    currentProject$ = new BehaviorSubject<Project | null>(project);

    TestBed.configureTestingModule({
      imports: [ShareInviteComponent, HttpClientTestingModule],
      providers: [
        InvitesService,
        { provide: AuthService, useValue: { authState$ } },
        { provide: ProjectService, useValue: { currentProject$ } },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ShareInviteComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('offers exactly editor and viewer roles (never owner)', () => {
    const fixture = setup(true, makeProject('owner'));
    expect(fixture.componentInstance.roles).toEqual(['editor', 'viewer']);
    expect(fixture.componentInstance.roles).not.toContain(
      'owner' as unknown as never
    );
  });

  it('shows the share control for an owner on a DB board', async () => {
    const fixture = setup(true, makeProject('owner'));
    await expectAsync(
      firstValueFrom(fixture.componentInstance.canShare$)
    ).toBeResolvedTo(true);
  });

  it('shows the share control for an editor on a DB board', async () => {
    const fixture = setup(true, makeProject('editor'));
    await expectAsync(
      firstValueFrom(fixture.componentInstance.canShare$)
    ).toBeResolvedTo(true);
  });

  it('hides the share control from a viewer', async () => {
    const fixture = setup(true, makeProject('viewer'));
    await expectAsync(
      firstValueFrom(fixture.componentInstance.canShare$)
    ).toBeResolvedTo(false);

    const button = fixture.nativeElement.querySelector(
      '[data-umami-event="open-share-invite"]'
    );
    expect(button).toBeNull();
  });

  it('hides the share control from anonymous (no DB role) users', async () => {
    const fixture = setup(false, null);
    await expectAsync(
      firstValueFrom(fixture.componentInstance.canShare$)
    ).toBeResolvedTo(false);
  });

  it('generates a copyable /join/<token> invite link via POST /invites', () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;

    component.role = 'editor';
    component.generate();

    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/boards/board-1/invites`
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ role: 'editor' });
    req.flush({
      id: 'invite-1',
      token: 'tok123',
      role: 'editor',
      url: 'http://localhost:4200/join/tok123',
    });

    expect(component.inviteUrl).toBe('http://localhost:4200/join/tok123');
    httpMock.verify();
  });

  it('falls back to the current origin when the response omits a url', () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;

    component.generate();

    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/boards/board-1/invites`
    );
    req.flush({ id: 'invite-2', token: 'tok456', role: 'editor', url: '' });

    expect(component.inviteUrl).toBe(
      `${window.location.origin}/join/tok456`
    );
    httpMock.verify();
  });

  it('copies the generated link to the clipboard', async () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;
    component.inviteUrl = 'http://localhost:4200/join/tok123';

    const writeText = jasmine
      .createSpy('writeText')
      .and.returnValue(Promise.resolve());
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({
      writeText,
    } as unknown as Clipboard);

    await component.copy();

    expect(writeText).toHaveBeenCalledWith('http://localhost:4200/join/tok123');
    expect(component.copied).toBeTrue();
  });

  it('surfaces an error message when invite creation fails', () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;

    component.generate();

    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/boards/board-1/invites`
    );
    req.flush(
      { message: 'Forbidden' },
      { status: 403, statusText: 'Forbidden' }
    );

    expect(component.inviteUrl).toBeNull();
    expect(component.errorMessage).toBeTruthy();
    httpMock.verify();
  });
});
