import { type Routes } from '@angular/router';
import { staffGuard } from './core/staff.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./core/login-page').then((m) => m.LoginPage) },
  {
    path: 'forbidden',
    loadComponent: () => import('./core/forbidden-page').then((m) => m.ForbiddenPage),
  },
  {
    path: 'internal',
    canActivate: [staffGuard],
    canActivateChild: [staffGuard],
    loadComponent: () => import('./layout/internal-shell').then((m) => m.InternalShell),
    children: [
      {
        path: 'overview',
        loadChildren: () => import('./modules/overview/routes').then((m) => m.routes),
      },
      {
        path: 'customers',
        loadChildren: () => import('./modules/customers/routes').then((m) => m.routes),
      },
      {
        path: 'packages',
        loadChildren: () => import('./modules/shipments/routes').then((m) => m.routes),
      },
      {
        path: 'dispatch-notes',
        loadChildren: () => import('./modules/billing/routes').then((m) => m.routes),
      },
      {
        path: 'quotes',
        loadChildren: () => import('./modules/quotes/routes').then((m) => m.routes),
      },
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
    ],
  },
  { path: '', redirectTo: 'internal/overview', pathMatch: 'full' },
  { path: '**', redirectTo: 'internal/overview' },
];
