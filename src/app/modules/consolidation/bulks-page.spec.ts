import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RuntimeConfig } from '../../core/runtime-config';
import { BulksPage } from './bulks-page';

it('cierra con kg de texto y devuelve la validación del servidor al campo', async () => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
    ],
  });
  const fixture = TestBed.createComponent(BulksPage);
  const http = TestBed.inject(HttpTestingController);
  http.expectOne((r) => r.url === '/api/v1/warehouses').flush({ warehouses: [] });
  const page = fixture.componentInstance;
  page.bulk.set({
    id: 'bulk',
    code: 'BLK-1',
    warehouse_code: 'USA-01',
    status: 'open',
    package_ids: ['package'],
    created_at: '',
  });
  page.closure = {
    seal: 'seal',
    weight_kg: '1,500',
    length_mm: 100,
    width_mm: 100,
    height_mm: 100,
  };
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.nativeElement.querySelector('dialog').close = vi.fn();
  page.close();
  const request = http.expectOne('/api/v1/bulks/bulk/close');
  expect(request.request.body).toEqual({
    seal: 'SEAL',
    weight_kg: '1.500',
    length_mm: 100,
    width_mm: 100,
    height_mm: 100,
  });
  request.flush(
    { errors: { weight_kg: 'Revisa el peso final.' } },
    { status: 422, statusText: 'Unprocessable Entity' },
  );
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('#bulk-weight-error').textContent).toContain(
    'Revisa el peso final.',
  );
  expect(fixture.nativeElement.querySelector('[name=weight_kg]').getAttribute('aria-invalid')).toBe(
    'true',
  );
  expect(page.closure.weight_kg).toBe('1,500');
  page.closure.weight_kg = '500.001';
  expect(page.canClose).toBe(false);
  http
    .expectOne((r) => r.url === '/api/v1/packages')
    .flush({ packages: [], total: 0, limit: 10, offset: 0 });
  http.verify();
});
