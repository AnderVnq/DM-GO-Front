import { Component, DestroyRef, inject, signal, viewChild, type ElementRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CustomersApi } from './customers-api';
import { type Customer } from './customer.model';
import { Icon } from '../../shared/icon';
import { requestMessage } from '../../core/api-problem';
import { formatDate } from '../../shared/amount';

@Component({
  selector: 'app-customers-page',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './customers-page.html',
})
export class CustomersPage {
  private readonly api = inject(CustomersApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly customer = signal<Customer | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly searched = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly success = signal('');
  readonly formatDate = formatDate;
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  private request?: Subscription;
  readonly search = this.fb.nonNullable.group({
    kind: ['locker'],
    value: ['', Validators.required],
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
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
    const id = inject(ActivatedRoute).snapshot.queryParamMap.get('id');
    if (id) this.load(id);
  }

  find() {
    if (this.search.invalid || this.saving()) return;
    const { kind, value } = this.search.getRawValue();
    this.request?.unsubscribe();
    this.customer.set(null);
    this.error.set('');
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
      },
      error: (error: unknown) => {
        this.error.set(requestMessage(error));
        this.loading.set(false);
      },
    });
  }

  private setCustomer(customer: Customer) {
    this.customer.set(customer);
    this.contact.reset({ email: customer.email, phone: customer.phone });
    this.success.set('');
  }

  create() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.formError.set('');
    this.api.create(this.form.getRawValue()).subscribe({
      next: (customer) => {
        this.setCustomer(customer);
        this.saving.set(false);
        this.dialog().nativeElement.close();
        this.form.reset();
        void this.router.navigate([], { queryParams: { id: customer.id }, replaceUrl: true });
      },
      error: (error: unknown) => {
        this.formError.set(requestMessage(error));
        this.saving.set(false);
      },
    });
  }

  saveContact() {
    const customer = this.customer();
    if (!customer || this.contact.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.updateContact(customer.id, this.contact.getRawValue()).subscribe({
      next: (updated) => {
        this.setCustomer(updated);
        this.saving.set(false);
        this.success.set('Datos de contacto actualizados.');
      },
      error: (error: unknown) => {
        this.error.set(requestMessage(error));
        this.saving.set(false);
      },
    });
  }
}
