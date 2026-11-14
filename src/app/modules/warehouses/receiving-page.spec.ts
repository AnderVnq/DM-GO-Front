import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RuntimeConfig } from '../../core/runtime-config';
import { ReceivingPage } from './receiving-page';

it('envía kg como texto y vincula el error 422 al peso sin borrar la entrada', async () => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
    ],
  });
  const fixture = TestBed.createComponent(ReceivingPage);
  const http = TestBed.inject(HttpTestingController);
  http
    .expectOne((r) => r.url === '/api/v1/warehouses')
    .flush({ warehouses: [{ id: 'usa', code: 'USA-01', active: true, country: 'US' }] });
  const page = fixture.componentInstance;
  page.input = {
    ...page.input,
    warehouse_code: 'USA-01',
    description: 'Libros',
    weight_kg: '2,300',
    length_mm: 100,
    width_mm: 100,
    height_mm: 100,
  };
  page.photos.set([{ id: 'photo', original_name: 'photo.png', mime_type: 'image/png', size: 100 }]);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.nativeElement
    .querySelector('form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const request = http.expectOne('/api/v1/warehouse/receipts');
  expect(request.request.body.weight_kg).toBe('2.300');
  expect(request.request.body).not.toHaveProperty('weight_g');
  request.flush(
    { code: 'invalid_weight', errors: { weight_kg: 'Revisa el peso registrado.' } },
    { status: 422, statusText: 'Unprocessable Entity' },
  );
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector('[name=weight_kg]');
  expect(input.value).toBe('2,300');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(fixture.nativeElement.querySelector('#receipt-weight-error').textContent).toContain(
    'Revisa el peso registrado.',
  );
  page.input.weight_kg = '2.3001';
  expect(page.valid).toBe(false);
  http.verify();
});
