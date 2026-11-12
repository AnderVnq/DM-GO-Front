import { type Routes } from '@angular/router';
export const routes: Routes = [
  { path: '', loadComponent: () => import('./packages-page').then((m) => m.PackagesPage) },
];
