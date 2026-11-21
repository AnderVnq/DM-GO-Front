import { CodeSearch } from '../../shared/code-search';
import { LoadingIndicator } from '../../shared/loading-indicator';
import { normalizeWeightKg, weightKgHint } from '../../shared/weight';
import {
  afterRenderEffect,
  Component,
  DestroyRef,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QuotesApi } from './quotes-api';
import { CustomersApi, type Customer } from '../customers';
import {
  type Quote,
  type QuoteChargeType,
  type QuoteExtraInput,
  type PeruTaxMode,
} from './quote.model';
import { matchesCustomerLookup } from './quote-rules';
import { Icon } from '../../shared/icon';
import { Status } from '../../shared/status';
import { formatDate, formatUsd, parseAmountToCents } from '../../shared/amount';
import { requestFieldError, requestMessage } from '../../core/api-problem';
import { savePdf } from '../../shared/download';
import { PdfPreviewService } from '../../shared/pdf-preview.service';

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
  traveler: 'Envío con viajero',
  supplements: 'Suplementos y líquidos',
  delivery_lima: 'Delivery en Lima',
  agency_dispatch: 'Despacho a agencia',
};

@Component({
  selector: 'app-quotes-page',
  imports: [CodeSearch, LoadingIndicator, ReactiveFormsModule, Icon, Status],
  templateUrl: './quotes-page.html',
  styleUrl: './quotes-page.scss',
})
export class QuotesPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(QuotesApi);
  private readonly pdfPreview = inject(PdfPreviewService);
  private readonly customersApi = inject(CustomersApi);
  private readonly fb = inject(FormBuilder);
  readonly charges = signal<QuoteChargeType[]>([]);
  readonly catalogLoading = signal(false);
  readonly catalogError = signal('');
  private catalogRequest?: Subscription;
  readonly extras = this.fb.array<ReturnType<QuotesPage['extraGroup']>>([]);
  readonly quotes = signal<Quote[]>([]);
  readonly customer = signal<Customer | null>(null);
  readonly locker = this.fb.nonNullable.control('');
  readonly selected = signal<Quote | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly emailNotice = signal('');
  readonly emailFailed = signal(false);
  readonly sending = signal(false);
  readonly quoteDate = (value: string) =>
    new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima' }).format(new Date(value));
  readonly money = formatUsd;
  readonly date = formatDate;
  readonly summaryWeight = (kg: string) => kg.replace(',', '.');
  readonly weight = (kg: string) => `${kg} kg`;
  readonly weightError = signal('');
  readonly weightHint = weightKgHint;
  readonly concept = (value: string) => concepts[value] ?? value.replaceAll('_', ' ');
  readonly creating = signal(false);
  readonly pageHeading = viewChild<ElementRef<HTMLHeadingElement>>('pageHeading');
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
    quantity: [
      1,
      [Validators.required, Validators.min(1), Validators.max(1000), Validators.pattern(/^\d+$/)],
    ],
    weight_kg: [
      '',
      [
        Validators.required,
        (control: { value: string }) =>
          normalizeWeightKg(control.value) === null ? { weight: true } : null,
      ],
    ],
    delivery: ['0'],
    discount: ['0'],
    traveler: [false],
    traveler_percent: [''],
    supplements: [false],
    supplement_units: [
      1,
      [Validators.required, Validators.min(1), Validators.max(1000), Validators.pattern(/^\d+$/)],
    ],
    delivery_lima: ['0'],
    agency_dispatch: ['0'],
    valid_until: [''],
    notes: ['', Validators.maxLength(1000)],
    tax: [''],
    assisted: [''],
    freight: [''],
    peru: ['auto' as PeruTaxMode],
    extras: this.extras,
  });

  constructor() {
    afterRenderEffect(() => this.pageHeading()?.nativeElement.focus());
    this.form.controls.supplement_units.disable();
    this.form.controls.supplements.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((enabled) => {
        if (enabled) this.form.controls.supplement_units.enable();
        else this.form.controls.supplement_units.disable();
      });
    this.reload();
    inject(DestroyRef).onDestroy(() => {
      this.request?.unsubscribe();
      this.detailRequest?.unsubscribe();
      this.catalogRequest?.unsubscribe();
    });
  }
  openCreate() {
    if (this.busy()) return;
    this.creating.set(true);
    this.loadCharges();
  }
  closeCreate(event?: Event) {
    if (this.busy()) {
      event?.preventDefault();
      return;
    }
    this.creating.set(false);
  }
  loadCharges() {
    this.catalogRequest?.unsubscribe();
    this.catalogLoading.set(true);
    this.catalogError.set('');
    this.catalogRequest = this.api.chargeTypes().subscribe({
      next: (types) => {
        this.charges.set(
          types.filter((type) => type.active && !['freight', 'customs'].includes(type.code)),
        );
        this.catalogLoading.set(false);
      },
      error: (error: unknown) => {
        this.catalogError.set(requestMessage(error));
        this.catalogLoading.set(false);
      },
    });
  }
  extraGroup() {
    return this.fb.nonNullable.group({
      code: ['', Validators.required],
      quantity: [
        1,
        [Validators.required, Validators.min(1), Validators.max(1000), Validators.pattern(/^\d+$/)],
      ],
      price: [''],
    });
  }
  addExtra() {
    if (!this.busy()) this.extras.push(this.extraGroup());
  }
  changeExtra(index: number) {
    const group = this.extras.at(index);
    group.controls.price.setValue('');
  }
  extraPriceEditable(index: number) {
    const charge = this.charges().find(
      (item) => item.code === this.extras.at(index).controls.code.value,
    );
    return !!charge && (charge.quote_price_editable || charge.default_cents === null);
  }
  parameters() {
    const { tax, assisted, freight, peru, traveler_percent } = this.form.getRawValue();
    const result: {
      tax_usa_bp?: number;
      assisted_bp?: number;
      rate_per_kg_cents?: number;
      peru_tax_mode: PeruTaxMode;
      traveler_percent_bp?: number;
    } = { peru_tax_mode: peru };
    for (const [value, key] of [
      [tax, 'tax_usa_bp'],
      [assisted, 'assisted_bp'],
      [traveler_percent, 'traveler_percent_bp'],
    ] as const) {
      if (!value.trim()) continue;
      const bp = parseAmountToCents(value);
      if (bp === null || bp > 10000) return null;
      result[key] = bp;
    }
    if (freight.trim()) {
      const cents = parseAmountToCents(freight);
      if (cents === null) return null;
      result.rate_per_kg_cents = cents;
    }

    return result;
  }
  extraInputs(): QuoteExtraInput[] | null {
    const result: QuoteExtraInput[] = [];
    for (const extra of this.extras.getRawValue()) {
      const charge = this.charges().find((item) => item.code === extra.code);
      const editable = !!charge && (charge.quote_price_editable || charge.default_cents === null);
      const automatic = !editable || !extra.price.trim();
      const cents = automatic ? undefined : parseAmountToCents(extra.price);
      if (
        cents === null ||
        !Number.isSafeInteger((cents ?? 0) * extra.quantity) ||
        !Number.isSafeInteger(extra.quantity) ||
        extra.quantity < 1 ||
        extra.quantity > 1000 ||
        !this.charges().some((charge) => charge.code === extra.code) ||
        result.some((item) => item.code === extra.code)
      )
        return null;
      result.push({
        code: extra.code,
        quantity: extra.quantity,
        ...(cents === undefined ? {} : { unit_cents: cents }),
      });
    }
    return Number.isSafeInteger(
      result.reduce((sum, item) => sum + (item.unit_cents ?? 0) * item.quantity, 0),
    )
      ? result
      : null;
  }
  previewLines() {
    const value = this.form.getRawValue();
    const unit = parseAmountToCents(value.price);
    const product =
      unit !== null && Number.isSafeInteger(value.quantity) && value.quantity > 0
        ? unit * value.quantity
        : null;
    const parameters = this.parameters();
    const percent = (bp: number | undefined) =>
      product !== null && bp !== undefined && Number.isSafeInteger(product * bp)
        ? Math.floor((product * bp + 5000) / 10000)
        : null;
    const kg = normalizeWeightKg(value.weight_kg);
    const [whole, fraction = ''] = (kg ?? '').split('.');
    const grams =
      kg === null ? null : Number(BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0')));
    const rate = parameters?.rate_per_kg_cents;
    const extras = this.extraInputs();
    return [
      { label: 'Producto', cents: product },
      { label: 'Envío en USA', cents: parseAmountToCents(value.delivery) },
      { label: 'Impuesto en USA', cents: percent(parameters?.tax_usa_bp) },
      { label: 'Compra asistida', cents: percent(parameters?.assisted_bp) },
      {
        label: 'Envío USA-PERU (' + (kg === null ? '—' : this.summaryWeight(kg)) + ' kg)',
        cents:
          grams !== null && rate !== undefined && Number.isSafeInteger(grams * rate)
            ? Math.floor((Math.round(grams) * rate + 500) / 1000)
            : null,
      },
      { label: 'Aduana', cents: value.traveler || value.supplements ? 0 : null },
      ...(value.traveler ? [{ label: 'Envío con viajero', cents: null }] : []),
      ...(value.supplements ? [{ label: 'Suplementos y líquidos', cents: null }] : []),
      { label: 'Delivery en Lima', cents: parseAmountToCents(value.delivery_lima) },
      { label: 'Despacho a agencia', cents: parseAmountToCents(value.agency_dispatch) },
      {
        label: 'Tributos estimados en Perú',
        cents:
          value.peru === 'no' || (value.peru === 'auto' && (value.traveler || value.supplements))
            ? 0
            : null,
      },
      {
        label: 'Servicios adicionales',
        cents:
          extras === null || extras.some((item) => item.unit_cents === undefined)
            ? null
            : extras.reduce((sum, item) => sum + (item.unit_cents ?? 0) * item.quantity, 0),
      },
      {
        label: 'Descuento',
        cents:
          parseAmountToCents(value.discount) === null
            ? null
            : -(parseAmountToCents(value.discount) || 0) || 0,
      },
    ];
  }
  knownSubtotal() {
    const total = this.previewLines().reduce((sum, line) => sum + (line.cents ?? 0), 0);
    return Number.isSafeInteger(total) ? total : NaN;
  }
  reload() {
    if (this.busy()) return;
    this.showEmailResult({});
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
    this.showEmailResult({});
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
  create(sendEmail = false) {
    if (this.form.invalid || this.busy()) return;
    const {
      price,
      delivery,
      discount,
      tax,
      assisted,
      freight,
      peru,
      traveler_percent,
      delivery_lima,
      agency_dispatch,
      valid_until,
      extras,
      ...input
    } = this.form.getRawValue();
    const parameters = this.parameters();
    const extraInputs = this.extraInputs();
    if (parameters === null || extraInputs === null) {
      this.formError.set(
        'Revisa las tarifas y los servicios adicionales: importes con hasta dos decimales, porcentajes entre 0 y 100 y cantidades enteras entre 1 y 1000.',
      );
      return;
    }
    if (!this.customer() && !input.prospect_email.trim() && !input.prospect_phone.trim()) {
      this.formError.set('Indica al menos un correo electrónico o teléfono para el prospecto.');
      return;
    }
    const unit = parseAmountToCents(price);
    const shipping = parseAmountToCents(delivery);
    const reduction = parseAmountToCents(discount);
    const deliveryLima = parseAmountToCents(delivery_lima);
    const agencyDispatch = parseAmountToCents(agency_dispatch);
    if (valid_until && !/^\d{4}-\d{2}-\d{2}$/.test(valid_until)) {
      this.formError.set('Indica una fecha de vigencia válida.');
      return;
    }
    if (
      unit === null ||
      unit <= 0 ||
      unit > 10_000_000 ||
      shipping === null ||
      reduction === null ||
      deliveryLima === null ||
      agencyDispatch === null
    ) {
      this.formError.set(
        'Revisa los importes. Usa como máximo dos decimales y no incluyas separadores de miles.',
      );
      return;
    }
    if (!Number.isSafeInteger(input.quantity)) {
      this.formError.set('La cantidad debe ser un entero.');
      return;
    }
    this.request?.unsubscribe();
    this.detailRequest?.unsubscribe();
    this.loading.set(false);
    this.error.set('');
    this.busy.set(true);
    this.formError.set('');
    this.weightError.set('');
    this.api
      .create({
        customer_id: this.customer()?.id,
        ...input,
        weight_kg: normalizeWeightKg(input.weight_kg)!,
        unit_cents: unit,
        delivery_usa_cents: shipping,
        discount_cents: reduction,
        supplement_units: input.supplements ? input.supplement_units : 0,
        delivery_lima_cents: deliveryLima,
        agency_dispatch_cents: agencyDispatch,
        ...(valid_until ? { valid_until } : {}),
        send_email: sendEmail,
        extras: extraInputs,
        ...parameters,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (quote) => {
          this.quotes.update((quotes) => [quote, ...quotes]);
          this.selected.set(quote);
          this.showEmailResult(sendEmail ? quote : {});
          this.busy.set(false);
          this.creating.set(false);
          this.extras.clear();
          this.form.reset();
          this.customer.set(null);
          this.locker.reset();
        },
        error: (error: unknown) => {
          this.weightError.set(requestFieldError(error, 'weight_kg'));
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
    this.customersApi
      .findByLocker(requestedLocker)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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
  showEmailResult(result: { email_sent?: boolean; email_error?: string }) {
    this.emailFailed.set(result.email_sent === false);
    this.emailNotice.set(
      result.email_sent === true
        ? 'Cotización enviada por correo.'
        : result.email_sent === false
          ? 'La cotización está guardada. No se pudo enviar el correo: ' +
            (result.email_error || 'Reintenta el envío.')
          : '',
    );
  }
  canSend(quote: Quote) {
    return quote.status === 'pending' && new Date(quote.expires_at).getTime() >= Date.now();
  }
  send() {
    const quote = this.selected();
    if (!quote || this.busy() || !this.canSend(quote)) return;
    this.busy.set(true);
    this.sending.set(true);
    this.error.set('');
    this.api
      .send(quote.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.showEmailResult(result);
          this.busy.set(false);
          this.sending.set(false);
        },
        error: (error: unknown) => {
          this.error.set(requestMessage(error));
          this.busy.set(false);
          this.sending.set(false);
        },
      });
  }
  previewPdf(quote = this.selected()) {
    if (!quote || this.busy()) return;
    this.pdfPreview.open(`Cotización ${quote.number}`, `${quote.number}.pdf`, () =>
      this.api.pdf(quote.id),
    );
  }
  download(quote = this.selected()) {
    if (!quote || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .pdf(quote.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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
