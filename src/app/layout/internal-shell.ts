import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { Icon, type IconName } from '../shared/icon';

@Component({
  selector: 'app-internal-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './internal-shell.html',
})
export class InternalShell {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly mobileOpen = signal(false);
  readonly navigation: { path: string; label: string; icon: IconName }[] = [
    { path: 'overview', label: 'Resumen', icon: 'overview' },
    { path: 'customers', label: 'Clientes', icon: 'customers' },
    { path: 'packages', label: 'Paquetes', icon: 'packages' },
    { path: 'dispatch-notes', label: 'Notas de salida', icon: 'billing' },
    { path: 'quotes', label: 'Cotizaciones', icon: 'quotes' },
  ];
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
  );
  readonly title = computed(
    () =>
      this.navigation.find((item) => this.url()?.startsWith(`/internal/${item.path}`))?.label ??
      'Operaciones',
  );
  readonly role = computed(() =>
    this.auth.user()?.roles.includes('admin')
      ? 'Administración'
      : this.auth.user()?.roles.includes('supervisor')
        ? 'Supervisión'
        : 'Ventas',
  );
}
