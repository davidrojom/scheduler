import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { AUTH_TOKEN_KEY, authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem(AUTH_TOKEN_KEY);
  });

  it('attaches Authorization: Bearer header when a token exists', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'jwt-123');

    http.get('/api/auth/me').subscribe();

    const req = httpMock.expectOne('/api/auth/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-123');
    req.flush({});
  });

  it('does not attach an Authorization header when no token is present', () => {
    http.get('/api/boards').subscribe();

    const req = httpMock.expectOne('/api/boards');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush([]);
  });
});
