import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RuntimeConfig } from '../../core/runtime-config';
import { AirfreightApi } from './airfreight-api';

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
it('mantiene el resultado canónico al confirmar la salida', () => {
  TestBed.inject(AirfreightApi)
    .dispatch('flight/1')
    .subscribe((result) => expect(result.packages_in_transit).toBe(7));
  const request = TestBed.inject(HttpTestingController).expectOne(
    '/api/v1/mawbs/flight%2F1/dispatch',
  );
  expect(request.request.method).toBe('POST');
  expect(request.request.body).toEqual({});
  request.flush({ mawb: { status: 'closed' }, packages_in_transit: 7 });
});
it('descarga el manifiesto CSV proporcionado por el backend', () => {
  TestBed.inject(AirfreightApi).manifestCsv('cons/1').subscribe();
  const request = TestBed.inject(HttpTestingController).expectOne(
    '/api/v1/consolidations/cons%2F1/manifest?format=csv',
  );
  expect(request.request.responseType).toBe('blob');
  request.flush(new Blob(['hawb,packages'], { type: 'text/csv' }));
});
