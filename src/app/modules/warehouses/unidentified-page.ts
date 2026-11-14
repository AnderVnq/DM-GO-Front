import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CustomersApi, type Customer } from '../customers';
import type { Package } from '../shipments';
import { ReceivingApi } from './receiving-api';
import { warehouseError } from './warehouse-error';
import { formatDate, formatWeight } from '../../shared/amount';

@Component({
  selector: 'app-unidentified-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './unidentified-page.html',
})
export class UnidentifiedPage {
  private readonly api = inject(ReceivingApi);
  private readonly customers = inject(CustomersApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private lookupRequest?: Subscription;
  readonly packages = signal<Package[]>([]);
  readonly selected = signal<Package | null>(null);
  readonly customer = signal<Customer | null>(null);
  readonly loading = signal(false);
  readonly looking = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly lookupError = signal('');
  readonly success = signal('');
  readonly date = formatDate;
  readonly weight = (grams: number | undefined) =>
    grams === undefined ? '—' : formatWeight(grams);
  locker = '';
  constructor() {
    this.reload();
    this.destroyRef.onDestroy(() => this.lookupRequest?.unsubscribe());
  }
  reload() {
    if (this.busy() || this.loading()) return;
    this.clearLookup();
    this.selected.set(null);
    this.packages.set([]);
    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    this.api
      .unidentified()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.packages.set(items);
          this.loading.set(false);
          const id = this.route.snapshot.queryParamMap.get('package_id');
          const first = items.find((p) => p.id === id) ?? items[0];
          if (first) this.select(first);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(warehouseError(error));
        },
      });
  }
  select(item: Package) {
    if (this.busy()) return;
    this.clearLookup();
    this.locker = '';
    this.selected.set(item);
    this.error.set('');
    this.success.set('');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { package_id: item.id },
      replaceUrl: true,
    });
  }
  changeLocker(value: string) {
    this.locker = value;
    this.clearLookup();
    this.success.set('');
  }
  private clearLookup() {
    this.lookupRequest?.unsubscribe();
    this.customer.set(null);
    this.looking.set(false);
    this.lookupError.set('');
  }
  lookup() {
    if (!this.locker.trim() || !this.selected() || this.busy() || this.looking()) return;
    this.clearLookup();
    this.looking.set(true);
    this.lookupRequest = this.customers.findByLocker(this.locker).subscribe({
      next: (customer) => {
        this.customer.set(customer);
        this.looking.set(false);
      },
      error: (error: unknown) => {
        this.looking.set(false);
        this.lookupError.set(warehouseError(error));
      },
    });
  }
  assign() {
    const item = this.selected();
    const customer = this.customer();
    if (!item || !customer || this.busy() || this.looking() || this.loading()) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    this.api
      .assign(item.id, customer.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.packages.update((items) => items.filter((p) => p.id !== item.id));
          this.selected.set(null);
          this.clearLookup();
          this.locker = '';
          this.busy.set(false);
          this.success.set(
            `${item.receipt?.number || item.carrier_tracking || item.id} asignado a ${customer.name} · ${customer.locker_code}.`,
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(warehouseError(error));
        },
      });
  }
}
