import { type Routes } from '@angular/router';
export const routes: Routes = [
  { path: '', loadComponent: () => import('./notes-page').then((m) => m.NotesPage) },
];
