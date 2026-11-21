import { LoadingIndicator } from '../../shared/loading-indicator';
import { RecordBrowser } from '../../shared/record-browser';
import { Icon } from '../../shared/icon';
import { formatMeasuredWeight } from '../../shared/weight';
import {
  computed,
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
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, Subscription, catchError, forkJoin, of } from 'rxjs';
import { WarehousesApi, type Warehouse } from '../warehouses';
import { requestMessage } from '../../core/api-problem';
import { formatDate } from '../../shared/amount';
import { Status } from '../../shared/status';
import { ConsolidationApi } from './consolidation-api';
import { lotReference } from './lot-reference';
import type { Bulk, Consolidation } from './consolidation.model';

@Component({
  selector: 'app-consolidations-page',
  imports: [LoadingIndicator, RecordBrowser, Icon, FormsModule, RouterLink, Status],
  templateUrl: './consolidations-page.html',
})
export class ConsolidationsPage {
  private readonly injector = inject(Injector);
  readonly detailHeading = viewChild<ElementRef<HTMLHeadingElement>>('detailHeading');
  readonly listRevision = signal(0);
  readonly lotStatuses = [
    { value: 'open', label: 'Abierto' },
    { value: 'closed', label: 'Cerrado' },
  ];

  private readonly api = inject(ConsolidationApi);
  private readonly catalog = inject(WarehousesApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private previewRequest?: Subscription;
  private detailRequest?: Subscription;
  readonly closeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('closeDialog');
  readonly consolidation = signal<Consolidation | null>(null);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly preview = signal<Bulk | null>(null);
  readonly contents = signal<Record<string, Bulk>>({});
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly looking = signal(false);
  readonly catalogLoading = signal(false);
  readonly detailLoading = signal(false);
  readonly error = signal('');
  readonly catalogError = signal('');
  readonly previewError = signal('');
  readonly detailError = signal('');
  readonly success = signal('');
  readonly date = formatDate;
  readonly measuredWeight = formatMeasuredWeight;
  readonly creating = signal(false);
  selectRecord(id: string) {
    if (this.busy() || this.loading()) return;
    this.creating.set(false);
    this.reference = id;
    this.open();
  }
  backToList() {
    if (this.busy() || this.loading()) return;
    this.newConsolidation();
    this.creating.set(false);
    this.listRevision.update((v) => v + 1);
  }
  readonly availableBulkFilters = computed<Record<string, string>>(() => ({
    status: 'closed',
    free: 'true',
    warehouse_code: this.consolidation()?.warehouse_code ?? '',
  }));
  selectBulk(id: string) {
    if (this.busy() || this.looking()) return;
    this.changeBulkReference(id);
    this.lookupBulk();
  }
  reference = '';
  bulkReference = '';
  warehouseCode = '';
  get unavailable(): string {
    const bulk = this.preview();
    const consolidation = this.consolidation();
    if (!bulk) return 'Consulta un bulto antes de añadirlo.';
    if (bulk.status !== 'closed') return 'Primero cierra el bulto con su precinto y medidas.';
    if (bulk.consolidation_id || consolidation?.bulk_ids.includes(bulk.id))
      return 'El bulto ya pertenece a un consolidado.';
    if (consolidation && bulk.warehouse_code !== consolidation.warehouse_code)
      return 'El bulto pertenece a otro almacén.';
    return '';
  }
  constructor() {
    this.loadWarehouses();
    const consolidationId = this.route.snapshot.queryParamMap.get('consolidation_id');
    const bulkId = this.route.snapshot.queryParamMap.get('bulk_id');
    if (consolidationId) {
      this.reference = consolidationId;
      this.open();
    }
    if (bulkId) {
      if (!consolidationId) this.creating.set(true);
      this.bulkReference = bulkId;
      this.lookupBulk();
    }
    this.destroyRef.onDestroy(() => {
      this.previewRequest?.unsubscribe();
      this.detailRequest?.unsubscribe();
    });
  }
  loadWarehouses() {
    if (this.busy() || this.catalogLoading()) return;
    this.catalogLoading.set(true);
    this.catalogError.set('');
    this.catalog
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.warehouses.set(items.filter((w) => w.active && w.country === 'US'));
          this.catalogLoading.set(false);
          this.warehouseCode =
            this.warehouses().find((w) => w.code === this.preview()?.warehouse_code)?.code ??
            this.warehouses()[0]?.code ??
            '';
        },
        error: (error: unknown) => {
          this.catalogLoading.set(false);
          this.catalogError.set(requestMessage(error));
        },
      });
  }
  newConsolidation() {
    if (this.busy() || this.loading()) return;
    this.creating.set(true);
    this.detailRequest?.unsubscribe();
    this.previewRequest?.unsubscribe();
    this.consolidation.set(null);
    this.preview.set(null);
    this.contents.set({});
    this.reference = '';
    this.bulkReference = '';
    this.looking.set(false);
    this.error.set('');
    this.success.set('');
    this.previewError.set('');
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }
  changeReference(value: string) {
    if (this.busy() || this.loading()) return;
    this.reference = value;
    this.consolidation.set(null);
    this.detailRequest?.unsubscribe();
    this.contents.set({});
    this.error.set('');
    this.success.set('');
  }
  create() {
    if (
      this.busy() ||
      this.loading() ||
      !this.warehouses().some((w) => w.code === this.warehouseCode)
    )
      return;
    this.mutate(this.api.createConsolidation(this.warehouseCode), 'Consolidado creado.');
  }
  open() {
    if (this.busy() || this.loading()) return;
    const id = lotReference(this.reference, 'consolidations', this.document.location.origin);
    if (!id) {
      this.error.set('Selecciona el registro en el buscador por código.');
      return;
    }
    this.loading.set(true);
    if (this.consolidation()?.id !== id) {
      this.consolidation.set(null);
      this.contents.set({});
    }
    this.error.set('');
    this.success.set('');
    this.api
      .consolidation(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (item) => {
          this.loading.set(false);
          this.setConsolidation(item);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(requestMessage(error));
        },
      });
  }
  private setConsolidation(item: Consolidation) {
    const changed = this.consolidation()?.id !== item.id;
    this.creating.set(false);
    this.listRevision.update((v) => v + 1);
    this.consolidation.set({ ...item, bulk_ids: item.bulk_ids ?? [], hawbs: item.hawbs ?? [] });
    this.reference = item.id;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { consolidation_id: item.id },
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
    const ids = this.consolidation()?.bulk_ids ?? [];
    if (!ids.length) {
      this.detailLoading.set(false);
      return;
    }
    this.detailLoading.set(true);
    this.detailRequest = forkJoin(
      ids.map((id) => this.api.bulk(id).pipe(catchError(() => of(null)))),
    ).subscribe((items) => {
      const details: Record<string, Bulk> = {};
      for (const item of items) if (item) details[item.id] = item;
      this.contents.set(details);
      this.detailLoading.set(false);
      if (items.some((item) => !item))
        this.detailError.set(
          'No se pudo cargar el detalle de algunos bultos. Las referencias del consolidado se conservaron.',
        );
    });
  }
  changeBulkReference(value: string) {
    this.previewRequest?.unsubscribe();
    this.bulkReference = value;
    this.preview.set(null);
    this.looking.set(false);
    this.previewError.set('');
    this.success.set('');
  }
  lookupBulk() {
    if (this.busy() || this.looking()) return;
    const id = lotReference(this.bulkReference, 'bulks', this.document.location.origin);
    if (!id) {
      this.previewError.set('Selecciona el registro en el buscador por código.');
      return;
    }
    this.preview.set(null);
    this.looking.set(true);
    this.previewError.set('');
    this.previewRequest = this.api.bulk(id).subscribe({
      next: (bulk) => {
        this.preview.set({ ...bulk, package_ids: bulk.package_ids ?? [] });
        this.looking.set(false);
        if (!this.consolidation() && this.warehouses().some((w) => w.code === bulk.warehouse_code))
          this.warehouseCode = bulk.warehouse_code;
      },
      error: (error: unknown) => {
        this.looking.set(false);
        this.previewError.set(requestMessage(error));
      },
    });
  }
  add() {
    const consolidation = this.consolidation();
    const bulk = this.preview();
    if (
      !consolidation ||
      consolidation.status !== 'open' ||
      !bulk ||
      this.unavailable ||
      this.busy() ||
      this.loading() ||
      this.looking()
    )
      return;
    this.mutate(this.api.addBulk(consolidation.id, bulk.id), 'Bulto añadido al consolidado.');
  }
  reviewClose() {
    const item = this.consolidation();
    if (item?.status === 'open' && item.bulk_ids.length && !this.busy() && !this.loading())
      this.closeDialog().nativeElement.showModal();
  }
  close() {
    const item = this.consolidation();
    if (!item || item.status !== 'open' || !item.bulk_ids.length || this.busy()) return;
    this.mutate(
      this.api.closeConsolidation(item.id),
      'Consolidado cerrado y guías HAWB generadas.',
    );
  }
  private mutate(operation: Observable<Consolidation>, message: string) {
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (item) => {
        this.busy.set(false);
        this.closeDialog().nativeElement.close();
        this.setConsolidation(item);
        this.success.set(message);
        if (item.bulk_ids.includes(this.preview()?.id ?? '')) {
          this.preview.set(null);
          this.bulkReference = '';
        }
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.closeDialog().nativeElement.close();
        this.error.set(requestMessage(error));
        this.preview.set(null);
        this.listRevision.update((v) => v + 1);
      },
    });
  }
  async copyLink() {
    const item = this.consolidation();
    if (!item) return;
    try {
      await navigator.clipboard.writeText(
        `${this.document.location.origin}/internal/consolidations?consolidation_id=${encodeURIComponent(item.id)}`,
      );
      this.success.set('Enlace del consolidado copiado.');
    } catch {
      this.error.set('No se pudo copiar el enlace. Puedes guardar la dirección de esta página.');
    }
  }
}
