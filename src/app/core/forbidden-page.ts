import { Component, inject } from '@angular/core';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-forbidden-page',
  template:
    '<main class="standalone-page"><h1>Acceso restringido</h1><p>Tu cuenta no tiene acceso a esta área. Puedes cambiar de cuenta para continuar.</p><button class="button primary" (click)="auth.logout()">Cambiar de cuenta</button></main>',
})
export class ForbiddenPage {
  readonly auth = inject(AuthService);
}
