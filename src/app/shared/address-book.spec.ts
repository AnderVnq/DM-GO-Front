import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RuntimeConfig } from '../core/runtime-config';
import { AddressBook } from './address-book';
import type { NgForm } from '@angular/forms';
const address = {
  id: 'a1',
  ubigeo: '150131',
  line: 'Av. Javier Prado 123',
  reference: 'Puerta',
  primary: true,
  latitude: -12.09,
  longitude: -77.03,
};
function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
    ],
  });
  const fixture = TestBed.createComponent(AddressBook);
  fixture.componentRef.setInput('addresses', [address]);
  fixture.detectChanges();
  const page = fixture.componentInstance;
  const dialog = page.dialog().nativeElement;
  dialog.showModal = vi.fn();
  dialog.close = vi.fn();
  return { page, dialog, http: TestBed.inject(HttpTestingController), fixture };
}
afterEach(() => TestBed.resetTestingModule());
it('bloquea cambios inexistentes y envía clear_point sin coordenadas al quitar el punto', () => {
  const { page, http, dialog } = setup();
  page.open(address);
  page.save({ invalid: false } as NgForm);
  http.expectNone('/api/v1/portal/addresses/a1');
  page.clearPoint();
  page.save({ invalid: false } as NgForm);
  const request = http.expectOne('/api/v1/portal/addresses/a1');
  expect(request.request.method).toBe('PATCH');
  expect(request.request.body.clear_point).toBe(true);
  expect(request.request.body).not.toHaveProperty('latitude');
  page.cancel();
  expect(dialog.close).not.toHaveBeenCalled();
  page.save({ invalid: false } as NgForm);
  http.expectNone('/api/v1/portal/addresses/a1');
  request.flush({ ...address, latitude: null, longitude: null });
  expect(dialog.close).toHaveBeenCalled();
  http.verify();
});
it('preserva el borrador si falla el servidor y separa el endpoint del personal', () => {
  const { page, http, fixture } = setup();
  fixture.componentRef.setInput('customerId', 'customer-1');
  page.open(address);
  page.draft.reference = 'Piso 2';
  page.save({ invalid: false } as NgForm);
  http
    .expectOne('/api/v1/customers/customer-1/addresses/a1')
    .flush({ detail: 'Dirección inválida' }, { status: 422, statusText: 'Invalid' });
  expect(page.draft.reference).toBe('Piso 2');
  expect(page.error()).toContain('Dirección inválida');
  expect(page.busy()).toBe(false);
  http.verify();
});
