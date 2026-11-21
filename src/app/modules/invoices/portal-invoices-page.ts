import { DebouncedInput } from '../../shared/debounced-input';
import { LoadingIndicator } from '../../shared/loading-indicator';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, map, switchMap } from 'rxjs';
import { PortalInvoicesApi } from './portal-invoices-api';
import type { Invoice, InvoiceFileKind } from './invoice.model';
import { requestCode, requestMessage } from '../../core/api-problem';
import { formatDate, formatUsd } from '../../shared/amount';
import { openDownload } from '../../shared/download';
import { PdfPreviewService } from '../../shared/pdf-preview.service';
import { Status } from '../../shared/status';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-portal-invoices-page',
  imports: [DebouncedInput, LoadingIndicator, Status, Icon],
  templateUrl: './portal-invoices-page.html',
})
export class PortalInvoicesPage {
  private readonly api = inject(PortalInvoicesApi);
  private readonly preview = inject(PdfPreviewService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private reading?: Subscription;
  readonly invoices = signal<Invoice[]>([]);
  readonly selected = signal<Invoice | null>(null);
  readonly filter = signal('');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly filtered = computed(() =>
    this.invoices().filter((item) =>
      `${item.code} ${item.note_number}`.toLowerCase().includes(this.filter().toLowerCase()),
    ),
  );
  readonly money = formatUsd;
  readonly date = formatDate;
  readonly type = (value: string) =>
    ({ '01': 'Factura', '03': 'Boleta', '07': 'Nota de crédito' })[value] ?? value;
  constructor() {
    this.reload();
    this.destroyRef.onDestroy(() => this.reading?.unsubscribe());
  }
  reload() {
    if (this.busy()) return;
    this.reading?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.reading = this.api.list().subscribe({
      next: (items) => {
        this.invoices.set(items);
        this.loading.set(false);
        const id = this.selected()?.id ?? this.route.snapshot.queryParamMap.get('invoice_id');
        const selected = items.find((item) => item.id === id) ?? items[0];
        if (selected) this.select(selected);
        else this.selected.set(null);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.fail(error);
      },
    });
  }
  select(invoice: Invoice) {
    if (this.busy()) return;
    this.selected.set(invoice);
    this.error.set('');
    void this.router.navigate([], { queryParams: { invoice_id: invoice.id }, replaceUrl: true });
  }
  viewPdf(invoice = this.selected()) {
    if (!invoice || this.busy() || !invoice.has_pdf) return;
    this.preview.open(`Comprobante ${invoice.code}`, `${invoice.code}.pdf`, () =>
      this.api.file(invoice.id, 'pdf').pipe(switchMap((link) => this.preview.fetch(link.url))),
    );
  }
  download(kind: InvoiceFileKind, invoice = this.selected()) {
    if (!invoice || this.busy() || !invoice[`has_${kind}`]) return;
    this.busy.set(true);
    this.error.set('');
    const request =
      kind === 'pdf'
        ? this.preview.download(`${invoice.code}.pdf`, () =>
            this.api.file(invoice.id, kind).pipe(switchMap((link) => this.preview.fetch(link.url))),
          )
        : this.api.file(invoice.id, kind).pipe(map((link) => openDownload(link.url)));
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.busy.set(false),
      error: (error: unknown) => {
        this.busy.set(false);
        this.fail(error);
      },
    });
  }
  private fail(error: unknown) {
    if (requestCode(error) === 'onboarding_required') void this.router.navigate(['/portal']);
    else this.error.set(requestMessage(error));
  }
}
