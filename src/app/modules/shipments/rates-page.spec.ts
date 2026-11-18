import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { RatesApi } from './rates-api';
import { RatesPage } from './rates-page';
import type { CourierRate, FreightQuote } from './rate.model';
const rate: CourierRate = {
  id: 'r1',
  price_per_lb_cents: 550,
  min_lb: 1,
  volumetric_divisor: 166,
  valid_from: '2026-11-01T00:00:00-05:00',
  valid_to: null,
};
const quote: FreightQuote = {
  rate_id: 'r1',
  real_lb: 3,
  volumetric_lb: 5,
  billable_lb: 5,
  billable_kg: '2.268',
  price_per_lb_cents: 550,
  freight_cents: 2750,
};
function setup(admin = true) {
  const api = {
    current: vi.fn(() => of<CourierRate>(rate)),
    list: vi.fn(() => of<CourierRate[]>([rate])),
    create: vi.fn(() => of<CourierRate>(rate)),
    quote: vi.fn(() => of<FreightQuote>(quote)),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { admin: () => admin } },
      { provide: RatesApi, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(RatesPage);
  fixture.detectChanges();
  const dialog = fixture.nativeElement.querySelector('dialog');
  Object.assign(dialog, { showModal: vi.fn(), close: vi.fn() });
  return { page: fixture.componentInstance, api };
}
afterEach(() => TestBed.resetTestingModule());
it('solo admin puede publicar y mantiene centavos y hora de Perú', () => {
  const { page, api } = setup();
  page.startPublish();
  page.rateForm.setValue({
    price: '12,34',
    min_lb: 2,
    volumetric_divisor: 166,
    valid_from: '2030-06-15T09:00',
  });
  page.publish();
  expect(api.create).toHaveBeenCalledWith({
    price_per_lb_cents: 1234,
    min_lb: 2,
    volumetric_divisor: 166,
    valid_from: '2030-06-15T09:00:00-05:00',
  });
});
it('personal sin rol admin solo consulta y simula', () => {
  const { page, api } = setup(false);
  page.startPublish();
  page.publish();
  expect(page.publishing()).toBe(false);
  expect(api.create).not.toHaveBeenCalled();
});
it('cambiar medidas cancela el resultado anterior sin mostrar un flete obsoleto', () => {
  const { page, api } = setup();
  const pending = new Subject<FreightQuote>();
  api.quote.mockReturnValue(pending);
  page.measurements.setValue({ weight_kg: '1,250', length_mm: 100, width_mm: 200, height_mm: 300 });
  page.calculate();
  expect(api.quote).toHaveBeenCalledWith({
    weight_kg: '1.250',
    length_mm: 100,
    width_mm: 200,
    height_mm: 300,
  });
  page.measurements.controls.length_mm.setValue(150);
  pending.next(quote);
  expect(page.calculation()).toBe(null);
  expect(page.calculating()).toBe(false);
});
it('resultado incierto no repite publicaciones y conserva borrador', () => {
  const { page, api } = setup();
  api.create.mockReturnValue(throwError(() => ({ status: 500 })));
  page.startPublish();
  page.rateForm.patchValue({ price: '5.50' });
  page.publish();
  page.publish();
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(page.publishing()).toBe(true);
  expect(page.uncertain()).toBe(true);
  expect(page.rateForm.controls.price.value).toBe('5.50');
});
it('sin tarifa vigente no elimina el historial y permite crear la primera versión', () => {
  const { page, api } = setup();
  api.current.mockReturnValue(throwError(() => ({ status: 404, error: { code: 'no_rate' } })));
  page.loadCurrent();
  expect(page.noCurrent()).toBe(true);
  expect(page.history()).toHaveLength(1);
  page.startPublish();
  page.rateForm.controls.price.setValue('5.50');
  expect(page.canPublish).toBe(true);
});
