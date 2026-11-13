import { Component, DestroyRef, inject, signal, viewChild, type ElementRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { QuotesApi } from './quotes-api';
import { CustomersApi, type Customer } from '../customers';
import { type Quote } from './quote.model';
import { matchesCustomerLookup } from './quote-rules';
import { Icon } from '../../shared/icon';
import { Status } from '../../shared/status';
import { formatDate, formatUsd, formatWeight, parseAmountToCents } from '../../shared/amount';
import { requestMessage } from '../../core/api-problem';
import { savePdf } from '../../shared/download';

const concepts: Record<string, string> = {
  product: 'Producto',
  tax_usa: 'Impuesto en USA',
  delivery_usa: 'Envío en USA',
  assisted_purchase: 'Compra asistida',
  freight: 'Flete internacional',
  customs: 'Aduana',
  peru_tax_estimate: 'Tributos estimados en Perú',
  extras: 'Servicios adicionales',
  discount: 'Descuento',
};

@Component({
  selector: 'app-quotes-page',
  imports: [ReactiveFormsModule, Icon, Status],
  templateUrl: './quotes-page.html',
})
export class QuotesPage {
  private readonly api = inject(QuotesApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly fb = inject(FormBuilder);
  readonly quotes = signal<Quote[]>([]);
  readonly customer = signal<Customer | null>(null);
  readonly locker = this.fb.nonNullable.control('');
  readonly selected = signal<Quote | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly money = formatUsd;
  readonly date = formatDate;
  readonly weight = formatWeight;
  readonly concept = (value: string) => concepts[value] ?? value.replaceAll('_', ' ');
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  private request?: Subscription;
  private detailRequest?: Subscription;
  readonly filters = this.fb.nonNullable.group({ status: [''] });
  readonly form = this.fb.nonNullable.group({
    prospect_name: ['', Validators.required],
    prospect_email: ['', Validators.email],
    prospect_phone: [''],
    product_name: ['', Validators.required],
    product_url: [''],
    store: [''],
    price: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    grams: [0, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    delivery: ['0'],
    discount: ['0'],
    traveler: [false],
    notes: [''],
  });

  constructor() {
    this.reload();
    inject(DestroyRef).onDestroy(() => {
      this.request?.unsubscribe();
      this.detailRequest?.unsubscribe();
    });
  }
  reload() {
    if (this.busy()) return;
    this.request?.unsubscribe();
    this.detailRequest?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.request = this.api.list({ status: this.filters.getRawValue().status }).subscribe({
      next: (quotes) => {
        this.quotes.set(quotes);
        this.selected.set(
          quotes.find((quote) => quote.id === this.selected()?.id) ?? quotes[0] ?? null,
        );
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(requestMessage(error));
        this.loading.set(false);
      },
    });
  }
  select(quote: Quote) {
    if (this.busy()) return;
    this.request?.unsubscribe();
    this.loading.set(false);
    this.detailRequest?.unsubscribe();
    this.selected.set(quote);
    this.error.set('');
    this.detailRequest = this.api.get(quote.id).subscribe({
      next: (data) => this.selected.set(data),
      error: (error: unknown) => this.error.set(requestMessage(error)),
    });
  }
  create() {
    if (this.form.invalid || this.busy()) return;
    const { price, delivery, discount, ...input } = this.form.getRawValue();
    const unit = parseAmountToCents(price);
    const shipping = parseAmountToCents(delivery);
    const reduction = parseAmountToCents(discount);
    if (unit === null || unit <= 0 || shipping === null || reduction === null) {
      this.formError.set(
        'Revisa los importes. Usa como máximo dos decimales y no incluyas separadores de miles.',
      );
      return;
    }
    if (!Number.isSafeInteger(input.quantity) || !Number.isSafeInteger(input.grams)) {
      this.formError.set('La cantidad y el peso en gramos deben ser enteros.');
      return;
    }
    this.request?.unsubscribe();
    this.detailRequest?.unsubscribe();
    this.loading.set(false);
    this.error.set('');
    this.busy.set(true);
    this.formError.set('');
    this.api
      .create({
        customer_id: this.customer()?.id,
        ...input,
        unit_cents: unit,
        delivery_usa_cents: shipping,
        discount_cents: reduction,
        extras: [],
      })
      .subscribe({
        next: (quote) => {
          this.quotes.update((quotes) => [quote, ...quotes]);
          this.selected.set(quote);
          this.busy.set(false);
          this.dialog().nativeElement.close();
          this.form.reset();
        },
        error: (error: unknown) => {
          this.formError.set(requestMessage(error));
          this.busy.set(false);
        },
      });
  }
  findCustomer() {
    if (!this.locker.value.trim() || this.busy()) return;
    this.busy.set(true);
    this.formError.set('');
    this.customer.set(null);
    const requestedLocker = this.locker.value;
    this.customersApi.findByLocker(requestedLocker).subscribe({
      next: (customer) => {
        if (!matchesCustomerLookup(requestedLocker, this.locker.value)) {
          this.busy.set(false);
          return;
        }
        this.customer.set(customer);
        this.form.patchValue({
          prospect_name: customer.name,
          prospect_email: customer.email,
          prospect_phone: customer.phone,
        });
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.formError.set(requestMessage(error));
        this.busy.set(false);
      },
    });
  }
  download() {
    const quote = this.selected();
    if (!quote || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.pdf(quote.id).subscribe({
      next: (blob) => {
        this.busy.set(false);
        try {
          savePdf(blob, `${quote.number}.pdf`);
        } catch (error) {
          this.error.set(requestMessage(error));
        }
      },
      error: (error: unknown) => {
        this.error.set(requestMessage(error));
        this.busy.set(false);
      },
    });
  }
}
