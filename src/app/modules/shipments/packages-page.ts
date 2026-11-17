import { formatMeasuredWeight } from '../../shared/weight';
import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, forkJoin, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ShipmentsApi } from './shipments-api';
import { type Package, type TrackingResponse } from './package.model';
import { PrealertForm, type PrealertResult } from './prealert-form';
import { canAttachInvoice } from './package-rules';
import { CustomersApi, type Customer } from '../customers';
import { Icon } from '../../shared/icon';
import { Status } from '../../shared/status';
import { formatDate, formatUsd } from '../../shared/amount';
import { AuthService } from '../../core/auth.service';
import { DocumentsApi } from '../../core/documents-api';
import { requestMessage } from '../../core/api-problem';
import { fileError } from '../../shared/download';
import { PdfPreviewService } from '../../shared/pdf-preview.service';

@Component({
  selector: 'app-packages-page',
  imports: [ReactiveFormsModule, PrealertForm, Icon, Status, RouterLink],
  templateUrl: './packages-page.html',
})
export class PackagesPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(ShipmentsApi);
  private readonly customers = inject(CustomersApi);
  private readonly documents = inject(DocumentsApi);
  private readonly preview = inject(PdfPreviewService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  readonly customer = signal<Customer | null>(null);
  readonly packages = signal<Package[]>([]);
  readonly selected = signal<Package | null>(null);
  readonly timeline = signal<TrackingResponse | null>(null);
  readonly loading = signal(false);
  readonly trackingLoading = signal(false);
  readonly trackingError = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly detailError = signal('');
  readonly filter = signal('');
  readonly pendingOnly = signal(false);
  readonly filtered = computed(() =>
    this.packages().filter((item) =>
      `${item.locker_code} ${item.store} ${item.description} ${item.carrier_tracking}`
        .toLowerCase()
        .includes(this.filter().toLowerCase()),
    ),
  );
  readonly money = formatUsd;
  readonly date = formatDate;
  readonly measuredWeight = formatMeasuredWeight;
  readonly invoiceEditable = canAttachInvoice;
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('prealertDialog');
  private request?: Subscription;
  private trackingRequest?: Subscription;
  readonly search = this.fb.nonNullable.group({
    kind: ['locker'],
    value: ['', Validators.required],
  });

  constructor() {
    const subscription = this.route.queryParamMap.subscribe((params) => {
      if (params.get('view') === 'invoice-pending') {
        if (!this.pendingOnly()) this.loadPending();
        return;
      }
      const id = params.get('customer_id');
      if (id && (id !== this.customer()?.id || this.pendingOnly())) this.load(id);
    });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      this.request?.unsubscribe();
      this.trackingRequest?.unsubscribe();
    });
  }

  loadPending() {
    if (this.busy()) return;
    this.request?.unsubscribe();
    this.trackingRequest?.unsubscribe();
    const requested =
      this.route.snapshot.queryParamMap.get('view') === 'invoice-pending'
        ? this.route.snapshot.queryParamMap.get('package_id')
        : null;
    this.pendingOnly.set(true);
    void this.router.navigate([], {
      queryParams: { view: 'invoice-pending', package_id: requested },
      replaceUrl: true,
    });
    this.customer.set(null);
    this.selected.set(null);
    this.packages.set([]);
    this.timeline.set(null);
    this.error.set('');
    this.filter.set('');
    this.loading.set(true);
    this.request = this.api.invoicePending().subscribe({
      next: (items) => {
        this.packages.set(items);
        this.loading.set(false);
        const item = items.find((entry) => entry.id === requested) ?? items[0];
        if (item) this.select(item);
      },
      error: (error: unknown) => {
        this.error.set(requestMessage(error));
        this.loading.set(false);
      },
    });
  }

  find() {
    if (this.search.invalid || this.busy()) return;
    this.pendingOnly.set(false);
    const { kind, value } = this.search.getRawValue();
    this.request?.unsubscribe();
    this.trackingRequest?.unsubscribe();
    this.customer.set(null);
    this.packages.set([]);
    this.selected.set(null);
    this.timeline.set(null);
    this.error.set('');
    this.loading.set(true);
    this.request = (
      kind === 'locker'
        ? this.customers.findByLocker(value)
        : this.customers.findByDocument(kind === 'ruc' ? 'ruc' : 'dni', value)
    ).subscribe({
      next: (customer) => {
        this.loading.set(false);
        if (this.route.snapshot.queryParamMap.get('customer_id') === customer.id) {
          this.load(customer.id);
          return;
        }
        void this.router.navigate([], {
          queryParams: { customer_id: customer.id },
          replaceUrl: true,
        });
      },
      error: (error: unknown) => {
        this.error.set(requestMessage(error));
        this.loading.set(false);
      },
    });
  }

  load(id: string) {
    this.pendingOnly.set(false);
    this.request?.unsubscribe();
    this.trackingRequest?.unsubscribe();
    this.filter.set('');
    this.loading.set(true);
    this.error.set('');
    this.packages.set([]);
    this.selected.set(null);
    this.timeline.set(null);
    this.customer.set(null);
    this.request = forkJoin({
      customer: this.customers.get(id),
      packages: this.api.list(id),
    }).subscribe({
      next: (data) => {
        this.customer.set(data.customer);
        this.packages.set(data.packages);
        this.loading.set(false);
        const requested = this.route.snapshot.queryParamMap.get('package_id');
        const item = data.packages.find((p) => p.id === requested) ?? data.packages[0];
        if (item) this.select(item);
      },
      error: (error: unknown) => {
        this.error.set(requestMessage(error));
        this.loading.set(false);
      },
    });
  }

  select(item: Package) {
    if (this.busy()) return;
    this.selected.set(item);
    this.detailError.set('');
    void this.router.navigate([], {
      queryParams: this.pendingOnly()
        ? { view: 'invoice-pending', package_id: item.id }
        : { customer_id: item.customer_id, package_id: item.id },
      replaceUrl: true,
    });
    this.loadTracking(item.id);
  }

  retryTracking() {
    const item = this.selected();
    if (item && !this.busy() && !this.trackingLoading()) this.loadTracking(item.id);
  }

  private loadTracking(id: string) {
    this.trackingRequest?.unsubscribe();
    this.timeline.set(null);
    this.trackingError.set('');
    this.trackingLoading.set(true);
    this.trackingRequest = this.api.tracking(id).subscribe({
      next: (timeline) => {
        this.timeline.set(timeline);
        this.trackingLoading.set(false);
      },
      error: (error: unknown) => {
        this.trackingError.set(requestMessage(error));
        this.trackingLoading.set(false);
      },
    });
  }

  onCreated(result: PrealertResult) {
    this.packages.update((items) => [...result.packages, ...items]);
    this.filter.set('');
    this.busy.set(false);
    this.dialog().nativeElement.close();
    if (result.packages[0]) this.select(result.packages[0]);
    this.detailError.set(
      result.warning
        ? `Los paquetes se registraron. No se pudieron subir estas facturas; vuelve a adjuntarlas: ${result.warning}`
        : '',
    );
  }

  attach(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const item = this.selected();
    if (!file || !item || this.busy() || !canAttachInvoice(item.status)) {
      input.value = '';
      return;
    }
    const validation = fileError(file);
    if (validation) {
      this.detailError.set(validation);
      input.value = '';
      return;
    }
    this.busy.set(true);
    this.detailError.set('');
    this.api.attachInvoice(item.id, file).subscribe({
      next: (updated) => {
        this.packages.update((items) =>
          items
            .map((p) => (p.id === updated.id ? updated : p))
            .filter((p) => !this.pendingOnly() || p.invoice_pending),
        );
        this.busy.set(false);
        if (this.pendingOnly() && !updated.invoice_pending) {
          this.selected.set(null);
          this.timeline.set(null);
          this.trackingRequest?.unsubscribe();
          this.trackingLoading.set(false);
          const next = this.packages()[0];
          if (next) this.select(next);
        } else if (this.selected()?.id === updated.id) this.selected.set(updated);
        input.value = '';
      },
      error: (error: unknown) => {
        this.detailError.set(requestMessage(error));
        this.busy.set(false);
        input.value = '';
      },
    });
  }

  viewInvoice(item = this.selected()) {
    const id = item?.invoice_document_id;
    if (!item || !id || this.busy()) return;
    this.preview.open(
      `Factura de ${item.carrier_tracking}`,
      `factura-${item.carrier_tracking}.pdf`,
      () => this.documents.download(id).pipe(switchMap((link) => this.preview.fetch(link.url))),
    );
  }

  download(item = this.selected()) {
    const id = item?.invoice_document_id;
    if (!item || !id || this.busy()) return;
    this.busy.set(true);
    this.detailError.set('');
    this.preview
      .download(`factura-${item.carrier_tracking}.pdf`, () =>
        this.documents.download(id).pipe(switchMap((link) => this.preview.fetch(link.url))),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.busy.set(false),
        error: (error: unknown) => {
          this.detailError.set(requestMessage(error));
          this.busy.set(false);
        },
      });
  }
}
