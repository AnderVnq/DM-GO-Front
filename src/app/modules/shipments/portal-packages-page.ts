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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PortalShipmentsApi } from './portal-shipments-api';
import type { Package, TrackingResponse } from './package.model';
import { PrealertForm, type PrealertResult } from './prealert-form';
import { canAttachInvoice } from './package-rules';
import { requestCode, requestMessage } from '../../core/api-problem';
import { formatDate, formatUsd } from '../../shared/amount';
import { fileError } from '../../shared/download';
import { Status } from '../../shared/status';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-portal-packages-page',
  imports: [PrealertForm, Status, Icon, RouterLink],
  templateUrl: './portal-packages-page.html',
})
export class PortalPackagesPage {
  private readonly api = inject(PortalShipmentsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private reading?: Subscription;
  private trackingRequest?: Subscription;
  readonly packages = signal<Package[]>([]);
  readonly selected = signal<Package | null>(null);
  readonly timeline = signal<TrackingResponse | null>(null);
  readonly loading = signal(false);
  readonly trackingLoading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly detailError = signal('');
  readonly trackingError = signal('');
  readonly filter = signal('');
  readonly filtered = computed(() =>
    this.packages().filter((item) =>
      `${item.description} ${item.store} ${item.carrier_tracking}`
        .toLowerCase()
        .includes(this.filter().trim().toLowerCase()),
    ),
  );
  readonly money = formatUsd;
  readonly date = formatDate;
  readonly measuredWeight = formatMeasuredWeight;
  readonly editable = canAttachInvoice;
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');

  constructor() {
    this.reload();
    this.destroyRef.onDestroy(() => {
      this.reading?.unsubscribe();
      this.trackingRequest?.unsubscribe();
    });
  }
  reload() {
    if (this.busy()) return;
    this.reading?.unsubscribe();
    this.trackingRequest?.unsubscribe();
    this.loading.set(true);
    this.packages.set([]);
    this.error.set('');
    this.detailError.set('');
    this.timeline.set(null);
    this.trackingError.set('');
    this.selected.set(null);
    this.reading = this.api.list().subscribe({
      next: (items) => {
        this.packages.set(items);
        this.loading.set(false);
        const id = this.route.snapshot.queryParamMap.get('package_id');
        const item = items.find((entry) => entry.id === id) ?? items[0];
        if (item) this.select(item);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.fail(error);
      },
    });
  }
  select(item: Package) {
    if (this.busy()) return;
    this.selected.set(item);
    this.detailError.set('');
    void this.router.navigate([], { queryParams: { package_id: item.id }, replaceUrl: true });
    this.loadTracking();
  }
  loadTracking() {
    const item = this.selected();
    if (!item || this.busy()) return;
    this.trackingRequest?.unsubscribe();
    this.timeline.set(null);
    this.trackingError.set('');
    this.trackingLoading.set(true);
    this.trackingRequest = this.api.tracking(item.id).subscribe({
      next: (value) => {
        this.timeline.set(value);
        this.trackingLoading.set(false);
      },
      error: (error: unknown) => {
        this.trackingError.set(requestMessage(error));
        this.trackingLoading.set(false);
      },
    });
  }
  openCreate() {
    this.dialog().nativeElement.showModal();
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
    const issue = fileError(file);
    if (issue) {
      this.detailError.set(issue);
      input.value = '';
      return;
    }
    this.busy.set(true);
    this.detailError.set('');
    this.api
      .attachInvoice(item.id, file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.packages.update((items) =>
            items.map((entry) => (entry.id === updated.id ? updated : entry)),
          );
          this.selected.set(updated);
          this.busy.set(false);
          input.value = '';
        },
        error: (error: unknown) => {
          this.detailError.set(requestMessage(error));
          this.busy.set(false);
          input.value = '';
          if (requestCode(error) === 'onboarding_required') void this.router.navigate(['/portal']);
        },
      });
  }
  private fail(error: unknown) {
    if (requestCode(error) === 'onboarding_required') void this.router.navigate(['/portal']);
    else this.error.set(requestMessage(error));
  }
}
