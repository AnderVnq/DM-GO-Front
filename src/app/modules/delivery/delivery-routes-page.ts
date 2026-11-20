import { RouteMap } from './route-map';
import { RouteLive } from './route-live';
import { LoadingIndicator } from '../../shared/loading-indicator';
import { RecordBrowser } from '../../shared/record-browser';
import {
  afterNextRender,
  Component,
  DestroyRef,
  inject,
  Injector,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { requestMessage } from '../../core/api-problem';
import { formatDate } from '../../shared/amount';
import { Icon } from '../../shared/icon';
import { Status } from '../../shared/status';
import { WarehousesApi, type Warehouse } from '../warehouses';
import { ShipmentsApi, type Package } from '../shipments';
import { DeliveryRoutesApi } from './delivery-routes-api';
import {
  packageResults,
  routeStatuses,
  stopStatuses,
  type DeliveryRoute,
  type DeliveryDriver,
  type RouteStop,
} from './delivery-route.model';
import {
  canStartRoute,
  canCompleteRoute,
  validRouteDate,
  todayInLima,
  routeDayLabel,
  routeReference,
  validPackageId,
  validFailureSelection,
} from './delivery-route-rules';
@Component({
  selector: 'app-delivery-routes-page',
  imports: [
    RouteMap,
    RouteLive,
    LoadingIndicator,
    RecordBrowser,
    ReactiveFormsModule,
    Icon,
    Status,
  ],
  templateUrl: './delivery-routes-page.html',
  styleUrl: './delivery-routes-page.scss',
})
export class DeliveryRoutesPage {
  selectPackage(id: string) {
    if (!this.canOperate || this.packageLoading()) return;
    this.packageForm.controls.reference.setValue(id);
    this.checkPackage();
  }
  readonly auth = inject(AuthService);
  private readonly api = inject(DeliveryRoutesApi);
  private readonly warehousesApi = inject(WarehousesApi);
  private readonly shipments = inject(ShipmentsApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly activated = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  readonly routes = signal<DeliveryRoute[]>([]);
  readonly selected = signal<DeliveryRoute | null>(null);
  readonly drivers = signal<DeliveryDriver[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly checkedPackage = signal<Package | null>(null);
  readonly loading = signal(false);
  readonly detailLoading = signal(false);
  readonly busy = signal(false);
  readonly stale = signal(false);
  readonly packageLoading = signal(false);
  readonly driversLoading = signal(false);
  readonly warehousesLoading = signal(false);
  readonly listError = signal('');
  readonly error = signal('');
  readonly driversError = signal('');
  readonly warehousesError = signal('');
  readonly createError = signal('');
  readonly packageError = signal('');
  readonly modalError = signal('');
  readonly notice = signal('');
  readonly creating = signal(false);
  readonly uncertainCreate = signal(false);
  readonly action = signal<'start' | 'complete' | null>(null);
  readonly failing = signal(false);
  readonly failureStop = signal<RouteStop | null>(null);
  readonly failureNotice = signal('');
  readonly failureIds = signal<string[]>([]);
  readonly listForm = this.fb.nonNullable.group({ date: [todayInLima()] });
  readonly lookup = this.fb.nonNullable.group({ reference: [''] });
  readonly createForm = this.fb.nonNullable.group({
    date: [todayInLima()],
    driver_id: [''],
    warehouse_code: [''],
  });
  readonly packageForm = this.fb.nonNullable.group({ reference: [''] });
  readonly failure = this.fb.nonNullable.group({ reason: [''] });
  readonly createDialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  readonly actionDialog = viewChild.required<ElementRef<HTMLDialogElement>>('actionDialog');
  readonly failDialog = viewChild.required<ElementRef<HTMLDialogElement>>('failDialog');
  readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('routeHeading');
  readonly day = routeDayLabel;
  readonly date = formatDate;
  readonly statuses = routeStatuses;
  readonly stopStatuses = stopStatuses;
  readonly results = packageResults;
  private listRequest?: Subscription;
  private detailRequest?: Subscription;
  private packageRequest?: Subscription;
  private lastRouteId = '';
  private actionRouteId = '';
  private failureRouteId = '';
  constructor() {
    const date = this.activated.snapshot.queryParamMap.get('date');
    if (date && validRouteDate(date)) this.listForm.controls.date.setValue(date);
    this.loadRoutes();
    this.loadDrivers();
    this.loadWarehouses();
    const changes = this.packageForm.controls.reference.valueChanges.subscribe(() => {
      this.packageRequest?.unsubscribe();
      this.checkedPackage.set(null);
      this.packageLoading.set(false);
      this.packageError.set('');
    });
    this.destroyRef.onDestroy(() => {
      this.listRequest?.unsubscribe();
      this.detailRequest?.unsubscribe();
      this.packageRequest?.unsubscribe();
      changes.unsubscribe();
    });
    const id = this.activated.snapshot.queryParamMap.get('route_id');
    if (id) {
      this.lookup.controls.reference.setValue(id);
      this.openReference();
    }
  }
  get validDate() {
    return validRouteDate(this.listForm.controls.date.value);
  }
  get canOperate() {
    return (
      this.auth.manager() &&
      !!this.selected() &&
      !this.busy() &&
      !this.stale() &&
      !this.detailLoading()
    );
  }
  get canCreate() {
    const v = this.createForm.getRawValue();
    return (
      this.auth.manager() &&
      !this.busy() &&
      !this.uncertainCreate() &&
      validRouteDate(v.date) &&
      this.drivers().some((d) => d.id === v.driver_id) &&
      this.warehouses().some((w) => w.code === v.warehouse_code) &&
      !this.driversLoading() &&
      !this.warehousesLoading() &&
      !this.driversError() &&
      !this.warehousesError()
    );
  }
  get canAdd() {
    const route = this.selected(),
      p = this.checkedPackage();
    return (
      this.canOperate &&
      route?.status === 'planned' &&
      !!p &&
      !this.packageLoading() &&
      !route.stops.some((s) => s.packages.some((item) => item.package_id === p.id))
    );
  }
  get canConfirmAction() {
    const route = this.selected();
    return (
      !!route &&
      this.canOperate &&
      route.id === this.actionRouteId &&
      (this.action() === 'start'
        ? canStartRoute(route)
        : this.action() === 'complete' && canCompleteRoute(route))
    );
  }
  get canFail() {
    const route = this.selected(),
      stop = route?.stops.find((s) => s.id === this.failureStop()?.id);
    return (
      this.canOperate &&
      this.failing() &&
      route?.id === this.failureRouteId &&
      route.status === 'in_progress' &&
      !!stop &&
      validFailureSelection(stop.packages, this.failureIds(), this.failure.controls.reason.value)
    );
  }
  get canReloadDetail() {
    return !!this.lastRouteId;
  }
  startAllowed(route: DeliveryRoute) {
    return canStartRoute(route);
  }
  completeAllowed(route: DeliveryRoute) {
    return canCompleteRoute(route);
  }
  pendingCount(route: DeliveryRoute) {
    return route.stops.reduce(
      (n, s) => n + s.packages.filter((p) => p.result === 'pending').length,
      0,
    );
  }
  loadDrivers() {
    if (!this.auth.manager() || this.busy() || this.driversLoading()) return;
    this.driversLoading.set(true);
    this.driversError.set('');
    this.api
      .drivers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (drivers) => {
          this.drivers.set(drivers);
          this.driversLoading.set(false);
        },
        error: (error: unknown) => {
          this.driversLoading.set(false);
          this.driversError.set(requestMessage(error));
        },
      });
  }
  loadWarehouses() {
    if (!this.auth.manager() || this.busy() || this.warehousesLoading()) return;
    this.warehousesLoading.set(true);
    this.warehousesError.set('');
    this.warehousesApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.warehouses.set(items.filter((w) => w.active && w.country === 'PE'));
          this.warehousesLoading.set(false);
        },
        error: (error: unknown) => {
          this.warehousesLoading.set(false);
          this.warehousesError.set(requestMessage(error));
        },
      });
  }
  loadRoutes() {
    if (!this.auth.manager() || this.busy() || !this.validDate) return;
    const date = this.listForm.controls.date.value;
    this.listRequest?.unsubscribe();
    this.loading.set(true);
    this.listError.set('');
    this.listRequest = this.api.list(date).subscribe({
      next: (routes) => {
        this.routes.set(routes);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.listError.set(requestMessage(error));
      },
    });
    void this.router.navigate([], {
      queryParams: { date },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  openReference() {
    if (this.busy() || this.creating() || this.action() || this.failing()) return;
    const id = routeReference(this.lookup.controls.reference.value, location.origin);
    if (!id) {
      this.error.set('Introduce una referencia UUID o un enlace de rutas de esta aplicación.');
      return;
    }
    this.selectId(id);
  }
  select(route: DeliveryRoute) {
    if (this.busy() || this.creating() || this.action() || this.failing()) return;
    this.selectId(route.id);
  }
  private selectId(id: string) {
    this.packageRequest?.unsubscribe();
    this.packageLoading.set(false);
    this.checkedPackage.set(null);
    this.packageForm.reset();
    this.selected.set(null);
    this.notice.set('');
    this.read(id, false, true);
  }
  reload() {
    if (!this.busy() && this.lastRouteId) this.read(this.lastRouteId);
  }
  private read(id: string, preserveError = false, focus = false) {
    this.detailRequest?.unsubscribe();
    this.lastRouteId = id;
    this.detailLoading.set(true);
    this.stale.set(true);
    if (!preserveError) this.error.set('');
    this.detailRequest = this.api.get(id).subscribe({
      next: (route) => {
        this.apply(route);
        this.detailLoading.set(false);
        if (focus) this.focusHeading();
      },
      error: (error: unknown) => {
        this.detailLoading.set(false);
        this.error.set(`${requestMessage(error)} Actualiza la ruta antes de seguir operando.`);
      },
    });
  }
  private apply(route: DeliveryRoute) {
    if (this.selected()?.id !== route.id || route.status !== 'planned') {
      this.packageRequest?.unsubscribe();
      this.packageLoading.set(false);
      this.checkedPackage.set(null);
      this.packageForm.reset();
    }
    if (this.failing() && route.id === this.failureRouteId) {
      const stop = route.stops.find((item) => item.id === this.failureStop()?.id);
      const before = this.failureIds();
      const remaining = before.filter((id) =>
        stop?.packages.some((pkg) => pkg.package_id === id && pkg.result === 'pending'),
      );
      const removed = before.filter((id) => !remaining.includes(id));
      this.failureStop.set(stop ?? null);
      this.failureIds.set(remaining);
      this.failureNotice.set(
        removed.length
          ? `Ya se resolvieron y se retiraron de la selección: ${removed.join(', ')}. Revisa los paquetes pendientes antes de confirmar.`
          : 'La ruta se actualizó. Revisa la selección antes de confirmar.',
      );
    }
    this.selected.set(route);
    this.lastRouteId = route.id;
    this.stale.set(false);
    this.lookup.controls.reference.setValue(route.id);
    this.routes.update((routes) => routes.map((r) => (r.id === route.id ? route : r)));
    void this.router.navigate([], {
      queryParams: { route_id: route.id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  startCreate() {
    if (!this.auth.manager() || this.busy() || this.detailLoading()) return;
    this.createForm.reset({
      date: this.validDate ? this.listForm.controls.date.value : todayInLima(),
      driver_id: '',
      warehouse_code: this.warehouses()[0]?.code ?? '',
    });
    this.createError.set('');
    this.uncertainCreate.set(false);
    this.creating.set(true);
    this.createDialog().nativeElement.showModal();
  }
  cancelCreate(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.createDialog().nativeElement.close();
    this.creating.set(false);
    this.createForm.reset();
    this.createError.set('');
  }
  create() {
    if (!this.creating() || !this.canCreate) return;
    const input = this.createForm.getRawValue();
    this.busy.set(true);
    this.createError.set('');
    this.notice.set('');
    this.api
      .create(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (route) => {
          this.busy.set(false);
          this.cancelCreate();
          this.listForm.controls.date.setValue(input.date);
          this.apply(route);
          this.notice.set('Ruta creada. Comprueba los paquetes antes de asignarlos.');
          this.loadRoutes();
          this.read(route.id, false, true);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.createError.set(requestMessage(error));
          if (this.uncertain(error)) {
            this.uncertainCreate.set(true);
            this.listForm.controls.date.setValue(input.date);
            this.loadRoutes();
            this.createError.set(
              `${requestMessage(error)} La ruta puede haberse creado. Cancela y revisa las rutas de esa fecha antes de crear otra.`,
            );
          }
        },
      });
  }
  checkPackage() {
    if (!this.canOperate || this.selected()?.status !== 'planned') return;
    const id = this.packageForm.controls.reference.value.trim();
    if (!validPackageId(id)) {
      this.packageError.set('Introduce la referencia UUID del paquete.');
      return;
    }
    this.packageRequest?.unsubscribe();
    this.checkedPackage.set(null);
    this.packageLoading.set(true);
    this.packageError.set('');
    this.packageRequest = this.shipments.get(id).subscribe({
      next: (pkg) => {
        this.checkedPackage.set(pkg);
        this.packageLoading.set(false);
      },
      error: (error: unknown) => {
        this.packageLoading.set(false);
        this.packageError.set(requestMessage(error));
      },
    });
  }
  addPackage() {
    const route = this.selected(),
      pkg = this.checkedPackage();
    if (!route || !pkg || !this.canAdd) return;
    this.busy.set(true);
    this.packageError.set('');
    this.notice.set('');
    this.api
      .add(route.id, pkg.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.apply(updated);
          this.checkedPackage.set(null);
          this.packageForm.reset();
          this.notice.set('Paquete asignado. El servidor agrupó la parada según su destino.');
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.packageError.set(requestMessage(error));
          if (this.uncertain(error)) this.read(route.id, true);
        },
      });
  }
  prepareAction(action: 'start' | 'complete') {
    const route = this.selected();
    if (
      !route ||
      !this.canOperate ||
      !(action === 'start' ? canStartRoute(route) : canCompleteRoute(route))
    )
      return;
    this.actionRouteId = route.id;
    this.action.set(action);
    this.modalError.set('');
    this.actionDialog().nativeElement.showModal();
  }
  cancelAction(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.actionDialog().nativeElement.close();
    this.action.set(null);
    this.actionRouteId = '';
    this.modalError.set('');
    this.focusHeading();
  }
  confirmAction() {
    const route = this.selected(),
      action = this.action();
    if (!route || !action || !this.canConfirmAction) return;
    this.busy.set(true);
    this.modalError.set('');
    this.notice.set('');
    const operation = action === 'start' ? this.api.start(route.id) : this.api.complete(route.id);
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.busy.set(false);
        this.cancelAction();
        this.notice.set(
          action === 'start'
            ? 'Ruta iniciada. Los paquetes están en reparto.'
            : 'Ruta finalizada con los resultados confirmados por el servidor.',
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.modalError.set(requestMessage(error));
        if (this.uncertain(error)) this.read(route.id, true);
      },
    });
  }
  prepareFail(stop: RouteStop) {
    if (!this.canOperate || this.selected()?.status !== 'in_progress') return;
    const ids = stop.packages.filter((p) => p.result === 'pending').map((p) => p.package_id);
    if (!ids.length) return;
    this.failureRouteId = this.selected()!.id;
    this.failureStop.set(stop);
    this.failureNotice.set('');
    this.failureIds.set(ids);
    this.failure.reset();
    this.modalError.set('');
    this.failing.set(true);
    this.failDialog().nativeElement.showModal();
  }
  toggleFailure(id: string, event: Event) {
    if (this.busy() || this.stale()) return;
    const checked = (event.target as HTMLInputElement).checked;
    this.failureIds.update((ids) =>
      checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id),
    );
  }
  cancelFail(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.failDialog().nativeElement.close();
    this.failing.set(false);
    this.failureStop.set(null);
    this.failureNotice.set('');
    this.failureIds.set([]);
    this.failureRouteId = '';
    this.failure.reset();
    this.modalError.set('');
    this.focusHeading();
  }
  fail() {
    if (!this.canFail) return;
    const routeId = this.failureRouteId,
      stop = this.failureStop()!,
      ids = [...this.failureIds()],
      reason = this.failure.controls.reason.value.trim();
    this.busy.set(true);
    this.modalError.set('');
    this.notice.set('');
    this.api
      .fail(stop.id, ids, reason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.stale.set(true);
          this.cancelFail();
          this.notice.set(
            'Paquetes marcados como no entregados. Revisa el resultado actualizado de la ruta.',
          );
          this.read(routeId, false, true);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.modalError.set(requestMessage(error));
          if (this.uncertain(error)) this.read(routeId, true);
        },
      });
  }
  private uncertain(error: unknown) {
    const status =
      error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
    return status === 0 || status === 409 || (status >= 200 && status < 300) || status >= 500;
  }
  private focusHeading() {
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }
}
