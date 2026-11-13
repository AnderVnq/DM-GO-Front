import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeToggle } from '../shared/theme-toggle';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-login-page',
  imports: [Icon, RouterLink, ThemeToggle],
  template: `
    <main class="login-page">
      <app-theme-toggle class="login-theme" />
      <section class="login-brand">
        <a class="wordmark" routerLink="/">DM48<span class="brand-dot"></span></a>
        <div>
          <h1>Tu operación,<br />en un solo lugar.</h1>
          <p>
            Del casillero en USA a la entrega en Perú.<br />Control y trazabilidad en cada paso.
          </p>
        </div>
        <p class="muted">USA <span aria-hidden="true">→</span> Perú · Courier internacional</p>
      </section>
      <section class="login-form inspector">
        <app-icon name="packages" />
        <h2>Panel interno</h2>
        <p>Accede con tu cuenta de personal para continuar.</p>
        @if (auth.error() || error()) {
          <p class="alert" role="alert">{{ error() || auth.error() }}</p>
        }
        <button class="button primary" (click)="login()" [disabled]="busy()">
          {{ busy() ? 'Conectando…' : 'Iniciar sesión' }}<app-icon name="arrow" />
        </button>
        <p class="fine-print">El acceso se gestiona mediante tu cuenta corporativa.</p>
      </section>
    </main>
  `,
})
export class LoginPage {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly busy = signal(false);
  readonly error = signal('');
  async login() {
    this.busy.set(true);
    try {
      await this.auth.login(this.route.snapshot.queryParamMap.get('returnUrl') ?? undefined);
    } catch {
      this.error.set('No se pudo iniciar sesión. Recarga la página e inténtalo de nuevo.');
      this.busy.set(false);
    }
  }
}
