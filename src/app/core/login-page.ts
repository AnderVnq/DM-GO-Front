import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { safeReturnUrl } from './access';
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
          <h1>Bienvenido<br />a DM48.</h1>
          <p>Ingresa a tu cuenta para continuar con tus compras o gestionar la operación.</p>
        </div>
        <p class="muted">USA <span aria-hidden="true">→</span> Perú · Courier internacional</p>
      </section>
      <section class="login-form inspector">
        <app-icon name="packages" />
        <h2>Iniciar sesión</h2>
        <p>Usa tu cuenta de cliente o de personal.</p>
        @if (auth.error() || error()) {
          <p class="alert" role="alert">{{ error() || auth.error() }}</p>
        }
        <button class="button primary" (click)="login()" [disabled]="busy() || initializing()">
          {{ busy() ? 'Conectando…' : 'Iniciar sesión' }}<app-icon name="arrow" />
        </button>
        <p class="fine-print">
          Tu cuenta y tus datos se gestionan mediante el acceso seguro de DM48.
        </p>
      </section>
    </main>
  `,
})
export class LoginPage {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly busy = signal(false);
  readonly initializing = signal(true);

  constructor() {
    const router = inject(Router);
    void this.auth.ensureInitialized().then(() => {
      this.initializing.set(false);
      if (this.auth.user()) {
        const requested = this.route.snapshot.queryParamMap.get('returnUrl');
        const target = requested
          ? safeReturnUrl(requested)
          : this.auth.staff()
            ? '/internal/overview'
            : '/portal';
        void router.navigateByUrl(target);
      }
    });
  }
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
