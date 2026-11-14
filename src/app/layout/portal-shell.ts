import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
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
  selector: 'app-portal-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ThemeToggle, Icon],
  templateUrl: './portal-shell.html',
  styleUrl: './portal-shell.scss',
  host: { '(document:keydown.escape)': 'closeNavigation()' },
})
export class PortalShell {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  readonly mobileOpen = signal(false);
  private readonly sidebar = viewChild.required<ElementRef<HTMLElement>>('sidebar');
  private readonly menuToggle = viewChild.required<ElementRef<HTMLButtonElement>>('menuToggle');
  readonly links: { path: string; label: string; icon: IconName }[] = [
    { path: '/portal', label: 'Mi casillero', icon: 'overview' },
    { path: '/portal/packages', label: 'Mis paquetes', icon: 'packages' },
    { path: '/portal/delivery', label: 'Mis entregas', icon: 'delivery' },
    { path: '/portal/consignees', label: 'Mis destinatarios', icon: 'customers' },
    { path: '/portal/payments', label: 'Mis pagos', icon: 'billing' },
    { path: '/portal/invoices', label: 'Mis comprobantes', icon: 'attachment' },
    { path: '/portal/notifications', label: 'Mis avisos', icon: 'bell' },
  ];
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
  );
  constructor() {
    const desktop = this.document.defaultView?.matchMedia('(min-width: 701px)');
    const resize = () => {
      if (desktop?.matches) this.closeNavigation();
    };
    desktop?.addEventListener('change', resize);
    inject(DestroyRef).onDestroy(() => desktop?.removeEventListener('change', resize));
  }
  readonly title = computed(
    () =>
      this.links.find((link) => (this.url() ?? '').split('?')[0] === link.path)?.label ??
      'Mi cuenta',
  );
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
    afterNextRender(
      () => {
        const toggle = this.menuToggle().nativeElement;
        if (toggle.getClientRects().length) toggle.focus();
        else
          this.sidebar()
            .nativeElement.querySelector<HTMLElement>('a[aria-current="page"]')
            ?.focus();
      },
      { injector: this.injector },
    );
  }
  trapNavigation(event: KeyboardEvent) {
    if (!this.mobileOpen() || event.key !== 'Tab') return;
    const items = this.sidebar().nativeElement.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first?.focus();
    }
  }
}
