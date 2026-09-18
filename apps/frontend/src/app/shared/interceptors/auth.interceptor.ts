import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { tap } from 'rxjs';

export const AUTH_TOKEN_KEY = 'scheduler_auth_token';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(AUTH_TOKEN_KEY)
      : null;

  if (!token) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  ).pipe(
    tap((event) => {
      // Sliding session: persist the rotated JWT the backend sends on /auth/me.
      if (event instanceof HttpResponse) {
        const refreshed = event.headers.get('X-Refreshed-Token');
        if (refreshed) {
          localStorage.setItem(AUTH_TOKEN_KEY, refreshed);
        }
      }
    }),
  );
};
