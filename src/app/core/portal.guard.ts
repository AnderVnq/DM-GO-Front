import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const portalGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureInitialized();
  if (!auth.user())
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  if (auth.staff()) return router.createUrlTree(['/internal/overview']);
  return auth.portalUser() || router.createUrlTree(['/forbidden']);
};
