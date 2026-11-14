import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ThemeToggle } from '../shared/theme-toggle';
import { Icon, type IconName } from '../shared/icon';

@Component({
  selector: 'app-portal-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ThemeToggle, Icon],
  templateUrl: './portal-shell.html',
  styleUrl: './portal-shell.scss',
})
export class PortalShell {
  readonly auth = inject(AuthService);
  readonly links: { path: string; label: string; icon: IconName }[] = [
    { path: '/portal', label: 'Mi casillero', icon: 'overview' },
    { path: '/portal/packages', label: 'Mis paquetes', icon: 'packages' },
    { path: '/portal/payments', label: 'Mis pagos', icon: 'billing' },
    { path: '/portal/delivery', label: 'Mis entregas', icon: 'delivery' },
    { path: '/portal/consignees', label: 'Mis destinatarios', icon: 'customers' },
    { path: '/portal/notifications', label: 'Mis avisos', icon: 'bell' },
    { path: '/portal/invoices', label: 'Mis comprobantes', icon: 'attachment' },
  ];
}
