import { Component, DestroyRef, inject, signal, viewChild, type ElementRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, of, switchMap, tap } from 'rxjs';
import { PortalBillingApi } from './portal-billing-api';
import type { DispatchNote } from './dispatch-note.model';
import { paymentIssue } from './billing-rules';
import { DocumentsApi } from '../../core/documents-api';
import { requestCode, requestMessage } from '../../core/api-problem';
import { formatDate, formatUsd, parseAmountToCents } from '../../shared/amount';
import { fileError, openDownload } from '../../shared/download';
import { Status } from '../../shared/status';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-portal-payments-page',
  imports: [ReactiveFormsModule, Status, Icon],
  templateUrl: './portal-payments-page.html',
})
export class PortalPaymentsPage {
  private readonly api = inject(PortalBillingApi);
  private readonly docs = inject(DocumentsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private reading?: Subscription;
  private detailRequest?: Subscription;
  private evidence: File | null = null;
  private evidenceId: string | null = null;
  readonly notes = signal<DispatchNote[]>([]);
  readonly selected = signal<DispatchNote | null>(null);
  readonly loading = signal(false);
  readonly detailLoading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly success = signal('');
  readonly money = formatUsd;
  readonly date = formatDate;
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('paymentDialog');
  readonly payment = this.fb.nonNullable.group({
    amount: ['', Validators.required],
    method: ['transfer'],
    origin: ['PERU'],
    reference: [''],
  });
  readonly methods: Record<string, string> = {
    transfer: 'Transferencia',
    cash: 'Efectivo',
    yape: 'Yape',
    plin: 'Plin',
    card: 'Tarjeta',
    other: 'Otro',
  };
  constructor() {
    this.reload();
    this.destroyRef.onDestroy(() => {
      this.reading?.unsubscribe();
      this.detailRequest?.unsubscribe();
    });
  }
  reload() {
    if (this.busy()) return;
    this.reading?.unsubscribe();
    this.detailRequest?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    this.selected.set(null);
    this.notes.set([]);
    this.reading = this.api.list().subscribe({
      next: (items) => {
        this.notes.set(items);
        this.loading.set(false);
        const id = this.route.snapshot.queryParamMap.get('note_id');
        const item = items.find((note) => note.id === id) ?? items[0];
        if (item) this.select(item);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.fail(error);
      },
    });
  }
  select(note: DispatchNote) {
    if (this.busy()) return;
    this.selected.set(note);
    this.error.set('');
    this.success.set('');
    this.detailRequest?.unsubscribe();
    this.detailLoading.set(true);
    void this.router.navigate([], { queryParams: { note_id: note.id }, replaceUrl: true });
    this.detailRequest = this.api.get(note.id).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.detailLoading.set(false);
      },
      error: (error: unknown) => {
        this.detailLoading.set(false);
        this.selected.set(null);
        this.fail(error);
      },
    });
  }
  preparePayment() {
    if (this.busy() || this.detailLoading() || this.selected()?.status !== 'pending_payment')
      return;
    this.formError.set('');
    this.success.set('');
    this.evidence = null;
    this.evidenceId = null;
    const input = this.dialog().nativeElement.querySelector<HTMLInputElement>('input[type=file]');
    if (input) input.value = '';
    this.payment.reset({ amount: '', method: 'transfer', origin: 'PERU', reference: '' });
    this.dialog().nativeElement.showModal();
  }
  attach(event: Event) {
    if (this.busy()) return;
    this.evidence = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.evidenceId = null;
    this.formError.set(this.evidence ? fileError(this.evidence) : '');
  }
  report() {
    const note = this.selected();
    if (!note || this.busy() || this.detailLoading() || note.status !== 'pending_payment') return;
    const { amount, ...input } = this.payment.getRawValue();
    const cents = parseAmountToCents(amount);
    const issue = paymentIssue(note.balance_cents, cents);
    if (issue || cents === null || this.payment.invalid) {
      this.formError.set(issue ?? 'Revisa el importe.');
      return;
    }
    if (!this.evidence) {
      this.formError.set('Adjunta el comprobante de tu pago para su revisión.');
      return;
    }
    const invalid = fileError(this.evidence);
    if (invalid) {
      this.formError.set(invalid);
      return;
    }
    this.busy.set(true);
    this.formError.set('');
    this.success.set('');
    const proof = this.evidenceId
      ? of(this.evidenceId)
      : this.docs.uploadDirect(this.evidence).pipe(
          tap((document) => {
            this.evidenceId = document.id;
          }),
          switchMap((document) => of(document.id)),
        );
    proof
      .pipe(
        switchMap((id) =>
          this.api.submitPayment(note.id, {
            ...input,
            amount_cents: cents,
            evidence_document_id: id,
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.apply(updated);
          this.busy.set(false);
          this.dialog().nativeElement.close();
          this.success.set('Comprobante enviado. Tu pago está pendiente de revisión.');
        },
        error: (error: unknown) => {
          this.formError.set(requestMessage(error));
          if (error && typeof error === 'object' && 'status' in error && error.status === 409) {
            this.detailRequest?.unsubscribe();
            this.detailRequest = this.api.get(note.id).subscribe({
              next: (updated) => {
                this.apply(updated);
                this.busy.set(false);
              },
              error: () => {
                this.selected.set(null);
                this.busy.set(false);
                this.formError.update(
                  (text) =>
                    text + ' Cierra el formulario y actualiza tus notas antes de continuar.',
                );
              },
            });
          } else {
            this.busy.set(false);
            if (requestCode(error) === 'onboarding_required')
              void this.router.navigate(['/portal']);
          }
        },
      });
  }
  download() {
    const note = this.selected();
    if (!note || this.busy() || this.detailLoading()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .pdf(note.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (link) => {
          this.busy.set(false);
          try {
            openDownload(link.url);
          } catch (error) {
            this.error.set(requestMessage(error));
          }
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.fail(error);
        },
      });
  }
  private apply(note: DispatchNote) {
    this.selected.set(note);
    this.notes.update((items) => items.map((entry) => (entry.id === note.id ? note : entry)));
  }
  private fail(error: unknown) {
    if (requestCode(error) === 'onboarding_required') void this.router.navigate(['/portal']);
    else this.error.set(requestMessage(error));
  }
}
