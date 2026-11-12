import { Component, inject } from '@angular/core';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-forbidden-page',
  template:
    '<main class="standalone-page"><h1>Acceso restringido</h1><p>Esta área está disponible para el personal de DM48.</p><button class="button primary" (click)="auth.logout()">Cambiar de cuenta</button></main>',
})
export class ForbiddenPage {
  readonly auth = inject(AuthService);
}
