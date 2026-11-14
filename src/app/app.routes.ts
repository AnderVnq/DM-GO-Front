import { type Routes } from '@angular/router';
import { staffGuard } from './core/staff.guard';
import { managerGuard } from './core/manager.guard';
import { portalGuard } from './core/portal.guard';

export const routes: Routes = [
  {
    path: 'portal',
    canActivate: [portalGuard],
    canActivateChild: [portalGuard],
    loadComponent: () => import('./layout/portal-shell').then((m) => m.PortalShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Mi casillero · DM48',
        loadComponent: () => import('./modules/portal/portal-page').then((m) => m.PortalPage),
      },
      {
        path: 'packages',
        title: 'Mis paquetes · DM48',
        loadComponent: () =>
          import('./modules/shipments/portal-packages-page').then((m) => m.PortalPackagesPage),
      },
      {
        path: 'delivery',
        title: 'Mis entregas · DM48',
        loadComponent: () =>
          import('./modules/delivery/portal-delivery-page').then((m) => m.PortalDeliveryPage),
      },
      {
        path: 'consignees',
        title: 'Mis destinatarios · DM48',
        loadComponent: () =>
          import('./modules/consignees/portal-consignees-page').then((m) => m.PortalConsigneesPage),
      },
      {
        path: 'notifications',
        title: 'Mis avisos · DM48',
        loadComponent: () =>
          import('./modules/notifications/portal-notifications-page').then(
            (m) => m.PortalNotificationsPage,
          ),
      },
      {
        path: 'payments',
        title: 'Mis pagos · DM48',
        loadComponent: () =>
          import('./modules/billing/portal-payments-page').then((m) => m.PortalPaymentsPage),
      },
      {
        path: 'invoices',
        title: 'Mis comprobantes · DM48',
        loadComponent: () =>
          import('./modules/invoices/portal-invoices-page').then((m) => m.PortalInvoicesPage),
      },
    ],
  },
  {
    path: '',
    title: 'DM48 · Casillero en USA y envíos a Perú',
    pathMatch: 'full',
    loadComponent: () => import('./modules/home/home-page').then((m) => m.HomePage),
  },
  {
    path: 'login',
    title: 'Iniciar sesión · DM48',
    loadComponent: () => import('./core/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./core/forbidden-page').then((m) => m.ForbiddenPage),
  },
  {
    path: 'internal',
    title: 'Panel interno · DM48',
    canActivate: [staffGuard],
    canActivateChild: [staffGuard],
    loadComponent: () => import('./layout/internal-shell').then((m) => m.InternalShell),
    children: [
      {
        path: 'overview',
        loadChildren: () => import('./modules/overview/routes').then((m) => m.routes),
      },
      {
        path: 'customers',
        loadChildren: () => import('./modules/customers/routes').then((m) => m.routes),
      },
      {
        path: 'packages',
        loadChildren: () => import('./modules/shipments/routes').then((m) => m.routes),
      },
      {
        path: 'dispatch-notes',
        loadChildren: () => import('./modules/billing/routes').then((m) => m.routes),
      },
      {
        path: 'bulks',
        title: 'Bultos · DM48',
        canActivate: [managerGuard],
        loadComponent: () => import('./modules/consolidation/bulks-page').then((m) => m.BulksPage),
      },
      {
        path: 'consolidations',
        title: 'Consolidados · DM48',
        canActivate: [managerGuard],
        loadComponent: () =>
          import('./modules/consolidation/consolidations-page').then((m) => m.ConsolidationsPage),
      },
      {
        path: 'warehouses/receiving',
        title: 'Recepción en USA · DM48',
        canActivate: [managerGuard],
        loadComponent: () =>
          import('./modules/warehouses/receiving-page').then((m) => m.ReceivingPage),
      },
      {
        path: 'warehouses/unidentified',
        title: 'Paquetes sin identificar · DM48',
        canActivate: [managerGuard],
        loadComponent: () =>
          import('./modules/warehouses/unidentified-page').then((m) => m.UnidentifiedPage),
      },
      {
        path: 'warehouses',
        title: 'Almacenes · DM48',
        loadComponent: () =>
          import('./modules/warehouses/warehouses-page').then((m) => m.WarehousesPage),
      },
      {
        path: 'quotes',
        loadChildren: () => import('./modules/quotes/routes').then((m) => m.routes),
      },
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
