import { type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { RuntimeConfig } from './runtime-config';
import { isApiRequest } from './access';
import { requiresLogin } from './session-error';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(RuntimeConfig);
  if (!isApiRequest(request.url, config.value.apiBaseUrl, location.origin)) return next(request);
  const auth = inject(AuthService);
  const router = inject(Router);
  return from(auth.validToken()).pipe(
    switchMap((token) =>
      next(token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request),
    ),
    catchError((error: unknown) => {
      if (requiresLogin(error)) {
        auth.clear();
        void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => error);
    }),
  );
};
