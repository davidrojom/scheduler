import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';
import { AUTH_TOKEN_KEY } from '../interceptors/auth.interceptor';
import { User } from '../models/user.model';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let httpMock: HttpTestingController;
  const meUrl = `${environment.apiBaseUrl}/auth/me`;
  const sampleUser: User = {
    id: 'u1',
    email: 'alice@example.com',
    name: 'Alice',
    avatarUrl: null,
  };

  function createService(): AuthService {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    const service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    return service;
  }

  afterEach(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  });

  it('starts anonymous with no token in storage', () => {
    const service = createService();

    expect(service.getToken()).toBeNull();
    expect(service.isAuthenticated).toBeFalse();
    expect(service.currentUser).toBeNull();
    httpMock.verify();
  });

  it('handleCallbackToken stores the token and loads the current user', async () => {
    const service = createService();

    const userPromise = firstValueFrom(service.handleCallbackToken('valid.jwt.token'));

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('valid.jwt.token');

    const req = httpMock.expectOne(meUrl);
    expect(req.request.method).toBe('GET');
    req.flush(sampleUser);

    await expectAsync(userPromise).toBeResolvedTo(sampleUser);
    expect(service.isAuthenticated).toBeTrue();
    expect(service.currentUser).toEqual(sampleUser);
    httpMock.verify();
  });

  it('emits the authenticated user through currentUser$', async () => {
    const service = createService();

    service.handleCallbackToken('valid.jwt.token').subscribe();
    httpMock.expectOne(meUrl).flush(sampleUser);

    const emitted = await firstValueFrom(service.currentUser$);
    expect(emitted).toEqual(sampleUser);
    httpMock.verify();
  });

  it('handleCallbackToken with an invalid token does NOT establish a session', async () => {
    const service = createService();

    const resultPromise = firstValueFrom(
      service.handleCallbackToken('not.a.valid.jwt'),
    );

    httpMock
      .expectOne(meUrl)
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    const result = await resultPromise;

    expect(result).toBeNull();
    expect(service.currentUser).toBeNull();
    expect(service.isAuthenticated).toBeFalse();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    httpMock.verify();
  });

  it('rehydrates the session from a stored token on construction', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'stored.jwt.token');

    const service = createService();

    const req = httpMock.expectOne(meUrl);
    expect(req.request.method).toBe('GET');
    req.flush(sampleUser);

    expect(service.isAuthenticated).toBeTrue();
    expect(service.currentUser).toEqual(sampleUser);
    httpMock.verify();
  });

  it('clears a stored token that the backend rejects on construction', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'expired.jwt.token');

    const service = createService();

    httpMock
      .expectOne(meUrl)
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(service.currentUser).toBeNull();
    expect(service.isAuthenticated).toBeFalse();
    httpMock.verify();
  });

  it('logout clears the token and current user', () => {
    const service = createService();

    service.handleCallbackToken('valid.jwt.token').subscribe();
    httpMock.expectOne(meUrl).flush(sampleUser);
    expect(service.isAuthenticated).toBeTrue();

    service.logout();

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(service.currentUser).toBeNull();
    expect(service.isAuthenticated).toBeFalse();
    httpMock.verify();
  });
});
