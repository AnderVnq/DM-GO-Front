import { CodeSearch } from '../../shared/code-search';
import { LoadingIndicator } from '../../shared/loading-indicator';
import { requestFieldError } from '../../core/api-problem';
import { normalizeWeightKg, weightKgHint, formatMeasuredWeight } from '../../shared/weight';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, type NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { concatMap, from } from 'rxjs';
import { DocumentsApi, type DocumentResponse } from '../../core/documents-api';
import { fileError } from '../../shared/download';
import { Status } from '../../shared/status';
import { formatDate, formatUsd } from '../../shared/amount';
import { WarehousesApi } from './warehouses-api';
import { ReceivingApi } from './receiving-api';
import type { Warehouse } from './warehouse.model';
import { emptyReceipt, type ReceiveInput, type ReceiveResult } from './receiving.model';
import { warehouseError } from './warehouse-error';

@Component({
  selector: 'app-receiving-page',
  imports: [CodeSearch, LoadingIndicator, FormsModule, RouterLink, Status],
  templateUrl: './receiving-page.html',
})
export class ReceivingPage {
  private readonly api = inject(ReceivingApi);
  private readonly catalog = inject(WarehousesApi);
  private readonly documents = inject(DocumentsApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly photos = signal<DocumentResponse[]>([]);
  readonly result = signal<ReceiveResult | null>(null);
  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly uploadError = signal('');
  readonly catalogError = signal('');
  readonly date = formatDate;
  readonly measuredWeight = formatMeasuredWeight;
  readonly validWeight = normalizeWeightKg;
  readonly weightHint = weightKgHint;
  readonly weightError = signal('');
  readonly money = (cents: number | undefined) => (cents === undefined ? '—' : formatUsd(cents));
  readonly matched = (value: string) =>
    ({
      tracking: 'Prealerta encontrada por tracking',
      locker: 'Cliente identificado por casillero',
      unidentified: 'Paquete pendiente de identificar',
    })[value] ?? value;
  input: ReceiveInput = emptyReceipt();
  get valid() {
    return (
      this.warehouses().some((w) => w.code === this.input.warehouse_code) &&
      normalizeWeightKg(this.input.weight_kg) !== null &&
      [this.input.length_mm, this.input.width_mm, this.input.height_mm].every(
        (v) => Number.isInteger(v) && v >= 1 && v <= 3000,
      ) &&
      this.photos().length > 0 &&
      !!this.input.description.trim()
    );
  }
  constructor() {
    this.reloadWarehouses();
  }
  reloadWarehouses() {
    if (this.busy() || this.uploading() || this.loading()) return;
    this.loading.set(true);
    this.catalogError.set('');
    this.warehouses.set([]);
    this.catalog
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          const active = items.filter((w) => w.active && w.country === 'US');
          this.warehouses.set(active);
          this.loading.set(false);
          if (!active.some((w) => w.code === this.input.warehouse_code))
            this.input.warehouse_code = active[0]?.code ?? '';
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.catalogError.set(warehouseError(error));
        },
      });
  }
  upload(event: Event) {
    const element = event.target as HTMLInputElement;
    const files = Array.from(element.files ?? []);
    element.value = '';
    if (!files.length || this.busy() || this.uploading() || this.result()) return;
    this.uploadError.set('');
    for (const file of files) {
      const issue =
        fileError(file) ||
        (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
          ? 'Adjunta fotografías JPEG, PNG o WEBP.'
          : '');
      if (issue) {
        this.uploadError.set(`${file.name}: ${issue}`);
        return;
      }
    }
    this.uploading.set(true);
    from(files)
      .pipe(
        concatMap((file) => this.documents.upload(file)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (document) => this.photos.update((photos) => [...photos, document]),
        complete: () => this.uploading.set(false),
        error: (error: unknown) => {
          this.uploading.set(false);
          this.uploadError.set(
            `${warehouseError(error)}. Las fotografías ya subidas se conservaron; vuelve a seleccionar las que falten.`,
          );
        },
      });
  }
  removePhoto(id: string) {
    if (!this.busy() && !this.uploading() && !this.result())
      this.photos.update((photos) => photos.filter((p) => p.id !== id));
  }
  receive(form: NgForm) {
    if (
      form.invalid ||
      !this.valid ||
      this.loading() ||
      this.busy() ||
      this.uploading() ||
      this.result()
    )
      return;
    this.busy.set(true);
    this.error.set('');
    this.weightError.set('');
    const input = {
      ...this.input,
      weight_kg: normalizeWeightKg(this.input.weight_kg)!,
      carrier_tracking: this.input.carrier_tracking.trim().toUpperCase(),
      locker_code: this.input.locker_code.trim().toUpperCase(),
      description: this.input.description.trim(),
      photo_document_ids: this.photos().map((p) => p.id),
    };
    this.api
      .receive(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.busy.set(false);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.weightError.set(requestFieldError(error, 'weight_kg'));
          this.error.set(warehouseError(error));
        },
      });
  }
  startNew(form: NgForm) {
    if (this.busy() || this.uploading()) return;
    const warehouse = this.input.warehouse_code;
    this.input = { ...emptyReceipt(), warehouse_code: warehouse };
    this.photos.set([]);
    this.result.set(null);
    this.error.set('');
    this.uploadError.set('');
    this.weightError.set('');
    form.resetForm(this.input);
  }
}
