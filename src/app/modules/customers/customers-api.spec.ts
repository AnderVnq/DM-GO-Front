import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CustomersApi } from './customers-api';
import { RuntimeConfig } from '../../core/runtime-config';

describe('CustomersApi', () => {
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
  it('busca un cliente individual por casillero sin inventar listados', () => {
    TestBed.inject(CustomersApi)
      .findByLocker(' pe00042 ')
      .subscribe((customer) => expect(customer.id).toBe('customer-1'));
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/v1/customers?locker_code=PE00042',
    );
    request.flush({ id: 'customer-1' });
  });
  it('envía tipo y número de documento', () => {
    TestBed.inject(CustomersApi).findByDocument('dni', '74218365').subscribe();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/customers?doc_type=dni&doc_number=74218365')
      .flush({ id: 'customer-1' });
  });
});
