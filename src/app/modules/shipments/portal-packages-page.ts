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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PortalShipmentsApi } from './portal-shipments-api';
import type { Package, TrackingResponse } from './package.model';
import { canAttachInvoice, declaredValueIssue } from './package-rules';
import { requestCode, requestMessage } from '../../core/api-problem';
import { formatDate, formatUsd, formatWeight, parseAmountToCents } from '../../shared/amount';
import { fileError } from '../../shared/download';
import { Status } from '../../shared/status';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-portal-packages-page',
  imports: [ReactiveFormsModule, Status, Icon, RouterLink],
  templateUrl: './portal-packages-page.html',
})
export class PortalPackagesPage {
  private readonly api = inject(PortalShipmentsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
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
  readonly formError = signal('');
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
  readonly weight = formatWeight;
  readonly editable = canAttachInvoice;
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  readonly form = this.fb.nonNullable.group({
    mode: ['courier'],
    store: ['', Validators.required],
    carrier_tracking: ['', Validators.required],
    description: ['', Validators.required],
    amount: ['', Validators.required],
  });

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
    this.form.reset();
    this.formError.set('');
    this.dialog().nativeElement.showModal();
  }
  create() {
    if (this.form.invalid || this.busy()) return;
    const { amount, ...input } = this.form.getRawValue();
    const cents = parseAmountToCents(amount);
    const issue = declaredValueIssue(cents);
    if (issue || cents === null) {
      this.formError.set(issue ?? 'Revisa el valor declarado.');
      return;
    }
    this.reading?.unsubscribe();
    this.loading.set(false);
    this.busy.set(true);
    this.formError.set('');
    this.api
      .prealert({ ...input, declared_value_cents: cents })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (item) => {
          this.packages.update((items) => [item, ...items]);
          this.filter.set('');
          this.busy.set(false);
          this.dialog().nativeElement.close();
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
