import { AddressBook } from '../../shared/address-book';
import type { AddressRecord } from '../../shared/address.model';
import { LoadingIndicator } from '../../shared/loading-indicator';
import { Component, DestroyRef, inject, signal, viewChild, type ElementRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CustomersApi } from './customers-api';
import {
  type Customer,
  type CustomerListPage,
  type CustomerListQuery,
  type CustomerSort,
} from './customer.model';
import { customerFieldErrors } from './customer-validation';
import { Icon } from '../../shared/icon';
import { requestMessage } from '../../core/api-problem';
import { formatDate } from '../../shared/amount';

@Component({
  selector: 'app-customers-page',
  imports: [AddressBook, LoadingIndicator, ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './customers-page.html',
  styleUrl: './customers-page.scss',
})
export class CustomersPage {
  private readonly api = inject(CustomersApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly customer = signal<Customer | null>(null);
  updateAddresses(addresses: AddressRecord[]) {
    this.customer.update((item) => (item ? { ...item, addresses } : null));
  }
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly searched = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly formFields = signal<Record<string, string>>({});
  readonly contactFields = signal<Record<string, string>>({});
  readonly contactError = signal('');
  readonly contactDialog = viewChild.required<ElementRef<HTMLDialogElement>>('contactDialog');
  private editingContact = false;
  readonly success = signal('');
  readonly formatDate = formatDate;
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  private request?: Subscription;
  private listRequest?: Subscription;
  readonly listPage = signal<CustomerListPage | null>(null);
  readonly listLoading = signal(false);
  readonly listError = signal('');
  readonly listFilters = this.fb.nonNullable.group({
    q: ['', Validators.maxLength(100)],
    sort: ['newest' as CustomerSort],
    limit: [25],
  });
  private listQuery: CustomerListQuery = { q: '', sort: 'newest', limit: 25, offset: 0 };

  applyListFilters() {
    if (this.listFilters.invalid || this.saving()) return;
    this.listQuery = { ...this.listFilters.getRawValue(), offset: 0 };
    this.reloadList();
  }

  reloadList() {
    if (this.saving()) return;
    this.listRequest?.unsubscribe();
    this.listLoading.set(true);
    this.listError.set('');
    this.listRequest = this.api.list(this.listQuery).subscribe({
      next: (page) => {
        if (page.total > 0 && page.offset >= page.total) {
          this.listQuery = {
            ...this.listQuery,
            offset: Math.floor((page.total - 1) / page.limit) * page.limit,
          };
          this.reloadList();
          return;
        }
        const currentPage = page.total === 0 ? { ...page, offset: 0 } : page;
        this.listQuery = {
          ...this.listQuery,
          limit: currentPage.limit,
          offset: currentPage.offset,
        };
        this.listPage.set(currentPage);
        this.listLoading.set(false);
      },
      error: (error: unknown) => {
        this.listError.set(requestMessage(error));
        this.listLoading.set(false);
      },
    });
  }

  changePage(direction: -1 | 1) {
    const page = this.listPage();
    if (!page || this.listLoading() || this.saving()) return;
    const offset = page.offset + direction * page.limit;
    if (offset < 0 || offset >= page.total) return;
    this.listQuery = { ...this.listQuery, offset };
    this.reloadList();
  }

  openCustomer(id: string) {
    if (this.saving() || this.loading()) return;
    this.request?.unsubscribe();
    this.customer.set(null);
    this.success.set('');
    this.error.set('');
    this.load(id);
  }

  backToList() {
    if (this.saving()) return;
    this.request?.unsubscribe();
    this.customer.set(null);
    this.loading.set(false);
    this.error.set('');
    this.success.set('');
    void this.router.navigate([], {
      queryParams: { id: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.reloadList();
  }
  readonly search = this.fb.nonNullable.group({
    kind: ['locker'],
    value: ['', [Validators.required, Validators.pattern(/\S/)]],
  });
  readonly form = this.fb.nonNullable.group({
    doc_type: ['dni' as 'dni' | 'ruc', Validators.required],
    doc_number: ['', Validators.required],
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
  });
  readonly contact = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.request?.unsubscribe();
      this.listRequest?.unsubscribe();
    });
    for (const [controls, fields] of [
      [this.form.controls, this.formFields],
      [this.contact.controls, this.contactFields],
    ] as const) {
      for (const [key, control] of Object.entries(controls)) {
        const changes = control.valueChanges.subscribe(() =>
          fields.update((current) => {
            const next = { ...current };
            delete next[key];
            if (key === 'doc_type') delete next['doc_number'];
            return next;
          }),
        );
        destroyRef.onDestroy(() => changes.unsubscribe());
      }
    }
    const id = inject(ActivatedRoute).snapshot.queryParamMap.get('id');
    if (id) this.load(id);
    else this.reloadList();
  }

  find() {
    if (this.search.invalid || this.saving()) return;
    const { kind, value } = this.search.getRawValue();
    this.request?.unsubscribe();
    this.customer.set(null);
    this.error.set('');
    this.success.set('');
    this.loading.set(true);
    this.searched.set(true);
    const request =
      kind === 'locker'
        ? this.api.findByLocker(value)
        : this.api.findByDocument(kind === 'ruc' ? 'ruc' : 'dni', value);
    this.request = request.subscribe({
      next: (customer) => {
        this.setCustomer(customer);
        this.loading.set(false);
        void this.router.navigate([], { queryParams: { id: customer.id }, replaceUrl: true });
      },
      error: (error: unknown) => {
        this.error.set(requestMessage(error));
        this.loading.set(false);
      },
    });
  }

  private load(id: string) {
    this.loading.set(true);
    this.request = this.api.get(id).subscribe({
      next: (customer) => {
        this.setCustomer(customer);
        this.loading.set(false);
        void this.router.navigate([], { queryParams: { id: customer.id }, replaceUrl: true });
      },
      error: (error: unknown) => {
        this.error.set(requestMessage(error));
        this.loading.set(false);
      },
    });
  }

  private setCustomer(customer: Customer) {
    this.customer.set(customer);
    this.error.set('');
    this.contactFields.set({});
    this.contact.reset({ email: customer.email, phone: customer.phone });
    this.success.set('');
  }

  create() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.formError.set('');
    this.formFields.set({});
    this.api.create(this.form.getRawValue()).subscribe({
      next: (customer) => {
        this.request?.unsubscribe();
        this.loading.set(false);
        this.setCustomer(customer);
        this.saving.set(false);
        this.dialog().nativeElement.close();
        this.form.reset();
        void this.router.navigate([], { queryParams: { id: customer.id }, replaceUrl: true });
      },
      error: (error: unknown) => {
        this.formError.set(requestMessage(error));
        this.formFields.set(customerFieldErrors(error));
        this.saving.set(false);
      },
    });
  }

  editContact() {
    const customer = this.customer();
    if (!customer || this.saving() || this.loading()) return;
    this.contact.reset({ email: customer.email, phone: customer.phone });
    this.contactFields.set({});
    this.contactError.set('');
    this.editingContact = true;
    this.contactDialog().nativeElement.showModal();
  }

  cancelContact(event?: Event) {
    event?.preventDefault();
    if (this.saving()) return;
    this.editingContact = false;
    const customer = this.customer();
    if (customer) this.contact.reset({ email: customer.email, phone: customer.phone });
    this.contactFields.set({});
    this.contactError.set('');
    this.contactDialog().nativeElement.close();
  }

  private normalizedContact(value: { email: string; phone: string }) {
    return {
      email: value.email.trim().toLowerCase(),
      phone: value.phone.trim().replace(/[ ()-]/g, ''),
    };
  }

  contactValid() {
    const value = this.normalizedContact(this.contact.getRawValue());
    return this.contact.valid && !!value.email && !!value.phone;
  }

  contactChanged() {
    const customer = this.customer();
    if (!customer) return false;
    const current = this.normalizedContact(customer);
    const draft = this.normalizedContact(this.contact.getRawValue());
    return current.email !== draft.email || current.phone !== draft.phone;
  }

  saveContact() {
    const customer = this.customer();
    if (
      !customer ||
      !this.editingContact ||
      !this.contactChanged() ||
      !this.contactValid() ||
      this.saving()
    )
      return;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    this.contactFields.set({});
    this.contactError.set('');
    this.api
      .updateContact(customer.id, this.normalizedContact(this.contact.getRawValue()))
      .subscribe({
        next: (updated) => {
          this.setCustomer(updated);
          this.saving.set(false);
          this.editingContact = false;
          this.contactDialog().nativeElement.close();
          this.success.set('Datos de contacto actualizados.');
        },
        error: (error: unknown) => {
          this.contactError.set(requestMessage(error));
          this.contactFields.set(customerFieldErrors(error));
          this.saving.set(false);
        },
      });
  }
}
