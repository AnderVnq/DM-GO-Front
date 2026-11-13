import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { CustomersApi } from '../customers';
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
  grams: 1000,
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
  fixture.nativeElement.querySelector('dialog').close = vi.fn();
  const page = fixture.componentInstance;
  page.form.patchValue({
    prospect_name: 'Nuevo cliente',
    product_name: 'Nuevo producto',
    price: '100',
    grams: 1000,
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
  page.select(created);
  pending.next([previous]);
  fixture.detectChanges();
  expect(page.selected()?.id).toBe('created');
  expect(page.loading()).toBe(false);
  expect(fixture.nativeElement.querySelector('.inspector h2').textContent).toBe('COT-002');
});
