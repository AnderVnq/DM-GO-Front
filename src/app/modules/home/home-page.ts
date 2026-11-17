import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { setupHeroMotion } from './hero-motion';
import { setupProcessMotion } from './process-motion';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ThemeToggle } from '../../shared/theme-toggle';
import { Icon } from '../../shared/icon';

interface BusinessInfo {
  legalName: string;
  taxId: string;
  fiscalAddress: string;
  email: string;
  phone: string;
  hours: string;
}

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, ThemeToggle, Icon],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
  host: { '(window:pageshow)': 'restoreFromHistory($event)' },
})
export class HomePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly business = signal<BusinessInfo | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly year = new Date().getFullYear();

  private readonly hero = viewChild.required<ElementRef<HTMLElement>>('hero');

  private readonly process = viewChild.required<ElementRef<HTMLElement>>('process');

  constructor() {
    const destroy = inject(DestroyRef);
    let cleanup: (() => void) | undefined;
    afterNextRender(() => {
      const heroCleanup = setupHeroMotion(this.hero().nativeElement);
      const processCleanup = setupProcessMotion(this.process().nativeElement);
      cleanup = () => {
        heroCleanup();
        processCleanup();
      };
    });
    destroy.onDestroy(() => cleanup?.());
    void fetch('/business-info.json')
      .then(async (response) => {
        if (response.ok) this.business.set((await response.json()) as BusinessInfo);
      })
      .catch(() => {
        /* La información comercial no bloquea la portada. */
      });
  }

  private registrationAttempt = 0;

  restoreFromHistory(event: PageTransitionEvent) {
    if (!event.persisted) return;
    this.registrationAttempt++;
    this.busy.set(false);
    this.error.set('');
  }

  async createLocker() {
    if (this.busy()) return;
    const attempt = ++this.registrationAttempt;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.ensureInitialized(true);
      if (attempt !== this.registrationAttempt) return;
      if (this.auth.user()) {
        await this.router.navigateByUrl(this.auth.staff() ? '/internal/overview' : '/portal');
      } else await this.auth.register();
    } catch {
      if (attempt === this.registrationAttempt)
        this.error.set('No se pudo abrir el registro. Inténtalo de nuevo en unos momentos.');
    } finally {
      if (attempt === this.registrationAttempt) this.busy.set(false);
    }
  }
}
