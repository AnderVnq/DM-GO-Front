import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const managerGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureInitialized();
  if (!auth.user())
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  return auth.manager() || router.createUrlTree(['/forbidden']);
};
