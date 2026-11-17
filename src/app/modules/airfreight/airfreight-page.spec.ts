import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { AirfreightApi } from './airfreight-api';
import { AirfreightPage } from './airfreight-page';
import type { Mawb, DispatchResult } from './airfreight.model';
const mawb: Mawb = {
  id: '11111111-1111-4111-8111-111111111111',
  number: '001-12345675',
  flight_number: 'LA2471',
  origin: 'MIA',
  destination: 'LIM',
  departure_at: '2026-11-17T23:30:00-05:00',
  status: 'open',
  consolidation_ids: ['22222222-2222-4222-8222-222222222222'],
};
function setup() {
  const api = {
    dispatch: vi.fn(() =>
      of<DispatchResult>({ mawb: { ...mawb, status: 'closed' }, packages_in_transit: 7 }),
    ),
    get: vi.fn(() => of(mawb)),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { manager: () => true } },
      { provide: AirfreightApi, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(AirfreightPage);
  fixture.detectChanges();
  const dialog = fixture.nativeElement.querySelector('[aria-labelledby="mawb-dispatch-title"]');
  Object.assign(dialog, { showModal: vi.fn(), close: vi.fn() });
  const page = fixture.componentInstance;
  page.mawb.set(mawb);
  return { page, api, dialog };
}
afterEach(() => TestBed.resetTestingModule());
it('requiere confirmación explícita antes de registrar la salida', () => {
  const { page, api } = setup();
  page.dispatch();
  expect(api.dispatch).not.toHaveBeenCalled();
  page.prepareDispatch();
  page.cancelDispatch();
  page.dispatch();
  expect(api.dispatch).not.toHaveBeenCalled();
});
it('bloquea doble envío y cierre mientras espera la salida', () => {
  const { page, api, dialog } = setup();
  const result = new Subject<DispatchResult>();
  api.dispatch.mockReturnValue(result);
  page.prepareDispatch();
  page.dispatch();
  page.dispatch();
  const event = new Event('cancel', { cancelable: true });
  page.cancelDispatch(event);
  expect(event.defaultPrevented).toBe(true);
  expect(dialog.close).not.toHaveBeenCalled();
  expect(api.dispatch).toHaveBeenCalledTimes(1);
  result.next({ mawb: { ...mawb, status: 'closed' }, packages_in_transit: 7 });
  expect(page.success()).toBe('Salida registrada. 7 paquetes en tránsito.');
  expect(page.canDispatch).toBe(false);
});
it('actualiza el estado al recibir conflicto y no anuncia una salida exitosa', () => {
  const { page, api } = setup();
  api.dispatch.mockReturnValue(throwError(() => ({ status: 409 })));
  api.get.mockReturnValue(of({ ...mawb, status: 'closed' }));
  page.prepareDispatch();
  page.dispatch();
  expect(page.mawb()?.status).toBe('closed');
  expect(page.success()).toBe('');
  expect(page.error()).not.toBe('');
  expect(page.canDispatch).toBe(false);
});
