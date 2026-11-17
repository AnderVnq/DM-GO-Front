import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { safeReturnUrl } from './access';
import { AuthService } from './auth.service';
import { ThemeToggle } from '../shared/theme-toggle';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-login-page',
  imports: [Icon, RouterLink, ThemeToggle],
  styleUrl: './login-page.scss',
  host: { '(window:pageshow)': 'restoreFromHistory($event)' },
  template: `
    <main class="login-page">
      <app-theme-toggle class="login-theme" />
      <section class="login-brand">
        <a class="wordmark" routerLink="/">DM48<span class="brand-dot"></span></a>
        <div>
          <h1>Tus envíos.<br />Siempre a la vista.</h1>
          <p>
            Desde tu casillero en Estados Unidos hasta la entrega en Perú. Accede al espacio que
            conecta tus compras y tu operación.
          </p>
        </div>
        <div class="login-journey" aria-label="Proceso del servicio">
          <div><app-icon name="warehouse" /><span>Recepción en USA</span></div>
          <app-icon name="arrow" />
          <div><app-icon name="plane" /><span>Traslado internacional</span></div>
          <app-icon name="arrow" />
          <div><app-icon name="delivery" /><span>Entrega en Perú</span></div>
        </div>
        <p class="muted">USA <span aria-hidden="true">→</span> Perú · Courier internacional</p>
      </section>
      <section class="login-form inspector">
        <span class="login-access-icon"><app-icon name="overview" /></span>
        <h2>Iniciar sesión</h2>
        <p>
          Continúa con tu cuenta de cliente o de personal. Te llevaremos a tu espacio de trabajo.
        </p>
        @if (auth.error() || error()) {
          <p class="alert" role="alert">{{ error() || auth.error() }}</p>
        }
        <button class="button primary" (click)="login()" [disabled]="busy() || initializing()">
          {{ busy() ? 'Conectando…' : 'Iniciar sesión' }}<app-icon name="arrow" />
        </button>
        <p class="fine-print">Tu sesión se valida en el servicio de acceso de DM48.</p>
        <a class="login-back" routerLink="/"><app-icon name="back" />Volver al inicio</a>
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
            : this.auth.portalUser()
              ? '/portal'
              : '/forbidden';
        void router.navigateByUrl(target);
      }
    });
  }
  readonly error = signal('');
  private loginAttempt = 0;

  restoreFromHistory(event: PageTransitionEvent) {
    if (!event.persisted) return;
    this.loginAttempt++;
    this.busy.set(false);
    this.error.set('');
  }

  async login() {
    if (this.busy() || this.initializing()) return;
    const attempt = ++this.loginAttempt;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.route.snapshot.queryParamMap.get('returnUrl') ?? undefined);
    } catch {
      if (attempt === this.loginAttempt)
        this.error.set('No se pudo iniciar sesión. Vuelve a intentarlo.');
    } finally {
      if (attempt === this.loginAttempt) this.busy.set(false);
    }
  }
}
