import { LoadingIndicator } from '../../shared/loading-indicator';
import { Icon } from '../../shared/icon';
import { RecordBrowser } from '../../shared/record-browser';
import { normalizeWeightKg, weightKgHint, formatMeasuredWeight } from '../../shared/weight';
import {
  afterNextRender,
  Injector,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, type NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, Subscription, catchError, forkJoin, of } from 'rxjs';
import { CustomersApi, type Customer } from '../customers';
import { ShipmentsApi, type Package } from '../shipments';
import { WarehousesApi, type Warehouse } from '../warehouses';
import { requestFieldError, requestMessage } from '../../core/api-problem';
import { formatDate } from '../../shared/amount';
import { savePdf } from '../../shared/download';
import { Status } from '../../shared/status';
import { ConsolidationApi } from './consolidation-api';
import { lotReference } from './lot-reference';
import type { Bulk, BulkClosure } from './consolidation.model';

@Component({
  selector: 'app-bulks-page',
  imports: [LoadingIndicator, Icon, RecordBrowser, FormsModule, RouterLink, Status],
  templateUrl: './bulks-page.html',
})
export class BulksPage {
  private readonly injector = inject(Injector);
  readonly detailHeading = viewChild<ElementRef<HTMLHeadingElement>>('detailHeading');
  readonly listRevision = signal(0);
  readonly lotStatuses = [
    { value: 'open', label: 'Abierto' },
    { value: 'closed', label: 'Cerrado' },
  ];

  private readonly api = inject(ConsolidationApi);
  private readonly shipments = inject(ShipmentsApi);
  private readonly customers = inject(CustomersApi);
  private readonly catalog = inject(WarehousesApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private lookupRequest?: Subscription;
  private detailRequest?: Subscription;
  readonly closeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('closeDialog');
  readonly bulk = signal<Bulk | null>(null);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly contents = signal<Record<string, Package>>({});
  readonly customer = signal<Customer | null>(null);
  readonly candidates = signal<Package[]>([]);
  readonly loading = signal(false);
  readonly catalogLoading = signal(false);
  readonly busy = signal(false);
  readonly looking = signal(false);
  readonly detailLoading = signal(false);
  readonly error = signal('');
  readonly catalogError = signal('');
  readonly lookupError = signal('');
  readonly detailError = signal('');
  readonly success = signal('');
  readonly removing = signal('');
  readonly date = formatDate;
  readonly measuredWeight = formatMeasuredWeight;
  readonly validWeight = normalizeWeightKg;
  readonly weightHint = weightKgHint;
  readonly weightError = signal('');
  readonly creating = signal(false);
  selectRecord(id: string) {
    if (this.busy() || this.loading()) return;
    this.creating.set(false);
    this.reference = id;
    this.open();
  }
  backToList() {
    if (this.busy() || this.loading()) return;
    this.newBulk();
    this.creating.set(false);
    this.listRevision.update((v) => v + 1);
  }
  selectPackage(id: string) {
    if (this.busy() || this.looking()) return;
    this.clearLookup();
    this.looking.set(true);
    this.lookupRequest = this.shipments.get(id).subscribe({
      next: (item) => {
        this.candidates.set([item]);
        this.candidateId = item.id;
        this.looking.set(false);
      },
      error: (error: unknown) => this.lookupFailure(error),
    });
  }
  reference = '';
  warehouseCode = '';
  locker = '';
  candidateId = '';
  reason = '';
  closure: BulkClosure = { seal: '', weight_kg: '', length_mm: 0, width_mm: 0, height_mm: 0 };
  get canClose() {
    return (
      !!this.closure.seal.trim() &&
      normalizeWeightKg(this.closure.weight_kg) !== null &&
      [this.closure.length_mm, this.closure.width_mm, this.closure.height_mm].every(
        (v) => Number.isInteger(v) && v >= 1 && v <= 3000,
      )
    );
  }
  constructor() {
    this.loadWarehouses();
    const id = this.route.snapshot.queryParamMap.get('bulk_id');
    if (id) {
      this.reference = id;
      this.open();
    }
    this.destroyRef.onDestroy(() => {
      this.lookupRequest?.unsubscribe();
      this.detailRequest?.unsubscribe();
    });
  }
  loadWarehouses() {
    if (this.catalogLoading() || this.busy()) return;
    this.catalogLoading.set(true);
    this.catalogError.set('');
    this.catalog
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.warehouses.set(items.filter((w) => w.active && w.country === 'US'));
          this.catalogLoading.set(false);
          this.warehouseCode = this.warehouses()[0]?.code ?? '';
        },
        error: (error: unknown) => {
          this.catalogLoading.set(false);
          this.catalogError.set(requestMessage(error));
        },
      });
  }
  newBulk() {
    if (this.busy() || this.loading()) return;
    this.creating.set(true);
    this.clearLookup();
    this.detailRequest?.unsubscribe();
    this.bulk.set(null);
    this.contents.set({});
    this.reference = '';
    this.resetClosure();
    this.removing.set('');
    this.error.set('');
    this.success.set('');
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }
  changeReference(value: string) {
    if (this.busy() || this.loading()) return;
    this.reference = value;
    this.resetClosure();
    this.bulk.set(null);
    this.clearLookup();
    this.detailRequest?.unsubscribe();
    this.contents.set({});
    this.error.set('');
    this.success.set('');
  }
  private resetClosure() {
    this.weightError.set('');
    this.closure = { seal: '', weight_kg: '', length_mm: 0, width_mm: 0, height_mm: 0 };
  }
  create() {
    if (
      this.busy() ||
      this.loading() ||
      !this.warehouses().some((w) => w.code === this.warehouseCode)
    )
      return;
    this.mutate(this.api.createBulk(this.warehouseCode), 'Bulto creado.');
  }
  open() {
    if (this.busy() || this.loading()) return;
    const id = lotReference(this.reference, 'bulks', this.document.location.origin);
    if (!id) {
      this.error.set('Selecciona el registro en el buscador por código.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    if (this.bulk()?.id !== id) {
      this.bulk.set(null);
      this.contents.set({});
    }
    this.clearLookup();
    this.api
      .bulk(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (bulk) => {
          this.loading.set(false);
          this.setBulk(bulk);
          this.loadInitialCustomer();
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(requestMessage(error));
        },
      });
  }
  private setBulk(bulk: Bulk) {
    const changed = this.bulk()?.id !== bulk.id;
    this.creating.set(false);
    this.listRevision.update((v) => v + 1);
    this.bulk.set({ ...bulk, package_ids: bulk.package_ids ?? [] });
    this.reference = bulk.id;
    this.removing.set('');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { bulk_id: bulk.id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.loadContents();
    if (changed)
      afterNextRender(() => this.detailHeading()?.nativeElement.focus(), {
        injector: this.injector,
      });
  }
  loadContents() {
    this.detailRequest?.unsubscribe();
    this.detailError.set('');
    const ids = this.bulk()?.package_ids ?? [];
    if (!ids.length) {
      this.detailLoading.set(false);
      return;
    }
    this.detailLoading.set(true);
    this.detailRequest = forkJoin(
      ids.map((id) => this.shipments.get(id).pipe(catchError(() => of(null)))),
    ).subscribe((items) => {
      const details: Record<string, Package> = {};
      for (const item of items) if (item) details[item.id] = item;
      this.contents.set(details);
      this.detailLoading.set(false);
      if (items.some((item) => !item))
        this.detailError.set(
          'No se pudo cargar el detalle de algunos paquetes. Las referencias del bulto se conservaron.',
        );
    });
  }
  private clearLookup() {
    this.lookupRequest?.unsubscribe();
    this.looking.set(false);
    this.customer.set(null);
    this.candidates.set([]);
    this.candidateId = '';
    this.lookupError.set('');
  }
  changeLocker(value: string) {
    this.locker = value;
    this.clearLookup();
  }
  lookup() {
    if (!this.locker.trim() || this.busy() || this.looking()) return;
    this.clearLookup();
    this.looking.set(true);
    this.lookupRequest = this.customers.findByLocker(this.locker).subscribe({
      next: (customer) => this.loadCustomerPackages(customer),
      error: (error: unknown) => this.lookupFailure(error),
    });
  }
  private loadInitialCustomer() {
    const id = this.route.snapshot.queryParamMap.get('customer_id');
    if (!id || this.bulk()?.status !== 'open') return;
    this.clearLookup();
    this.looking.set(true);
    this.lookupRequest = this.customers.get(id).subscribe({
      next: (customer) => {
        this.locker = customer.locker_code;
        this.loadCustomerPackages(customer);
      },
      error: (error: unknown) => this.lookupFailure(error),
    });
  }
  private loadCustomerPackages(customer: Customer) {
    this.customer.set(customer);
    this.lookupRequest = this.shipments.list(customer.id).subscribe({
      next: (items) => {
        this.candidates.set(items);
        this.looking.set(false);
        const wanted = this.route.snapshot.queryParamMap.get('package_id');
        this.candidateId = items.find((p) => p.id === wanted && !this.exclusion(p))?.id ?? '';
      },
      error: (error: unknown) => this.lookupFailure(error),
    });
  }
  private lookupFailure(error: unknown) {
    this.looking.set(false);
    this.candidates.set([]);
    this.customer.set(null);
    this.lookupError.set(requestMessage(error));
  }
  exclusion(item: Package): string {
    if (this.bulk()?.package_ids.includes(item.id)) return 'Ya incluido';
    if (item.status !== 'RECEIVED_USA') return 'Debe estar recibido en USA';
    if (item.mode !== 'courier') return 'La modalidad viajero no se consolida';
    if (!item.customer_id) return 'Falta identificar al cliente';
    if (!item.has_invoice) return 'Falta factura de compra';
    const warehouse = this.warehouses().find((w) => w.code === this.bulk()?.warehouse_code);
    if (warehouse && item.receipt?.warehouse_id && item.receipt.warehouse_id !== warehouse.id)
      return 'Está en otro almacén';
    return '';
  }
  add() {
    const bulk = this.bulk();
    const item = this.candidates().find((p) => p.id === this.candidateId);
    if (
      !bulk ||
      bulk.status !== 'open' ||
      !item ||
      this.exclusion(item) ||
      this.busy() ||
      this.loading() ||
      this.looking()
    )
      return;
    this.mutate(this.api.addPackage(bulk.id, item.id), 'Paquete añadido al bulto.');
  }
  beginRemove(id: string) {
    if (!this.busy() && this.bulk()?.status === 'open') {
      this.removing.set(id);
      this.reason = '';
    }
  }
  remove() {
    const bulk = this.bulk();
    const id = this.removing();
    if (
      !bulk ||
      bulk.status !== 'open' ||
      !id ||
      !bulk.package_ids.includes(id) ||
      !this.reason.trim() ||
      this.busy()
    )
      return;
    this.mutate(
      this.api.removePackage(bulk.id, id, this.reason.trim()),
      'Paquete retirado del bulto.',
    );
  }
  reviewClose(form: NgForm) {
    if (
      !form.invalid &&
      this.canClose &&
      !this.busy() &&
      this.bulk()?.status === 'open' &&
      this.bulk()!.package_ids.length
    )
      this.closeDialog().nativeElement.showModal();
  }
  close() {
    const bulk = this.bulk();
    if (!bulk || bulk.status !== 'open' || !this.canClose || this.busy()) return;
    this.weightError.set('');
    this.mutate(
      this.api.closeBulk(bulk.id, {
        ...this.closure,
        weight_kg: normalizeWeightKg(this.closure.weight_kg)!,
        seal: this.closure.seal.trim().toUpperCase(),
      }),
      'Bulto cerrado.',
    );
  }
  private mutate(operation: Observable<Bulk>, message: string) {
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (bulk) => {
        this.busy.set(false);
        this.closeDialog().nativeElement.close();
        this.setBulk(bulk);
        this.success.set(message);
        this.candidateId = '';
        const customer = this.customer();
        if (bulk.status === 'open' && customer) {
          this.clearLookup();
          this.looking.set(true);
          this.loadCustomerPackages(customer);
        } else if (bulk.status === 'open') this.loadInitialCustomer();
        else this.clearLookup();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.closeDialog().nativeElement.close();
        this.weightError.set(requestFieldError(error, 'weight_kg'));
        this.error.set(requestMessage(error));
      },
    });
  }
  label() {
    const bulk = this.bulk();
    if (!bulk || this.busy() || this.loading()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .bulkLabel(bulk.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.busy.set(false);
          try {
            savePdf(blob, `${bulk.code}.pdf`);
          } catch (error) {
            this.error.set(requestMessage(error));
          }
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(requestMessage(error));
        },
      });
  }
  async copyLink() {
    const bulk = this.bulk();
    if (!bulk) return;
    try {
      await navigator.clipboard.writeText(
        `${this.document.location.origin}/internal/bulks?bulk_id=${encodeURIComponent(bulk.id)}`,
      );
      this.success.set('Enlace del bulto copiado.');
    } catch {
      this.error.set('No se pudo copiar el enlace. Puedes guardar la dirección de esta página.');
    }
  }
}
