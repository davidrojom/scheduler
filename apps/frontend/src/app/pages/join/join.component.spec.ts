import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import { JoinComponent } from './join.component';
import { AuthService } from '../../shared/services/auth.service';
import { ProjectService } from '../../shared/services/project.service';
import {
  InvitesService,
  PENDING_INVITE_KEY,
} from '../../shared/services/invites.service';
import { environment } from '../../../environments/environment';

describe('JoinComponent', () => {
  let httpMock: HttpTestingController;
  let router: Router;
  let openBoard: jasmine.Spy;
  let login: jasmine.Spy;
  let authenticated: boolean;

  const TOKEN = 'tok123';
  const inviteUrl = `${environment.apiBaseUrl}/invites/${TOKEN}`;
  const acceptUrl = `${environment.apiBaseUrl}/invites/${TOKEN}/accept`;

  function setup(isAuthenticated: boolean, token: string = TOKEN) {
    authenticated = isAuthenticated;
    openBoard = jasmine.createSpy('openBoard').and.returnValue(of(undefined));
    login = jasmine.createSpy('login');

    TestBed.configureTestingModule({
      imports: [JoinComponent, HttpClientTestingModule, RouterTestingModule],
      providers: [
        InvitesService,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ token }) } },
        },
        {
          provide: AuthService,
          useValue: {
            get isAuthenticated() {
              return authenticated;
            },
            login,
          },
        },
        { provide: ProjectService, useValue: { openBoard } },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    const fixture = TestBed.createComponent(JoinComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem(PENDING_INVITE_KEY);
  });

  it('shows the invalid-invite state and grants no access for an invalid token', () => {
    const fixture = setup(true);

    httpMock.expectOne(inviteUrl).flush({
      boardId: null,
      boardName: null,
      role: null,
      valid: false,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.status).toBe('invalid');
    expect(openBoard).not.toHaveBeenCalled();

    const invalid = fixture.nativeElement.querySelector('[data-invalid-invite]');
    expect(invalid).not.toBeNull();
  });

  it('renders board name + role + accept control for an authenticated user', () => {
    const fixture = setup(true);

    httpMock.expectOne(inviteUrl).flush({
      boardId: 'board-1',
      boardName: 'Contract Board',
      role: 'viewer',
      valid: true,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.status).toBe('ready');
    const name = fixture.nativeElement.querySelector('[data-join-board-name]');
    const role = fixture.nativeElement.querySelector('[data-join-role]');
    const accept = fixture.nativeElement.querySelector('[data-accept-button]');
    expect(name.textContent).toContain('Contract Board');
    expect(role.textContent).toContain('viewer');
    expect(accept).not.toBeNull();
  });

  it('accepts the invite then opens the board and navigates home', () => {
    const fixture = setup(true);

    httpMock.expectOne(inviteUrl).flush({
      boardId: 'board-1',
      boardName: 'Contract Board',
      role: 'editor',
      valid: true,
    });

    fixture.componentInstance.accept();

    const acceptReq = httpMock.expectOne(acceptUrl);
    expect(acceptReq.request.method).toBe('POST');
    acceptReq.flush({ boardId: 'board-1' });

    expect(openBoard).toHaveBeenCalledWith('board-1');
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('prompts an unauthenticated visitor to log in and stores a pending invite', () => {
    const fixture = setup(false);

    httpMock.expectOne(inviteUrl).flush({
      boardId: 'board-1',
      boardName: 'Contract Board',
      role: 'viewer',
      valid: true,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.status).toBe('login');
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBe(TOKEN);

    const loginBtn = fixture.nativeElement.querySelector('[data-login-button]');
    expect(loginBtn).not.toBeNull();

    fixture.componentInstance.login();
    expect(login).toHaveBeenCalled();
  });

  it('auto-accepts when an authenticated user resumes a pending invite', () => {
    localStorage.setItem(PENDING_INVITE_KEY, TOKEN);
    const fixture = setup(true);

    httpMock.expectOne(inviteUrl).flush({
      boardId: 'board-1',
      boardName: 'Contract Board',
      role: 'viewer',
      valid: true,
    });

    const acceptReq = httpMock.expectOne(acceptUrl);
    expect(acceptReq.request.method).toBe('POST');
    acceptReq.flush({ boardId: 'board-1' });

    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
    expect(openBoard).toHaveBeenCalledWith('board-1');
    expect(router.navigate).toHaveBeenCalledWith(['/']);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
