import { type Routes } from '@angular/router';
export const routes: Routes = [
  { path: '', loadComponent: () => import('./quotes-page').then((m) => m.QuotesPage) },
];
