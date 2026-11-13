import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RuntimeConfig } from '../../core/runtime-config';
import { QuotesApi } from './quotes-api';

describe('QuotesApi', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
      ],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('trata el PDF de cotización como binario y no como enlace firmado', () => {
    TestBed.inject(QuotesApi)
      .pdf('quote-1')
      .subscribe((blob) => expect(blob.type).toBe('application/pdf'));
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/quotes/quote-1/pdf');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
  });
});

it('consulta las cotizaciones filtradas sin transformar el total del servidor', () => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
    ],
  });
  let total = 0;
  TestBed.inject(QuotesApi)
    .list({ customer_id: 'customer-42', status: 'pending', limit: 5 })
    .subscribe((quotes) => {
      total = quotes[0]!.total_cents;
    });
  const http = TestBed.inject(HttpTestingController);
  const request = http.expectOne((req) => req.url === '/api/v1/quotes');
  expect(request.request.params.get('customer_id')).toBe('customer-42');
  expect(request.request.params.get('status')).toBe('pending');
  expect(request.request.params.get('limit')).toBe('5');
  request.flush({ quotes: [{ id: 'quote-42', total_cents: 12345 }] });
  expect(total).toBe(12345);
  http.verify();
});
