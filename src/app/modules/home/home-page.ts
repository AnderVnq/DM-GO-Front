import { Component, inject, signal } from '@angular/core';
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
})
export class HomePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly business = signal<BusinessInfo | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly year = new Date().getFullYear();

  constructor() {
    void fetch('/business-info.json')
      .then(async (response) => {
        if (response.ok) this.business.set((await response.json()) as BusinessInfo);
      })
      .catch(() => {
        /* La información comercial no bloquea la portada. */
      });
  }

  async createLocker() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.ensureInitialized(true);
      if (this.auth.user()) {
        await this.router.navigateByUrl(this.auth.staff() ? '/internal/overview' : '/portal');
        this.busy.set(false);
      } else await this.auth.register();
    } catch {
      this.error.set('No se pudo abrir el registro. Inténtalo de nuevo en unos momentos.');
      this.busy.set(false);
    }
  }
}
