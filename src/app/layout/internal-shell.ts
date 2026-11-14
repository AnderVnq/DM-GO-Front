import {
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ThemeToggle } from '../shared/theme-toggle';
import { Icon, type IconName } from '../shared/icon';

@Component({
  selector: 'app-internal-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, ThemeToggle],
  templateUrl: './internal-shell.html',
  host: { '(document:keydown.escape)': 'closeNavigation()' },
})
export class InternalShell {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly mobileOpen = signal(false);
  private readonly injector = inject(Injector);
  private readonly menuToggle = viewChild.required<ElementRef<HTMLButtonElement>>('menuToggle');
  private readonly sidebar = viewChild.required<ElementRef<HTMLElement>>('sidebar');

  toggleNavigation() {
    if (this.mobileOpen()) {
      this.closeNavigation();
      return;
    }
    this.mobileOpen.set(true);
    afterNextRender(
      () => {
        if (this.mobileOpen()) this.sidebar().nativeElement.querySelector('a')?.focus();
      },
      { injector: this.injector },
    );
  }

  closeNavigation() {
    if (!this.mobileOpen()) return;
    this.mobileOpen.set(false);
    this.menuToggle().nativeElement.focus();
  }
  readonly navigation: { path: string; label: string; icon: IconName }[] = [
    { path: 'overview', label: 'Resumen', icon: 'overview' },
    { path: 'customers', label: 'Clientes', icon: 'customers' },
    { path: 'packages', label: 'Paquetes', icon: 'packages' },
    { path: 'dispatch-notes', label: 'Notas de salida', icon: 'billing' },
    { path: 'warehouses', label: 'Almacenes', icon: 'warehouse' },
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
