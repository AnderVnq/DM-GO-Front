import { Component, DestroyRef, inject, signal, viewChild, type ElementRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { type Observable, Subscription, forkJoin, of, switchMap } from 'rxjs';
import { BillingApi } from './billing-api';
import {
  type Agency,
  type ChargeType,
  type DispatchNote,
  type NotePayment,
} from './dispatch-note.model';
import { canCancelNote, canEditNote, paymentIssue } from './billing-rules';
import { CustomersApi, type Customer } from '../customers';
import { ShipmentsApi, type Package } from '../shipments';
import { AuthService } from '../../core/auth.service';
import { DocumentsApi } from '../../core/documents-api';
import { requestMessage } from '../../core/api-problem';
import { Icon } from '../../shared/icon';
import { Status } from '../../shared/status';
import { formatDate, formatUsd, formatWeight, parseAmountToCents } from '../../shared/amount';
import { fileError, openDownload } from '../../shared/download';

@Component({
  selector: 'app-notes-page',
  imports: [ReactiveFormsModule, Icon, Status],
  templateUrl: './notes-page.html',
})
export class NotesPage {
  private readonly api = inject(BillingApi);
  private readonly customers = inject(CustomersApi);
  private readonly shipments = inject(ShipmentsApi);
  private readonly documents = inject(DocumentsApi);
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  readonly notes = signal<DispatchNote[]>([]);
  readonly selected = signal<DispatchNote | null>(null);
  readonly customer = signal<Customer | null>(null);
  readonly packages = signal<Package[]>([]);
  readonly agencies = signal<Agency[]>([]);
  readonly charges = signal<ChargeType[]>([]);
  readonly picked = signal<string[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly success = signal('');
  readonly money = formatUsd;
  readonly date = formatDate;
  readonly weight = formatWeight;
  readonly editable = canEditNote;
  readonly cancellable = canCancelNote;
  readonly createDialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  readonly paymentDialog = viewChild.required<ElementRef<HTMLDialogElement>>('paymentDialog');
  readonly confirmDialog = viewChild.required<ElementRef<HTMLDialogElement>>('confirmDialog');
  readonly chargeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('chargeDialog');
  readonly packageDialog = viewChild.required<ElementRef<HTMLDialogElement>>('packageDialog');
  readonly rateDialog = viewChild.required<ElementRef<HTMLDialogElement>>('rateDialog');
  readonly destinationDialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('destinationDialog');
  readonly rate = this.fb.nonNullable.control('');
  private rateLineId = '';
  private readonly customerId =
    inject(ActivatedRoute).snapshot.queryParamMap.get('customer_id') ?? '';
  private listRequest?: Subscription;
  private detailRequest?: Subscription;
  private evidence: File | null = null;
  private confirmation: (() => Observable<DispatchNote>) | null = null;
  readonly confirmTitle = signal('');
  readonly needsReason = signal(false);
  readonly filters = this.fb.nonNullable.group({ status: [''] });
  readonly creation = this.fb.nonNullable.group({
    locker: ['', Validators.required],
    method: ['pickup'],
    address_id: [''],
    agency_id: [''],
    branch_id: [''],
  });
  readonly payment = this.fb.nonNullable.group({
    method: ['transfer'],
    origin: ['PERU'],
    amount: ['', Validators.required],
    reference: [''],
  });
  readonly charge = this.fb.nonNullable.group({
    code: ['', Validators.required],
    package_id: [''],
    quantity: [1, [Validators.required, Validators.min(1)]],
    rate: [''],
  });
  readonly reason = this.fb.nonNullable.control('');

  constructor() {
    this.reload();
    inject(DestroyRef).onDestroy(() => {
      this.listRequest?.unsubscribe();
      this.detailRequest?.unsubscribe();
    });
  }

  reload() {
    if (this.busy()) return;
    this.listRequest?.unsubscribe();
    this.detailRequest?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.listRequest = this.api
      .list({ customer_id: this.customerId, status: this.filters.getRawValue().status })
      .subscribe({
        next: (notes) => {
          this.notes.set(notes);
          this.loading.set(false);
          const current = notes.find((note) => note.id === this.selected()?.id);
          this.selected.set(current ?? notes[0] ?? null);
        },
        error: (error: unknown) => {
          this.error.set(requestMessage(error));
          this.loading.set(false);
        },
      });
  }

  select(note: DispatchNote) {
    if (this.busy()) return;
    this.detailRequest?.unsubscribe();
    this.selected.set(note);
    this.error.set('');
    this.detailRequest = this.api.get(note.id).subscribe({
      next: (data) => this.selected.set(data),
      error: (error: unknown) => this.error.set(requestMessage(error)),
    });
  }

  openCreate() {
    this.formError.set('');
    this.customer.set(null);
    this.packages.set([]);
    this.picked.set([]);
    this.createDialog().nativeElement.showModal();
    this.api.agencies().subscribe({
      next: (agencies) => this.agencies.set(agencies),
      error: () => this.agencies.set([]),
    });
  }

  findCustomer() {
    const locker = this.creation.getRawValue().locker.trim();
    if (!locker || this.busy()) return;
    this.busy.set(true);
    this.formError.set('');
    this.customer.set(null);
    this.packages.set([]);
    this.picked.set([]);
    this.customers
      .findByLocker(locker)
      .pipe(
        switchMap((customer) =>
          forkJoin({ customer: of(customer), packages: this.shipments.list(customer.id) }),
        ),
      )
      .subscribe({
        next: (data) => {
          this.customer.set(data.customer);
          this.packages.set(
            data.packages.filter(
              (item) =>
                item.status === 'RELEASED' ||
                (item.mode === 'traveler' && item.status === 'ARRIVED_LIMA'),
            ),
          );
          this.busy.set(false);
        },
        error: (error: unknown) => {
          this.formError.set(requestMessage(error));
          this.busy.set(false);
        },
      });
  }

  togglePackage(id: string, checked: boolean) {
    this.picked.update((ids) => (checked ? [...ids, id] : ids.filter((value) => value !== id)));
  }

  create() {
    const customer = this.customer();
    const { method, address_id, agency_id, branch_id } = this.creation.getRawValue();
    if (!customer || !this.picked().length || this.busy()) return;
    if (
      (['home', 'agency_home'].includes(method) && !address_id) ||
      (method.startsWith('agency') && !agency_id) ||
      (method === 'agency_pickup' && !branch_id)
    ) {
      this.formError.set('Selecciona los datos de destino que requiere esta modalidad.');
      return;
    }
    this.busy.set(true);
    this.formError.set('');
    this.api
      .create({
        customer_id: customer.id,
        package_ids: this.picked(),
        method,
        address_id,
        agency_id,
        branch_id,
      })
      .subscribe({
        next: (note) => {
          this.apply(note);
          this.busy.set(false);
          this.createDialog().nativeElement.close();
        },
        error: (error: unknown) => {
          this.formError.set(requestMessage(error));
          this.busy.set(false);
        },
      });
  }

  preparePayment() {
    this.formError.set('');
    this.evidence = null;
    this.payment.reset({ method: 'transfer', origin: 'PERU', amount: '', reference: '' });
    this.paymentDialog().nativeElement.showModal();
  }
  attachEvidence(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.evidence = null;
    if (file) {
      const error = fileError(file);
      this.formError.set(error);
      if (!error) this.evidence = file;
    }
  }

  recordPayment() {
    const note = this.selected();
    const input = this.payment.getRawValue();
    const amount = parseAmountToCents(input.amount);
    if (!note || !this.auth.manager() || note.status !== 'pending_payment' || this.busy()) return;
    const error = paymentIssue(note.balance_cents, amount);
    if (error || this.payment.invalid || amount === null) {
      this.formError.set(error ?? 'Completa los datos del pago.');
      return;
    }
    this.busy.set(true);
    this.formError.set('');
    const proof = this.evidence
      ? this.documents.upload(this.evidence).pipe(switchMap((document) => of(document.id)))
      : of(undefined);
    proof
      .pipe(
        switchMap((id) =>
          this.api.recordPayment(note.id, {
            method: input.method,
            origin: input.origin,
            reference: input.reference,
            amount_cents: amount,
            evidence_document_id: id,
          }),
        ),
      )
      .subscribe({
        next: (updated) => {
          this.apply(updated);
          this.busy.set(false);
          this.paymentDialog().nativeElement.close();
          this.success.set('Pago registrado.');
        },
        error: (failure: unknown) => {
          this.formError.set(requestMessage(failure));
          this.busy.set(false);
        },
      });
  }

  confirmAction(title: string, reasonRequired: boolean, action: () => Observable<DispatchNote>) {
    this.confirmation = action;
    this.confirmTitle.set(title);
    this.needsReason.set(reasonRequired);
    this.reason.reset();
    this.formError.set('');
    this.confirmDialog().nativeElement.showModal();
  }
  liquidate() {
    const note = this.selected();
    if (note && this.auth.manager() && note.status === 'draft')
      this.confirmAction('Liquidar nota de salida', false, () => this.api.liquidate(note.id));
  }
  cancel() {
    const note = this.selected();
    if (note && this.auth.manager() && canCancelNote(note.status, note.paid_cents))
      this.confirmAction('Anular nota de salida', true, () =>
        this.api.cancel(note.id, this.reason.value.trim()),
      );
  }
  review(payment: NotePayment, accept: boolean) {
    const note = this.selected();
    if (
      note &&
      this.auth.manager() &&
      note.status === 'pending_payment' &&
      payment.status === 'pending'
    )
      this.confirmAction(
        accept ? 'Aceptar el pago pendiente' : 'Rechazar el pago pendiente',
        !accept,
        () => this.api.reviewPayment(note.id, payment.id, accept, this.reason.value.trim()),
      );
  }
  confirm() {
    if (!this.confirmation || this.busy()) return;
    if (this.needsReason() && !this.reason.value.trim()) {
      this.formError.set('Indica el motivo para continuar.');
      return;
    }
    this.busy.set(true);
    this.formError.set('');
    this.confirmation().subscribe({
      next: (note) => {
        this.apply(note);
        this.busy.set(false);
        this.confirmDialog().nativeElement.close();
        this.success.set('Operación completada.');
      },
      error: (error: unknown) => {
        this.formError.set(requestMessage(error));
        this.busy.set(false);
      },
    });
  }

  openCharge() {
    this.formError.set('');
    this.charge.reset({ code: '', package_id: '', quantity: 1, rate: '' });
    this.chargeDialog().nativeElement.showModal();
    this.api.catalog().subscribe({
      next: (charges) => this.charges.set(charges),
      error: (error: unknown) => this.formError.set(requestMessage(error)),
    });
  }
  addCharge() {
    const note = this.selected();
    if (!note || !canEditNote(note.status) || this.busy() || this.charge.invalid) return;
    const { rate, ...input } = this.charge.getRawValue();
    const cents = rate ? parseAmountToCents(rate) : undefined;
    if (cents === null) {
      this.formError.set('Indica una tarifa válida.');
      return;
    }
    this.busy.set(true);
    this.formError.set('');
    this.api.addCharge(note.id, { ...input, rate_cents: cents }).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.busy.set(false);
        this.chargeDialog().nativeElement.close();
      },
      error: (error: unknown) => {
        this.formError.set(requestMessage(error));
        this.busy.set(false);
      },
    });
  }
  toggleCharge(lineId: string, applies: boolean) {
    const note = this.selected();
    if (note?.status === 'draft') this.mutate(this.api.updateCharge(note.id, lineId, { applies }));
  }
  removeCharge(lineId: string) {
    const note = this.selected();
    if (note?.status === 'draft' && note.lines.find((line) => line.id === lineId)?.manual)
      this.mutate(this.api.removeCharge(note.id, lineId));
  }
  removePackage(packageId: string) {
    const note = this.selected();
    if (note?.status === 'draft') this.mutate(this.api.removePackage(note.id, packageId));
  }
  preparePackages() {
    const note = this.selected();
    if (!note || !canEditNote(note.status)) return;
    this.packages.set([]);
    this.formError.set('');
    this.packageDialog().nativeElement.showModal();
    this.shipments.list(note.customer_id).subscribe({
      next: (items) =>
        this.packages.set(
          items.filter(
            (item) =>
              !note.guides.some((guide) => guide.package_id === item.id) &&
              (item.status === 'RELEASED' ||
                (item.mode === 'traveler' && item.status === 'ARRIVED_LIMA')),
          ),
        ),
      error: (error: unknown) => this.formError.set(requestMessage(error)),
    });
  }
  addPackage(packageId: string) {
    const note = this.selected();
    if (!note || !canEditNote(note.status) || this.busy()) return;
    this.busy.set(true);
    this.formError.set('');
    this.api.addPackage(note.id, packageId).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.packages.update((items) => items.filter((item) => item.id !== packageId));
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.formError.set(requestMessage(error));
        this.busy.set(false);
      },
    });
  }
  prepareRate(lineId: string, cents: number | null) {
    this.rateLineId = lineId;
    this.rate.setValue(cents === null ? '' : (cents / 100).toFixed(2));
    this.formError.set('');
    this.rateDialog().nativeElement.showModal();
  }
  saveRate() {
    const note = this.selected();
    const cents = parseAmountToCents(this.rate.value);
    if (!note || !canEditNote(note.status) || this.busy()) return;
    if (cents === null) {
      this.formError.set('Indica una tarifa válida.');
      return;
    }
    this.busy.set(true);
    this.formError.set('');
    this.api.updateCharge(note.id, this.rateLineId, { rate_cents: cents }).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.busy.set(false);
        this.rateDialog().nativeElement.close();
      },
      error: (error: unknown) => {
        this.formError.set(requestMessage(error));
        this.busy.set(false);
      },
    });
  }
  prepareDestination() {
    const note = this.selected();
    if (!note || !canEditNote(note.status)) return;
    this.customer.set(null);
    this.formError.set('');
    this.creation.patchValue({ method: note.method, address_id: '', agency_id: '', branch_id: '' });
    this.destinationDialog().nativeElement.showModal();
    forkJoin({
      customer: this.customers.get(note.customer_id),
      agencies: this.api.agencies(),
    }).subscribe({
      next: (data) => {
        this.customer.set(data.customer);
        this.agencies.set(data.agencies);
      },
      error: (error: unknown) => this.formError.set(requestMessage(error)),
    });
  }
  saveDestination() {
    const note = this.selected();
    if (!note || !canEditNote(note.status) || this.busy()) return;
    const { method, address_id, agency_id, branch_id } = this.creation.getRawValue();
    if (
      (['home', 'agency_home'].includes(method) && !address_id) ||
      (method.startsWith('agency') && !agency_id) ||
      (method === 'agency_pickup' && !branch_id)
    ) {
      this.formError.set('Completa los datos del destino.');
      return;
    }
    this.busy.set(true);
    this.formError.set('');
    this.api.setDestination(note.id, { method, address_id, agency_id, branch_id }).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.busy.set(false);
        this.destinationDialog().nativeElement.close();
      },
      error: (error: unknown) => {
        this.formError.set(requestMessage(error));
        this.busy.set(false);
      },
    });
  }
  private mutate(request: Observable<DispatchNote>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: (note) => {
        this.apply(note);
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.error.set(requestMessage(error));
        this.busy.set(false);
      },
    });
  }
  private apply(note: DispatchNote) {
    this.listRequest?.unsubscribe();
    this.detailRequest?.unsubscribe();
    this.loading.set(false);
    this.selected.set(note);
    this.notes.update((notes) =>
      notes.some((item) => item.id === note.id)
        ? notes.map((item) => (item.id === note.id ? note : item))
        : [note, ...notes],
    );
  }
  download() {
    const note = this.selected();
    if (note && !this.busy())
      this.api.pdf(note.id).subscribe({
        next: (link) => {
          try {
            openDownload(link.url);
          } catch (error) {
            this.error.set(requestMessage(error));
          }
        },
        error: (error: unknown) => this.error.set(requestMessage(error)),
      });
  }
}
