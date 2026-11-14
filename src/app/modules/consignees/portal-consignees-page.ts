import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, type NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { PortalShipmentsApi, type Package } from '../shipments';
import { requestCode, requestMessage } from '../../core/api-problem';
import { PortalConsigneesApi } from './portal-consignees-api';
import type { Consignee, ConsigneeInput, ConsigneeUsage } from './consignee.model';

@Component({
  selector: 'app-portal-consignees-page',
  imports: [FormsModule],
  templateUrl: './portal-consignees-page.html',
  styleUrl: './portal-consignees-page.scss',
})
export class PortalConsigneesPage {
  private readonly api = inject(PortalConsigneesApi);
  private readonly shipments = inject(PortalShipmentsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private reading?: Subscription;
  readonly createDetails = viewChild<ElementRef<HTMLDetailsElement>>('createDetails');
  readonly consignees = signal<Consignee[]>([]);
  readonly packages = signal<Package[]>([]);
  readonly selected = signal<Consignee | null>(null);
  readonly usage = signal<ConsigneeUsage | null>(null);
  readonly consent = signal('');
  readonly loading = signal(false);
  readonly usageLoading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly usageError = signal('');
  readonly success = signal('');
  readonly removing = signal(false);
  packageId = '';
  input: ConsigneeInput = this.emptyInput();
  get needsName() {
    return ['ce', 'passport'].includes(this.input.doc_type);
  }
  readonly relationship = (value: string) =>
    ({ self: 'Titular', family: 'Familiar', friend: 'Amistad', other: 'Otro', buyer: 'Comprador' })[
      value
    ] ?? value;
  constructor() {
    this.reload();
    this.destroyRef.onDestroy(() => this.reading?.unsubscribe());
  }
  reload() {
    if (this.busy() || this.loading()) return;
    this.reading?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    this.consignees.set([]);
    this.packages.set([]);
    this.selected.set(null);
    this.usage.set(null);
    this.consent.set('');
    forkJoin({ book: this.api.list(), packages: this.shipments.list() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.consignees.set(data.book.consignees);
          this.consent.set(data.book.consent_text);
          this.packages.set(data.packages);
          const id = this.route.snapshot.queryParamMap.get('package_id');
          this.packageId = data.packages.find((p) => p.id === id)?.id ?? '';
          this.loading.set(false);
          if (data.book.consignees[0]) this.select(data.book.consignees[0]);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.fail(error);
        },
      });
  }
  select(item: Consignee) {
    if (this.busy()) return;
    this.reading?.unsubscribe();
    this.selected.set(item);
    this.usage.set(null);
    this.removing.set(false);
    this.success.set('');
    this.error.set('');
    this.loadUsage();
  }
  loadUsage() {
    const item = this.selected();
    if (!item || this.busy()) return;
    this.reading?.unsubscribe();
    this.usage.set(null);
    this.usageLoading.set(true);
    this.usageError.set('');
    this.reading = this.api.usage(item.id).subscribe({
      next: (usage) => {
        this.usage.set(usage);
        this.usageLoading.set(false);
      },
      error: (error: unknown) => {
        this.usageLoading.set(false);
        if (requestCode(error) === 'onboarding_required') void this.router.navigate(['/portal']);
        else this.usageError.set(requestMessage(error));
      },
    });
  }
  create(form: NgForm) {
    if (form.invalid || !this.input.consent || !this.consent() || this.busy() || this.loading())
      return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    this.api
      .create({
        ...this.input,
        name: this.needsName ? this.input.name.trim() : '',
        doc_number: this.input.doc_number.trim(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (item) => {
          this.consignees.update((items) => [...items, item]);
          this.input = this.emptyInput();
          form.resetForm(this.input);
          this.busy.set(false);
          this.select(item);
          this.success.set('Destinatario añadido a tu libreta.');
          const details = this.createDetails();
          if (details) details.nativeElement.open = false;
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.fail(error);
        },
      });
  }
  assign() {
    const item = this.selected();
    if (
      !item ||
      !this.usage() ||
      this.busy() ||
      this.loading() ||
      !this.packages().some((p) => p.id === this.packageId)
    )
      return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    const pack = this.packages().find((p) => p.id === this.packageId)!;
    this.api
      .assign(pack.id, item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (usage) => {
          this.usage.set(usage);
          this.busy.set(false);
          this.success.set(
            `Destinatario asignado a ${pack.carrier_tracking || pack.receipt?.number || pack.id}.`,
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.fail(error);
          this.loadUsage();
        },
      });
  }
  remove() {
    const item = this.selected();
    if (!item || item.relationship === 'self' || !this.removing() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    this.reading?.unsubscribe();
    this.api
      .remove(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.consignees.update((items) => items.filter((c) => c.id !== item.id));
          this.selected.set(null);
          this.usage.set(null);
          this.removing.set(false);
          this.busy.set(false);
          this.success.set('Destinatario quitado de tu libreta.');
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.fail(error);
        },
      });
  }
  private emptyInput(): ConsigneeInput {
    return {
      name: '',
      doc_type: 'dni',
      doc_number: '',
      relationship: 'family',
      phone: '',
      email: '',
      consent: false,
    };
  }
  private fail(error: unknown) {
    if (requestCode(error) === 'onboarding_required') void this.router.navigate(['/portal']);
    else this.error.set(requestMessage(error));
  }
}
