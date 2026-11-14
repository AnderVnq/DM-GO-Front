import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RuntimeConfig } from '../../core/runtime-config';
import { PortalShipmentsApi } from './portal-shipments-api';
import { ShipmentsApi } from './shipments-api';

describe('ShipmentsApi', () => {
  let api: ShipmentsApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
      ],
    });
    api = TestBed.inject(ShipmentsApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('requiere cliente y desenvuelve la respuesta de paquetes', () => {
    expect(() => api.list('')).toThrow();
    api.list('customer-1').subscribe((items) => expect(items).toEqual([]));
    const request = http.expectOne('/api/v1/packages?customer_id=customer-1');
    expect(request.request.method).toBe('GET');
    request.flush({ packages: [] });
  });
  it('crea lotes por canal y consulta pendientes sin cliente', () => {
    const packages = [
      {
        store: 'UPS',
        carrier_tracking: 'ABC123',
        description: 'Libro',
        unit_value_cents: 29,
        quantity: 3,
        observation: '',
      },
    ];
    api.prealertBatch({ customer_id: 'customer-1', mode: 'courier', packages }).subscribe();
    const staff = http.expectOne('/api/v1/packages/batch');
    expect(staff.request.body).toEqual({ customer_id: 'customer-1', mode: 'courier', packages });
    expect(staff.request.method).toBe('POST');
    staff.flush({ packages: [] });
    TestBed.inject(PortalShipmentsApi).prealertBatch({ mode: 'courier', packages }).subscribe();
    const portal = http.expectOne('/api/v1/portal/prealerts/batch');
    expect(portal.request.body).toEqual({ mode: 'courier', packages });
    portal.flush({ packages: [] });
    api.invoicePending().subscribe((items) => expect(items).toEqual([]));
    http.expectOne('/api/v1/packages/invoice-pending').flush({ packages: [] });
  });
  it('adjunta facturas mediante el campo multipart file', () => {
    const file = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
    api.attachInvoice('package-1', file).subscribe();
    const request = http.expectOne('/api/v1/packages/package-1/invoice');
    expect(request.request.method).toBe('POST');
    expect((request.request.body as FormData).get('file')).toBe(file);
    request.flush({ id: 'package-1' });
  });
});
