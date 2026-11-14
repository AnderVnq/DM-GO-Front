import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, type NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { WarehousesApi } from './warehouses-api';
import { emptyWarehouse, type Warehouse, type WarehouseInput } from './warehouse.model';
import { warehouseError } from './warehouse-error';

@Component({
  selector: 'app-warehouses-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './warehouses-page.html',
})
export class WarehousesPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(WarehousesApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly admin = computed(() => this.auth.user()?.roles.includes('admin') ?? false);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly selected = signal<Warehouse | null>(null);
  readonly creating = signal(false);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly filter = signal('');
  readonly includeInactive = signal(false);
  readonly filtered = computed(() =>
    this.warehouses().filter(
      (item) =>
        (this.includeInactive() || item.active) &&
        `${item.code} ${item.name} ${item.address.city}`
          .toLowerCase()
          .includes(this.filter().trim().toLowerCase()),
    ),
  );
  input: WarehouseInput = emptyWarehouse();
  active = true;
  constructor() {
    this.reload();
  }
  reload() {
    if (this.busy() || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    this.creating.set(false);
    this.selected.set(null);
    this.warehouses.set([]);
    this.api
      .list(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.warehouses.set(items);
          this.loading.set(false);
          const first = this.filtered()[0];
          if (first) this.select(first);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(warehouseError(error));
        },
      });
  }
  select(item: Warehouse) {
    if (this.busy()) return;
    this.selected.set(item);
    this.creating.set(false);
    this.input = {
      code: item.code,
      name: item.name,
      country: item.country,
      address: { ...item.address },
      timezone: item.timezone,
    };
    this.active = item.active;
    this.error.set('');
    this.success.set('');
  }
  startCreate() {
    if (!this.admin() || this.busy() || this.loading()) return;
    this.selected.set(null);
    this.creating.set(true);
    this.input = emptyWarehouse();
    this.active = true;
    this.error.set('');
    this.success.set('');
  }
  save(form: NgForm) {
    if (
      !this.admin() ||
      form.invalid ||
      this.busy() ||
      this.loading() ||
      (!this.creating() && !this.selected())
    )
      return;
    const input = {
      ...this.input,
      code: this.input.code.trim().toUpperCase(),
      country: this.input.country.trim().toUpperCase(),
      name: this.input.name.trim(),
      timezone: this.input.timezone.trim(),
      address: { ...this.input.address },
    };
    const item = this.selected();
    const operation = item
      ? this.api.update(item.id, {
          name: input.name,
          address: input.address,
          timezone: input.timezone,
          active: this.active,
        })
      : this.api.create(input);
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.warehouses.update((items) =>
          item ? items.map((w) => (w.id === updated.id ? updated : w)) : [...items, updated],
        );
        this.busy.set(false);
        this.select(updated);
        this.success.set(item ? 'Almacén actualizado.' : 'Almacén creado.');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(warehouseError(error));
      },
    });
  }
}
