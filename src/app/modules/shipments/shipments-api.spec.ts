import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RuntimeConfig } from '../../core/runtime-config';
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
  it('adjunta facturas mediante el campo multipart file', () => {
    const file = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
    api.attachInvoice('package-1', file).subscribe();
    const request = http.expectOne('/api/v1/packages/package-1/invoice');
    expect(request.request.method).toBe('POST');
    expect((request.request.body as FormData).get('file')).toBe(file);
    request.flush({ id: 'package-1' });
  });
});
