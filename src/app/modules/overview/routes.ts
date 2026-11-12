import { type Routes } from '@angular/router';
export const routes: Routes = [
  { path: '', loadComponent: () => import('./overview-page').then((m) => m.OverviewPage) },
];
