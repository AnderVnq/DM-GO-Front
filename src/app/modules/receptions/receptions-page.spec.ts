import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { WarehousesApi } from '../warehouses';
import { ReceptionsApi } from './receptions-api';
import { ReceptionsPage } from './receptions-page';
import type { Reception, ScanResult } from './reception.model';
const session: Reception = {
  id: '33333333-3333-4333-8333-333333333333',
  mawb_id: '11111111-1111-4111-8111-111111111111',
  mawb_number: '001-12345675',
  warehouse_code: 'LIM-01',
  status: 'open',
  opened_at: '2026-11-17T15:00:00Z',
  closed_at: null,
  scans: [],
  result: null,
};
function setup() {
  const api = {
    get: vi.fn(() => of<Reception>(session)),
    scan: vi.fn(() =>
      of<ScanResult>({ code: 'H-42', pieces: 1, in_mawb: true, known_package: true }),
    ),
    close: vi.fn(() => of<Reception>({ ...session, status: 'closed' })),
    open: vi.fn(() => of<Reception>(session)),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { manager: () => true } },
      { provide: WarehousesApi, useValue: { list: () => of([]) } },
      { provide: ReceptionsApi, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(ReceptionsPage);
  fixture.detectChanges();
  fixture.nativeElement
    .querySelectorAll('dialog')
    .forEach((dialog: HTMLDialogElement) =>
      Object.assign(dialog, { showModal: vi.fn(), close: vi.fn() }),
    );
  const page = fixture.componentInstance;
  page.session.set(session);
  page.scanForm.setValue({ code: ' H-42 ', pieces: 1, note: '' });
  return { page, api };
}
afterEach(() => TestBed.resetTestingModule());
it('no reenvía al fallar la lectura posterior y bloquea hasta actualizar', () => {
  const { page, api } = setup();
  api.get.mockReturnValue(throwError(() => ({ status: 503 })));
  page.scan();
  page.scan();
  expect(api.scan).toHaveBeenCalledTimes(1);
  expect(page.stale()).toBe(true);
  expect(page.canOperate).toBe(false);
  api.get.mockReturnValue(of(session));
  page.reload();
  expect(page.canOperate).toBe(true);
  expect(page.scanForm.controls.code.value).toBe('');
});
for (const status of [0, 200, 500])
  it(`requiere revisar el historial ante resultado ambiguo ${status}`, () => {
    const { page, api } = setup();
    api.scan.mockReturnValue(throwError(() => ({ status })));
    page.scan();
    expect(page.uncertainScan()).toBe(true);
    expect(page.canOperate).toBe(false);
    page.scan();
    expect(api.scan).toHaveBeenCalledTimes(1);
    page.acknowledgeScans();
    expect(page.canOperate).toBe(true);
    expect(page.scanForm.controls.code.value).toBe('');
  });
it('corrige solo cambios reales y permite fijar cero sin sumar', () => {
  const { page, api } = setup();
  const scan = { code: 'H-42', pieces: 2, note: 'Control', scanned_at: session.opened_at };
  page.openCorrection(scan);
  expect(page.canCorrect).toBe(false);
  page.correction.controls.note.setValue(' Control ');
  expect(page.canCorrect).toBe(false);
  page.correction.controls.pieces.setValue(0);
  expect(page.canCorrect).toBe(true);
  page.saveCorrection();
  expect(api.scan).toHaveBeenCalledWith(session.id, {
    code: 'H-42',
    pieces: 0,
    note: 'Control',
    replace: true,
  });
});
it('exige confirmación de cierre y bloquea envíos duplicados', () => {
  const { page, api } = setup();
  page.closeReception();
  expect(api.close).not.toHaveBeenCalled();
  const pending = new Subject<Reception>();
  api.close.mockReturnValue(pending);
  page.prepareClose();
  page.closeReception();
  page.closeReception();
  page.cancelClose();
  expect(page.confirming()).toBe(true);
  expect(api.close).toHaveBeenCalledTimes(1);
  pending.next({ ...session, status: 'closed' });
  expect(page.confirming()).toBe(false);
  expect(page.canOperate).toBe(false);
});
it('no permite reabrir una MAWB cuyo resultado de apertura es incierto', () => {
  const { page, api } = setup();
  page.warehouses.set([{ code: 'LIM-01', country: 'PE', active: true } as never]);
  page.newForm.controls.warehouse_code.setValue('LIM-01');
  page.checkedMawb.set({
    id: session.mawb_id,
    number: session.mawb_number,
    status: 'closed',
    flight_number: 'LA2471',
    origin: 'MIA',
    destination: 'LIM',
  });
  api.open.mockReturnValue(throwError(() => ({ status: 500 })));
  page.create();
  page.create();
  expect(api.open).toHaveBeenCalledTimes(1);
  expect(page.canCreate).toBe(false);
  expect(page.createError()).toContain('puede haberse creado');
});
