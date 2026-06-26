import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, distinctUntilChanged, tap } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { User } from '../models/user.model';
import { AUTH_TOKEN_KEY } from '../interceptors/auth.interceptor';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly _currentUser$ = new BehaviorSubject<User | null>(null);

  readonly currentUser$: Observable<User | null> =
    this._currentUser$.asObservable();

  private readonly _authState$ = new BehaviorSubject<boolean>(
    !!this.getToken()
  );

  /**
   * Emits whether a token is present. Distinct from `currentUser$`, which only
   * emits once `/auth/me` resolves; persistence selection keys on token
   * presence so this stream drives DB-vs-local board (re)loading.
   */
  readonly authState$: Observable<boolean> = this._authState$.pipe(
    distinctUntilChanged()
  );

  constructor(private readonly http: HttpClient) {
    this.restoreSession();
  }

  get isAuthenticated(): boolean {
    return !!this.getToken();
  }

  get currentUser(): User | null {
    return this._currentUser$.value;
  }

  login(): void {
    window.location.href = `${environment.apiBaseUrl}/auth/google`;
  }

  getToken(): string | null {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(AUTH_TOKEN_KEY)
      : null;
  }

  handleCallbackToken(token: string): Observable<User | null> {
    this.setToken(token);

    return this.fetchCurrentUser().pipe(
      catchError(() => {
        this.clearSession();
        return of(null);
      }),
    );
  }

  logout(): void {
    this.clearSession();
  }

  private restoreSession(): void {
    if (!this.getToken()) {
      return;
    }

    this.fetchCurrentUser()
      .pipe(
        catchError(() => {
          this.clearSession();
          return of(null);
        }),
      )
      .subscribe();
  }

  private fetchCurrentUser(): Observable<User> {
    return this.http
      .get<User>(`${environment.apiBaseUrl}/auth/me`)
      .pipe(tap((user) => this._currentUser$.next(user)));
  }

  private setToken(token: string): void {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    this._authState$.next(true);
  }

  private clearSession(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    this._currentUser$.next(null);
    this._authState$.next(false);
  }
}
