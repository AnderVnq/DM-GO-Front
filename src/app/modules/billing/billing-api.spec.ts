import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BillingApi } from './billing-api';
import { RuntimeConfig } from '../../core/runtime-config';

describe('BillingApi', () => {
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
  it('liquida sin duplicar las fórmulas del servidor', () => {
    TestBed.inject(BillingApi).liquidate('note-1').subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/v1/dispatch-notes/note-1/liquidate',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ id: 'note-1', status: 'pending_payment' });
  });
  it('solicita un enlace PDF firmado como JSON', () => {
    TestBed.inject(BillingApi)
      .pdf('note-1')
      .subscribe((link) => expect(link.url).toBe('https://storage.test/note.pdf'));
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/v1/dispatch-notes/note-1/pdf',
    );
    expect(request.request.responseType).toBe('json');
    request.flush({ url: 'https://storage.test/note.pdf', expires_at: '2026-12-01T00:00:00Z' });
  });
});

it('envía los filtros admitidos y desenvuelve las notas de salida', () => {
  let notes: unknown;
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
    ],
  });
  TestBed.inject(BillingApi)
    .list({ customer_id: 'customer-42', status: 'pending_payment', limit: 5 })
    .subscribe((data) => {
      notes = data;
    });
  const http = TestBed.inject(HttpTestingController);
  const request = http.expectOne((req) => req.url === '/api/v1/dispatch-notes');
  expect(request.request.params.get('customer_id')).toBe('customer-42');
  expect(request.request.params.get('status')).toBe('pending_payment');
  expect(request.request.params.get('limit')).toBe('5');
  request.flush({ dispatch_notes: [] });
  expect(notes).toEqual([]);
  http.verify();
});
