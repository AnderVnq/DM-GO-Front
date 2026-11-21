import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DeliveryRoutesApi } from './delivery-routes-api';
import { RuntimeConfig } from '../../core/runtime-config';
import { validRouteRange } from './delivery-route-rules';
afterEach(() => TestBed.resetTestingModule());
it.each([
  ['2026-11-21', { date: '2026-11-21' }],
  [
    { from: '2026-11-01', to: '2026-11-30' },
    { from: '2026-11-01', to: '2026-11-30' },
  ],
  [{ from: '2026-11-15' }, { from: '2026-11-15' }],
  [{ to: '2026-11-21' }, { to: '2026-11-21' }],
] as const)('envía el período sin mezclar date con from/to: %j', (query, expected) => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(DeliveryRoutesApi).list(query).subscribe();
  const request = http.expectOne((r) => r.url === '/api/v1/routes');
  expect(
    Object.fromEntries(
      request.request.params.keys().map((k) => [k, request.request.params.get(k)]),
    ),
  ).toEqual(expected);
  request.flush({ routes: [] });
  http.verify();
});
it('valida días reales, rangos abiertos y ambos extremos inclusivos', () => {
  expect(validRouteRange('2026-11-21', '2026-11-21')).toBe(true);
  expect(validRouteRange('2026-11-15', '')).toBe(true);
  expect(validRouteRange('', '2026-11-21')).toBe(true);
  expect(validRouteRange('2026-11-22', '2026-11-21')).toBe(false);
  expect(validRouteRange('2026-02-30', '')).toBe(false);
  expect(validRouteRange('', '')).toBe(false);
});
