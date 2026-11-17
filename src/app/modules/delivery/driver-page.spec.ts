import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { DocumentsApi } from '../../core/documents-api';
import { DriverApi } from './driver-api';
import { DriverPage } from './driver-page';
import type { DeliveryRoute, RouteStop } from './delivery-route.model';
const route: DeliveryRoute = {
  id: 'r1',
  code: 'RT-42',
  driver_id: 'd1',
  driver_name: 'Repartidor',
  date: '2026-11-17',
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
      packages: [{ package_id: 'p1', result: 'pending' }],
    },
  ],
};
async function setup() {
  const api = {
    register: () => of({ id: 'd1', name: 'Repartidor', email: 'driver@example.test' }),
    routes: vi.fn(() => of<DeliveryRoute[]>([route])),
    resolve: vi.fn(() =>
      of<RouteStop>({
        ...route.stops[0]!,
        status: 'delivered',
        packages: [{ package_id: 'p1', result: 'delivered' }],
      }),
    ),
  };
  const docs = {
    upload: vi.fn(() => of({ id: 'doc1' })),
    uploadDirect: vi.fn(() => of({ id: 'doc1' })),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { driver: () => true, user: () => ({ name: 'Repartidor' }) },
      },
      { provide: DriverApi, useValue: api },
      { provide: DocumentsApi, useValue: docs },
    ],
  });
  const fixture = TestBed.createComponent(DriverPage);
  fixture.detectChanges();
  fixture.nativeElement
    .querySelectorAll('dialog')
    .forEach((dialog: HTMLDialogElement) =>
      Object.assign(dialog, { showModal: vi.fn(), close: vi.fn() }),
    );
  return { page: fixture.componentInstance, api, docs };
}
afterEach(() => TestBed.resetTestingModule());
it('exige GPS, receptor y evidencia antes de entregar', async () => {
  const { page, api, docs } = await setup();
  page.openStop(route, route.stops[0]!, 'deliver');
  expect(page.canSubmit).toBe(false);
  page.resolution.patchValue({ receiver_name: 'Ana', doc_type: 'dni', doc_number: '46027897' });
  page.point.set({ latitude: -12.1, longitude: -77 });
  page.chooseFiles({
    target: { files: [new File(['photo'], 'foto.jpg', { type: 'image/jpeg' })], value: '' },
  } as unknown as Event);
  expect(page.canSubmit).toBe(true);
  await page.resolve();
  expect(docs.upload).not.toHaveBeenCalled();
  expect(docs.uploadDirect).toHaveBeenCalledTimes(1);
  expect(api.resolve).toHaveBeenCalledWith(
    's1',
    'deliver',
    expect.objectContaining({
      package_ids: ['p1'],
      evidence_document_ids: ['doc1'],
      receiver: { name: 'Ana', doc_type: 'dni', doc_number: '46027897' },
      latitude: -12.1,
      longitude: -77,
    }),
  );
});
it('conserva evidencia subida al reintentar un rechazo sin duplicar subidas', async () => {
  const { page, api, docs } = await setup();
  page.openStop(route, route.stops[0]!, 'fail');
  page.resolution.controls.reason.setValue('Ausente');
  page.chooseFiles({
    target: { files: [new File(['photo'], 'foto.jpg', { type: 'image/jpeg' })], value: '' },
  } as unknown as Event);
  api.resolve.mockReturnValue(throwError(() => ({ status: 422 })));
  await page.resolve();
  expect(docs.uploadDirect).toHaveBeenCalledTimes(1);
  expect(page.mode()).toBe('fail');
  api.resolve.mockReturnValue(of({ ...route.stops[0]!, status: 'failed' }));
  await page.resolve();
  expect(docs.uploadDirect).toHaveBeenCalledTimes(1);
});
it('actualiza selección tras conflicto y conserva el motivo', async () => {
  const { page, api } = await setup();
  page.openStop(route, route.stops[0]!, 'fail');
  page.resolution.controls.reason.setValue('Ausente');
  api.resolve.mockReturnValue(throwError(() => ({ status: 409 })));
  api.routes.mockReturnValue(
    of([
      {
        ...route,
        stops: [
          {
            ...route.stops[0]!,
            status: 'delivered',
            packages: [{ package_id: 'p1', result: 'delivered' }],
          },
        ],
      },
    ]),
  );
  await page.resolve();
  expect(page.selectedIds()).toEqual([]);
  expect(page.resolution.controls.reason.value).toBe('Ausente');
  expect(page.canSubmit).toBe(false);
});
