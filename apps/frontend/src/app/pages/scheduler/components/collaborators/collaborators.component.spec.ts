import { TemplateRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { BehaviorSubject, Subject, firstValueFrom } from 'rxjs';

import { CollaboratorsComponent } from './collaborators.component';
import { ProjectService } from '../../../../shared/services/project.service';
import { AuthService } from '../../../../shared/services/auth.service';
import {
  BoardMember,
  BoardMembersService,
} from '../../../../shared/services/board-members.service';
import { CollaborationService } from '../../../../shared/collaboration/collaboration.service';
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

const MEMBERS: BoardMember[] = [
  {
    userId: 'owner-1',
    name: 'Alice',
    email: 'alice@example.com',
    avatarUrl: null,
    role: 'owner',
  },
  {
    userId: 'editor-1',
    name: 'Bob',
    email: 'bob@example.com',
    avatarUrl: null,
    role: 'editor',
  },
];

describe('CollaboratorsComponent', () => {
  let authState$: BehaviorSubject<boolean>;
  let currentProject$: BehaviorSubject<Project | null>;
  let memberRemoved$: Subject<{ boardId: string; userId: string }>;
  let memberRoleChanged$: Subject<{
    boardId: string;
    userId: string;
    role: BoardRole;
  }>;
  let httpMock: HttpTestingController;
  const membersUrl = `${environment.apiBaseUrl}/boards/board-1/members`;

  function setup(authenticated: boolean, project: Project | null) {
    authState$ = new BehaviorSubject<boolean>(authenticated);
    currentProject$ = new BehaviorSubject<Project | null>(project);
    memberRemoved$ = new Subject();
    memberRoleChanged$ = new Subject();

    TestBed.configureTestingModule({
      imports: [CollaboratorsComponent, HttpClientTestingModule],
      providers: [
        BoardMembersService,
        { provide: AuthService, useValue: { authState$ } },
        { provide: ProjectService, useValue: { currentProject$ } },
        {
          provide: CollaborationService,
          useValue: { memberRemoved$, memberRoleChanged$ },
        },
        { provide: NgbModal, useValue: { open: jasmine.createSpy('open') } },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CollaboratorsComponent);
    fixture.detectChanges();
    return fixture;
  }

  const tpl = {} as TemplateRef<unknown>;

  afterEach(() => {
    httpMock.verify();
  });

  it('shows the control for any member of a DB board', async () => {
    const fixture = setup(true, makeProject('viewer'));
    await expectAsync(
      firstValueFrom(fixture.componentInstance.canView$)
    ).toBeResolvedTo(true);

    const button = fixture.nativeElement.querySelector(
      '[data-umami-event="open-collaborators"]'
    );
    expect(button).not.toBeNull();
  });

  it('hides the control from anonymous (no DB role) users', async () => {
    const fixture = setup(false, null);
    await expectAsync(
      firstValueFrom(fixture.componentInstance.canView$)
    ).toBeResolvedTo(false);

    const button = fixture.nativeElement.querySelector(
      '[data-umami-event="open-collaborators"]'
    );
    expect(button).toBeNull();
  });

  it('reports isOwner true for the owner', async () => {
    const fixture = setup(true, makeProject('owner'));
    await expectAsync(
      firstValueFrom(fixture.componentInstance.isOwner$)
    ).toBeResolvedTo(true);
  });

  it('reports isOwner false for a non-owner', async () => {
    const fixture = setup(true, makeProject('editor'));
    await expectAsync(
      firstValueFrom(fixture.componentInstance.isOwner$)
    ).toBeResolvedTo(false);
  });

  it('loads the members when opened', () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;

    component.open(tpl);

    const req = httpMock.expectOne(membersUrl);
    expect(req.request.method).toBe('GET');
    req.flush(MEMBERS);

    expect(component.members).toEqual(MEMBERS);
    expect(component.loading).toBeFalse();
  });

  it('removes a collaborator via DELETE and drops them from the list', () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;
    component.members = [...MEMBERS];

    component.askRemove('editor-1');
    expect(component.confirmingUserId).toBe('editor-1');

    component.remove('editor-1');
    const req = httpMock.expectOne(`${membersUrl}/editor-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });

    expect(component.members.map((m) => m.userId)).toEqual(['owner-1']);
    expect(component.confirmingUserId).toBeNull();
    expect(component.removingUserId).toBeNull();
  });

  it('surfaces an error and keeps the member when removal fails', () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;
    component.members = [...MEMBERS];

    component.remove('editor-1');
    const req = httpMock.expectOne(`${membersUrl}/editor-1`);
    req.flush(
      { message: 'Forbidden' },
      { status: 403, statusText: 'Forbidden' }
    );

    expect(component.members.map((m) => m.userId)).toEqual([
      'owner-1',
      'editor-1',
    ]);
    expect(component.errorMessage).toBeTruthy();
  });

  it('drops a member when a realtime removal arrives for the active board', () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;
    component.members = [...MEMBERS];

    memberRemoved$.next({ boardId: 'board-1', userId: 'editor-1' });

    expect(component.members.map((m) => m.userId)).toEqual(['owner-1']);
  });

  it('cancelRemove clears the pending confirmation', () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;

    component.askRemove('editor-1');
    component.cancelRemove();

    expect(component.confirmingUserId).toBeNull();
  });

  it('changes a role via PATCH and refreshes the list from the response', () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;
    component.members = [...MEMBERS];

    component.changeRole('editor-1', 'viewer');

    const req = httpMock.expectOne(`${membersUrl}/editor-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role: 'viewer' });
    const updated = MEMBERS.map((m) =>
      m.userId === 'editor-1' ? { ...m, role: 'viewer' as BoardRole } : m
    );
    req.flush(updated);

    expect(component.members.find((m) => m.userId === 'editor-1')?.role).toBe(
      'viewer'
    );
    expect(component.updatingUserId).toBeNull();
  });

  it('does not PATCH when the selected role equals the current one', () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;
    component.members = [...MEMBERS];

    component.changeRole('editor-1', 'editor');

    httpMock.expectNone(`${membersUrl}/editor-1`);
  });

  it('promotes to owner only after confirmation (PATCH role=owner)', () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;
    component.members = [...MEMBERS];

    component.askPromote('editor-1');
    expect(component.promoteConfirmUserId).toBe('editor-1');

    component.promote('editor-1');
    const req = httpMock.expectOne(`${membersUrl}/editor-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role: 'owner' });
    req.flush([
      { ...MEMBERS[0], role: 'editor' as BoardRole },
      { ...MEMBERS[1], role: 'owner' as BoardRole },
    ]);

    expect(component.members.find((m) => m.userId === 'editor-1')?.role).toBe(
      'owner'
    );
    expect(component.promoteConfirmUserId).toBeNull();
  });

  it('reflects a realtime role change for the active board', () => {
    const fixture = setup(true, makeProject('owner'));
    const component = fixture.componentInstance;
    component.members = [...MEMBERS];

    memberRoleChanged$.next({
      boardId: 'board-1',
      userId: 'editor-1',
      role: 'viewer',
    });

    expect(component.members.find((m) => m.userId === 'editor-1')?.role).toBe(
      'viewer'
    );
  });
});
