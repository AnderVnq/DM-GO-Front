import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { CustomersApi, type Customer } from '../customers';
import { QuotesApi } from './quotes-api';
import { QuotesPage } from './quotes-page';
import type { Quote } from './quote.model';

const previous: Quote = {
  id: 'previous',
  number: 'COT-001',
  status: 'pending',
  prospect_name: 'Cliente anterior',
  product_name: 'Producto anterior',
  unit_cents: 10000,
  quantity: 1,
  weight_kg: '1.000',
  currency: 'USD',
  total_cents: 12000,
  breakdown: [
    { concept: 'product', cents: 10000 },
    { concept: 'freight', cents: 2000 },
  ],
  created_at: '2026-11-13T00:00:00Z',
  expires_at: '2026-11-20T00:00:00Z',
};
const created: Quote = {
  ...previous,
  id: 'created',
  number: 'COT-002',
  product_name: 'Nuevo producto',
};

function setup(list: Subject<Quote[]>, detail = new Subject<Quote>()) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: QuotesApi,
        useValue: { list: () => list, get: () => detail, create: () => of(created) },
      },
      { provide: CustomersApi, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(QuotesPage);
  fixture.detectChanges();
  fixture.componentInstance.creating.set(true);
  fixture.detectChanges();
  const page = fixture.componentInstance;
  page.form.patchValue({
    prospect_name: 'Nuevo cliente',
    prospect_email: 'nuevo@example.test',
    product_name: 'Nuevo producto',
    price: '100',
    weight_kg: '1.000',
  });
  return { fixture, page };
}

for (const response of ['success', 'error'] as const) {
  it(`conserva la cotización creada ante una respuesta tardía del listado (${response})`, () => {
    const pending = new Subject<Quote[]>();
    const { fixture, page } = setup(pending);
    page.create();
    if (response === 'success') pending.next([previous]);
    else pending.error(new Error('Consulta anterior fallida'));
    fixture.detectChanges();
    expect(page.quotes().map((quote) => quote.id)).toEqual(['created']);
    expect(page.selected()?.id).toBe('created');
    expect(page.error()).toBe('');
    expect(page.loading()).toBe(false);
    expect(fixture.nativeElement.querySelector('.inspector h2').textContent).toBe('COT-002');
  });

  it(`conserva la cotización creada ante una respuesta tardía del detalle (${response})`, () => {
    const list = new Subject<Quote[]>();
    const pending = new Subject<Quote>();
    const { fixture, page } = setup(list, pending);
    list.next([previous]);
    list.complete();
    page.select(previous);
    page.create();
    if (response === 'success') pending.next(previous);
    else pending.error(new Error('Detalle anterior fallido'));
    fixture.detectChanges();
    expect(page.selected()?.id).toBe('created');
    expect(page.error()).toBe('');
    expect(fixture.nativeElement.querySelector('.inspector h2').textContent).toBe('COT-002');
  });
}

it('conserva la selección manual cuando llega un listado anterior', () => {
  const pending = new Subject<Quote[]>();
  const { fixture, page } = setup(pending);
  page.quotes.set([previous, created]);
  page.closeCreate();
  page.select(created);
  pending.next([previous]);
  fixture.detectChanges();
  expect(page.selected()?.id).toBe('created');
  expect(page.loading()).toBe(false);
  expect(fixture.nativeElement.querySelector('.inspector h2').textContent).toBe('COT-002');
});

it('normaliza los kg escritos sin perder ceros y muestra el error del peso junto al campo', () => {
  const pending = new Subject<Quote[]>();
  const { fixture, page } = setup(pending);
  const response = new Subject<Quote>();
  TestBed.inject(QuotesApi).create = vi.fn(() => response);
  page.form.controls.weight_kg.setValue('0,250');
  page.create();
  expect(TestBed.inject(QuotesApi).create).toHaveBeenCalledWith(
    expect.objectContaining({ weight_kg: '0.250' }),
  );
  response.error({
    status: 422,
    error: { code: 'invalid_weight', errors: { weight_kg: 'Revisa el peso estimado.' } },
  });
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('#quote-weight-error').textContent).toContain(
    'Revisa el peso estimado.',
  );
  expect(page.form.controls.weight_kg.value).toBe('0,250');
  for (const value of ['', '0', '500.001', '1.1234', '1e2']) {
    page.form.controls.weight_kg.setValue(value);
    expect(page.form.invalid).toBe(true);
  }
});

it('envía tarifas explícitas y servicios del catálogo, conservando los centavos exactos', () => {
  const { page } = setup(new Subject<Quote[]>());
  const api = TestBed.inject(QuotesApi);
  api.create = vi.fn(() => of(created));
  page.charges.set([{ code: 'repack', name: 'Reempaque', active: true, default_cents: 350 }]);
  page.addExtra();
  page.extras.at(0).patchValue({ code: 'repack', quantity: 2, price: '3,50' });
  page.form.patchValue({ tax: '7,25', assisted: '5', freight: '12,50', peru: 'no' });
  page.create();
  expect(api.create).toHaveBeenCalledWith(
    expect.objectContaining({
      tax_usa_bp: 725,
      assisted_bp: 500,
      rate_per_kg_cents: 1250,
      peru_tax_on: false,
      extras: [{ code: 'repack', quantity: 2, unit_cents: 350 }],
    }),
  );
});

it('mantiene pendientes los cargos desconocidos y calcula un peso con tres decimales', () => {
  const { page } = setup(new Subject<Quote[]>());
  page.form.patchValue({ weight_kg: '1.001', freight: '10' });
  expect(page.previewLines().find((line) => line.label.startsWith('Envío USA-PERU'))).toEqual({
    label: 'Envío USA-PERU (1.001 kg)',
    cents: 1001,
  });
  expect(page.previewLines().find((line) => line.label === 'Aduana')?.cents).toBeNull();
  expect(page.previewLines().find((line) => line.label === 'Impuesto en USA')?.cents).toBeNull();
  expect(page.knownSubtotal()).toBe(11001);
  expect(page.parameters()).toEqual({ rate_per_kg_cents: 1000 });
});

it('rechaza un prospecto sin contacto, tarifas inválidas y servicios duplicados', () => {
  const { page } = setup(new Subject<Quote[]>());
  const api = TestBed.inject(QuotesApi);
  api.create = vi.fn(() => of(created));
  page.form.patchValue({ prospect_email: '', prospect_phone: '' });
  page.create();
  expect(api.create).not.toHaveBeenCalled();
  expect(page.formError()).toContain('correo electrónico o teléfono');
  page.form.patchValue({ prospect_email: 'test@example.test', tax: '100.01' });
  page.create();
  expect(api.create).not.toHaveBeenCalled();
  page.form.patchValue({ tax: '' });
  page.charges.set([{ code: 'repack', name: 'Reempaque', active: true, default_cents: 350 }]);
  page.addExtra();
  page.addExtra();
  for (const extra of page.extras.controls)
    extra.patchValue({ code: 'repack', quantity: 1, price: '3.50' });
  page.create();
  expect(api.create).not.toHaveBeenCalled();
});

it('conserva el formulario visible cuando se intenta volver mientras está guardando', () => {
  const { page, fixture } = setup(new Subject<Quote[]>());
  page.busy.set(true);
  const cancel = new Event('cancel', { cancelable: true });
  page.closeCreate(cancel);
  expect(cancel.defaultPrevented).toBe(true);
  expect(page.creating()).toBe(true);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('.quote-workbench')).not.toBeNull();
});

it('omite el precio automático del extra para respetar la tarifa vigente del cliente', () => {
  const { page } = setup(new Subject<Quote[]>());
  const api = TestBed.inject(QuotesApi);
  api.create = vi.fn(() => of(created));
  page.charges.set([{ code: 'repack', name: 'Reempaque', active: true, default_cents: 350 }]);
  page.addExtra();
  page.extras.at(0).patchValue({ code: 'repack', quantity: 2, price: '9.99' });
  page.changeExtra(0);
  expect(page.extras.at(0).controls.price.value).toBe('');
  expect(
    page.previewLines().find((line) => line.label === 'Servicios adicionales')?.cents,
  ).toBeNull();
  page.create();
  expect(api.create).toHaveBeenCalledWith(
    expect.objectContaining({ extras: [{ code: 'repack', quantity: 2 }] }),
  );
});

it('buscar cliente con Enter no envía el formulario de cotización', () => {
  const { page, fixture } = setup(new Subject<Quote[]>());
  const customersApi = TestBed.inject(CustomersApi);
  customersApi.findByLocker = vi.fn(() => new Subject<Customer>());
  const api = TestBed.inject(QuotesApi);
  api.create = vi.fn(() => of(created));
  page.locker.setValue('PE00042');
  const input = fixture.nativeElement.querySelector('.customer-lookup input');
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  input.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(true);
  expect(customersApi.findByLocker).toHaveBeenCalledWith('PE00042');
  expect(api.create).not.toHaveBeenCalled();
});

it('conserva el borrador al consultar el historial y lo limpia después de crear', () => {
  const { page, fixture } = setup(new Subject<Quote[]>());
  TestBed.inject(QuotesApi).chargeTypes = vi.fn(() => of([]));
  page.closeCreate();
  fixture.detectChanges();
  expect(page.creating()).toBe(false);
  expect(fixture.nativeElement.querySelector('.quote-workbench')).toBeNull();
  page.openCreate();
  fixture.detectChanges();
  expect(page.form.controls.product_name.value).toBe('Nuevo producto');
  expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
  page.create();
  expect(page.creating()).toBe(false);
  expect(page.form.controls.product_name.value).toBe('');
});
