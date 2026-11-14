import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { ShipmentsApi } from './shipments-api';
import { PortalShipmentsApi } from './portal-shipments-api';
import type { Package, PrealertInput } from './package.model';
import { normalizeTracking, prealertTotal } from './package-rules';
import { formatUsd, parseAmountToCents } from '../../shared/amount';
import { fileError } from '../../shared/download';
import { requestMessage, type ApiProblem } from '../../core/api-problem';

export interface PrealertResult {
  packages: Package[];
  warning: string;
}

@Component({
  selector: 'app-prealert-form',
  imports: [ReactiveFormsModule],
  templateUrl: './prealert-form.html',
  styles: [
    `
      :host {
        display: block;
      }
      fieldset {
        min-width: 0;
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        padding: 1rem;
        margin: 1rem 0;
      }
      legend {
        font-weight: 600;
      }
      .error {
        color: var(--danger);
      }
    `,
  ],
})
export class PrealertForm {
  private readonly fb = inject(FormBuilder);
  private readonly staff = inject(ShipmentsApi);
  private readonly portalApi = inject(PortalShipmentsApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly portal = input(false);
  readonly customerId = input('');
  readonly created = output<PrealertResult>();
  readonly busyChange = output<boolean>();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly files: (File | null)[] = [null];
  readonly fileIssues = signal<string[]>([]);
  readonly money = formatUsd;
  private row() {
    return this.fb.nonNullable.group({
      carrier_tracking: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9-]{6,40}$/)]],
      store: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', [Validators.required, Validators.maxLength(300)]],
      amount: ['', Validators.required],
      quantity: [
        1,
        [Validators.required, Validators.min(1), Validators.max(999), Validators.pattern(/^\d+$/)],
      ],
      observation: ['', Validators.maxLength(300)],
    });
  }
  readonly form = this.fb.nonNullable.group({
    mode: ['courier'],
    packages: this.fb.array([this.row()]),
  });
  get rows() {
    return this.form.controls.packages;
  }
  reset() {
    if (this.busy()) return;
    while (this.rows.length > 1) this.rows.removeAt(this.rows.length - 1);
    this.rows.at(0).reset({
      carrier_tracking: '',
      store: '',
      description: '',
      amount: '',
      quantity: 1,
      observation: '',
    });
    this.form.controls.mode.setValue('courier');
    this.files.splice(0, this.files.length, null);
    this.fileIssues.set([]);
    this.error.set('');
  }
  add() {
    if (this.busy() || this.rows.length >= 50) return;
    this.rows.push(this.row());
    this.files.push(null);
  }
  remove(index: number) {
    if (this.busy() || this.rows.length <= 1) return;
    this.rows.removeAt(index);
    this.files.splice(index, 1);
    this.fileIssues.update((issues) => issues.filter((_, i) => i !== index));
  }
  total(index: number) {
    const row = this.rows.at(index).getRawValue();
    return prealertTotal(parseAmountToCents(row.amount), row.quantity);
  }
  issue(index: number, field: string): string {
    const control = this.rows.at(index).get(field);
    if (!control?.touched) return '';
    if (field === 'amount' && this.total(index) === null)
      return 'Indica un precio positivo con hasta dos decimales y un total de hasta USD 100 000.';
    if (!control.invalid) return '';
    return (control.getError('server') as string) || 'Revisa este campo y sus límites.';
  }
  chooseFile(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const issue = file ? fileError(file) : '';
    this.fileIssues.update((issues) => {
      const next = [...issues];
      next[index] = issue;
      return next;
    });
    this.files[index] = issue ? null : file;
    if (issue) input.value = '';
  }
  clearFile(index: number, input: HTMLInputElement) {
    if (this.busy()) return;
    this.files[index] = null;
    this.fileIssues.update((issues) => {
      const next = [...issues];
      next[index] = '';
      return next;
    });
    input.value = '';
  }
  submit() {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    this.error.set('');
    if (this.form.invalid || this.fileIssues().some(Boolean)) return;
    const packages: PrealertInput[] = [];
    for (let index = 0; index < this.rows.length; index++) {
      const { amount, ...row } = this.rows.at(index).getRawValue();
      const cents = parseAmountToCents(amount);
      if (this.total(index) === null || cents === null) {
        return;
      }
      if (!row.store.trim() || !row.description.trim()) {
        this.error.set(`Completa la compañía y el contenido del paquete ${index + 1}.`);
        return;
      }
      packages.push({
        ...row,
        carrier_tracking: normalizeTracking(row.carrier_tracking)!,
        unit_value_cents: cents,
      });
    }
    this.setBusy(true);
    this.form.disable();
    const api = this.portal() ? this.portalApi : this.staff;
    api
      .prealertBatch({
        mode: this.form.getRawValue().mode,
        ...(this.portal() ? {} : { customer_id: this.customerId() }),
        packages,
      })
      .pipe(
        switchMap((items) =>
          forkJoin(
            items.map((item, index) => {
              const file = this.files[index];
              return file
                ? api.attachInvoice(item.id, file).pipe(
                    map((updated) => ({ item: updated, warning: '' })),
                    catchError((error: unknown) =>
                      of({ item, warning: `${item.carrier_tracking}: ${requestMessage(error)}` }),
                    ),
                  )
                : of({ item, warning: '' });
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (results) => {
          this.form.enable();
          this.setBusy(false);
          this.created.emit({
            packages: results.map((r) => r.item),
            warning: results
              .filter((r) => r.warning)
              .map((r) => r.warning)
              .join(' · '),
          });
        },
        error: (error: unknown) => {
          this.form.enable();
          this.setBusy(false);
          const fields = (error as { error?: ApiProblem })?.error?.errors ?? {};
          for (const [key, message] of Object.entries(fields)) {
            const match = /^packages\[(\d+)\]\.(\w+)$/.exec(key);
            if (!match) continue;
            const field = match[2] === 'unit_value_cents' ? 'amount' : match[2];
            this.rows.at(Number(match[1]))?.get(field)?.setErrors({ server: message });
          }
          this.error.set(requestMessage(error));
        },
      });
  }
  private setBusy(value: boolean) {
    this.busy.set(value);
    this.busyChange.emit(value);
  }
}
