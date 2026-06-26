import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { AuthCallbackComponent } from './auth-callback.component';
import { AuthService } from '../../shared/services/auth.service';
import { InvitesService } from '../../shared/services/invites.service';
import { User } from '../../shared/models/user.model';

describe('AuthCallbackComponent', () => {
  let router: jasmine.SpyObj<Router>;
  let handleCallbackToken: jasmine.Spy;
  let pendingInvite: string | null;

  const USER: User = {
    id: 'u1',
    email: 'bob@example.com',
    name: 'Bob',
    avatarUrl: null,
  };

  function setup(token: string | null, user: User | null) {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));
    handleCallbackToken = jasmine
      .createSpy('handleCallbackToken')
      .and.returnValue(of(user));

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(token ? { token } : {}),
            },
          },
        },
        { provide: AuthService, useValue: { handleCallbackToken } },
        {
          provide: InvitesService,
          useValue: { getPendingInvite: () => pendingInvite },
        },
      ],
    });

    const fixture = TestBed.createComponent(AuthCallbackComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('navigates home when no token is present', () => {
    pendingInvite = null;
    setup(null, null);

    expect(handleCallbackToken).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('navigates home after a successful login with no pending invite', () => {
    pendingInvite = null;
    setup('jwt', USER);

    expect(handleCallbackToken).toHaveBeenCalledWith('jwt');
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('resumes a pending invite after a successful login', () => {
    pendingInvite = 'tok123';
    setup('jwt', USER);

    expect(router.navigate).toHaveBeenCalledWith(['/join', 'tok123']);
  });

  it('does not resume the invite when authentication fails', () => {
    pendingInvite = 'tok123';
    setup('bad', null);

    expect(router.navigate).toHaveBeenCalledWith(['/']);
    expect(router.navigate).not.toHaveBeenCalledWith(['/join', 'tok123']);
  });
});
