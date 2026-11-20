import { provideHttpClient } from '@angular/common/http';
import { RuntimeConfig } from '../../core/runtime-config';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { WarehousesApi } from '../warehouses';
import { ShipmentsApi } from '../shipments';
import { DeliveryRoutesApi } from './delivery-routes-api';
import { DeliveryRoutesPage } from './delivery-routes-page';
import type { DeliveryRoute, RouteStop } from './delivery-route.model';
const route: DeliveryRoute = {
  id: '55555555-5555-4555-8555-555555555555',
  code: 'RT-42',
  date: '2026-11-17',
  driver_id: 'driver1',
  driver_name: 'Repartidor',
  warehouse_code: 'LIM-01',
  status: 'in_progress',
  stops: [
    {
      id: 's1',
      seq: 1,
      status: 'pending',
      kind: 'customer',
      recipient_name: 'Cliente',
      recipient_phone: '999999999',
      ubigeo: '150101',
      address: 'Av. Prueba 42',
      reference: '',
      packages: [
        { package_id: 'p1', result: 'pending' },
        { package_id: 'p2', result: 'delivered' },
      ],
    },
  ],
};
function setup() {
  const api = {
    list: vi.fn(() => of<DeliveryRoute[]>([route])),
    drivers: () => of([]),
    get: vi.fn(() => of<DeliveryRoute>(route)),
    start: vi.fn(() => of<DeliveryRoute>({ ...route, status: 'in_progress' })),
    complete: vi.fn(() => of<DeliveryRoute>({ ...route, status: 'completed' })),
    fail: vi.fn(() =>
      of<RouteStop>({
        ...route.stops[0]!,
        status: 'partial',
        packages: [
          { package_id: 'p1', result: 'failed' },
          { package_id: 'p2', result: 'delivered' },
        ],
      }),
    ),
  };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
      provideRouter([]),
      { provide: AuthService, useValue: { manager: () => true } },
      { provide: WarehousesApi, useValue: { list: () => of([]) } },
      { provide: ShipmentsApi, useValue: {} },
      { provide: DeliveryRoutesApi, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(DeliveryRoutesPage);
  fixture.detectChanges();
  fixture.nativeElement
    .querySelectorAll('dialog')
    .forEach((dialog: HTMLDialogElement) =>
      Object.assign(dialog, { showModal: vi.fn(), close: vi.fn() }),
    );
  const page = fixture.componentInstance;
  page.selected.set(route);
  return { page, api };
}
afterEach(() => TestBed.resetTestingModule());
it('envía solo paquetes pendientes explícitos y exige motivo', () => {
  const { page, api } = setup();
  page.prepareFail(route.stops[0]!);
  expect(page.failureIds()).toEqual(['p1']);
  page.fail();
  expect(api.fail).not.toHaveBeenCalled();
  page.failure.controls.reason.setValue(' Ausente ');
  page.fail();
  expect(api.fail).toHaveBeenCalledWith('s1', ['p1'], 'Ausente');
});
it('bloquea escrituras si falla la lectura canónica tras registrar no entregados', () => {
  const { page, api } = setup();
  api.get.mockReturnValue(throwError(() => ({ status: 503 })));
  page.prepareFail(route.stops[0]!);
  page.failure.controls.reason.setValue('Ausente');
  page.fail();
  expect(page.stale()).toBe(true);
  expect(page.canOperate).toBe(false);
  expect(api.fail).toHaveBeenCalledTimes(1);
});
it('inicio exige confirmación y bloqueo ante doble envío', () => {
  const { page, api } = setup();
  page.selected.set({ ...route, status: 'planned' });
  page.confirmAction();
  expect(api.start).not.toHaveBeenCalled();
  const pending = new Subject<DeliveryRoute>();
  api.start.mockReturnValue(pending);
  page.prepareAction('start');
  page.confirmAction();
  page.confirmAction();
  page.cancelAction();
  expect(api.start).toHaveBeenCalledTimes(1);
  expect(page.action()).toBe('start');
  pending.next(route);
  expect(page.action()).toBe(null);
});
it('no ofrece cerrar mientras quede un paquete pendiente', () => {
  const { page, api } = setup();
  page.prepareAction('complete');
  expect(page.action()).toBe(null);
  page.confirmAction();
  expect(api.complete).not.toHaveBeenCalled();
});
it('actualiza la selección del modal si otro operador resuelve el paquete', () => {
  const { page, api } = setup();
  api.fail.mockReturnValue(throwError(() => ({ status: 409 })));
  api.get.mockReturnValue(
    of({
      ...route,
      stops: route.stops.map((stop) => ({
        ...stop,
        status: 'delivered' as const,
        packages: stop.packages.map((pkg) => ({ ...pkg, result: 'delivered' as const })),
      })),
    }),
  );
  page.prepareFail(route.stops[0]!);
  page.failure.controls.reason.setValue('Destinatario ausente');
  page.fail();
  expect(page.failureStop()?.packages[0]?.result).toBe('delivered');
  expect(page.failureIds()).toEqual([]);
  expect(page.failure.controls.reason.value).toBe('Destinatario ausente');
  expect(page.canFail).toBe(false);
});
