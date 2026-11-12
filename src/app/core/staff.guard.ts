import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const staffGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.user())
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  return auth.staff() || router.createUrlTree(['/forbidden']);
};
