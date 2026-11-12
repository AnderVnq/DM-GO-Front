import { type Routes } from '@angular/router';
export const routes: Routes = [
  { path: '', loadComponent: () => import('./customers-page').then((m) => m.CustomersPage) },
];
