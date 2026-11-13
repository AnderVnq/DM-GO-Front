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
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { ShipmentsApi } from './shipments-api';
import { type Package, type TrackingResponse } from './package.model';
import { canAttachInvoice, declaredValueIssue } from './package-rules';
import { CustomersApi, type Customer } from '../customers';
import { Icon } from '../../shared/icon';
import { Status } from '../../shared/status';
import { formatDate, formatUsd, formatWeight, parseAmountToCents } from '../../shared/amount';
import { DocumentsApi } from '../../core/documents-api';
import { requestMessage } from '../../core/api-problem';
import { fileError, openDownload } from '../../shared/download';

@Component({
  selector: 'app-packages-page',
  imports: [ReactiveFormsModule, Icon, Status],
  templateUrl: './packages-page.html',
})
export class PackagesPage {
  private readonly api = inject(ShipmentsApi);
  private readonly customers = inject(CustomersApi);
  private readonly documents = inject(DocumentsApi);
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
  readonly formError = signal('');
  readonly filter = signal('');
  readonly filtered = computed(() =>
    this.packages().filter((item) =>
      `${item.store} ${item.description} ${item.carrier_tracking}`
        .toLowerCase()
        .includes(this.filter().toLowerCase()),
    ),
  );
  readonly money = formatUsd;
  readonly date = formatDate;
  readonly weight = formatWeight;
  readonly invoiceEditable = canAttachInvoice;
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('prealertDialog');
  private request?: Subscription;
  private trackingRequest?: Subscription;
  readonly search = this.fb.nonNullable.group({
    kind: ['locker'],
    value: ['', Validators.required],
  });
  readonly form = this.fb.nonNullable.group({
    mode: ['courier'],
    store: ['', Validators.required],
    carrier_tracking: ['', Validators.required],
    description: ['', Validators.required],
    amount: ['', Validators.required],
  });

  constructor() {
    const subscription = this.route.queryParamMap.subscribe((params) => {
      const id = params.get('customer_id');
      if (id && id !== this.customer()?.id) this.load(id);
    });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      this.request?.unsubscribe();
      this.trackingRequest?.unsubscribe();
    });
  }

  find() {
    if (this.search.invalid || this.busy()) return;
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
      queryParams: { package_id: item.id },
      queryParamsHandling: 'merge',
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

  create() {
    const customer = this.customer();
    const cents = parseAmountToCents(this.form.getRawValue().amount);
    if (this.form.invalid || this.busy() || !customer) return;
    const issue = declaredValueIssue(cents);
    if (issue || cents === null) {
      this.formError.set(issue ?? 'Indica un importe válido.');
      return;
    }
    const { amount: _amount, ...input } = this.form.getRawValue();
    this.busy.set(true);
    this.formError.set('');
    this.api
      .prealert({ ...input, customer_id: customer.id, declared_value_cents: cents })
      .subscribe({
        next: (item) => {
          this.packages.update((items) => [item, ...items]);
          this.busy.set(false);
          this.dialog().nativeElement.close();
          this.form.reset();
          this.select(item);
        },
        error: (error: unknown) => {
          this.formError.set(requestMessage(error));
          this.busy.set(false);
        },
      });
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
        this.packages.update((items) => items.map((p) => (p.id === updated.id ? updated : p)));
        if (this.selected()?.id === updated.id) this.selected.set(updated);
        this.busy.set(false);
        input.value = '';
      },
      error: (error: unknown) => {
        this.detailError.set(requestMessage(error));
        this.busy.set(false);
        input.value = '';
      },
    });
  }

  download() {
    const id = this.selected()?.invoice_document_id;
    if (!id || this.busy()) return;
    this.busy.set(true);
    this.detailError.set('');
    this.documents.download(id).subscribe({
      next: (link) => {
        this.busy.set(false);
        try {
          openDownload(link.url);
        } catch (error) {
          this.detailError.set(requestMessage(error));
        }
      },
      error: (error: unknown) => {
        this.detailError.set(requestMessage(error));
        this.busy.set(false);
      },
    });
  }
}
