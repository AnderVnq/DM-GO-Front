import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { AgenciesApi } from './agencies-api';
import { AgenciesPage } from './agencies-page';
import type { TransitAgency, AgencyBranch } from './agency.model';
const agency: TransitAgency = {
  id: 'agency1',
  code: 'AG1',
  name: 'Agencia 1',
  dropoff_ubigeo: '150101',
  dropoff_address: 'Av. Lima 42',
  active: true,
  branches: [],
};
function setup(admin = true) {
  const api = {
    list: vi.fn(() => of<TransitAgency[]>([agency])),
    create: vi.fn(() => of<TransitAgency>({ ...agency, id: 'agency2', code: 'AG2' })),
    addBranch: vi.fn(() =>
      of<AgencyBranch>({
        id: 'b1',
        name: 'Destino',
        ubigeo: '010101',
        address: 'Calle 1',
        active: true,
      }),
    ),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { admin: () => admin } },
      { provide: AgenciesApi, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(AgenciesPage);
  fixture.detectChanges();
  fixture.nativeElement
    .querySelectorAll('dialog')
    .forEach((d: HTMLDialogElement) => Object.assign(d, { showModal: vi.fn(), close: vi.fn() }));
  const page = fixture.componentInstance;
  page.select(agency);
  return { page, api };
}
afterEach(() => TestBed.resetTestingModule());
it('personal no administrador solo consulta y no puede ejecutar altas', () => {
  const { page, api } = setup(false);
  page.startAgency();
  page.startBranch();
  page.save();
  expect(page.mode()).toBe(null);
  expect(api.create).not.toHaveBeenCalled();
  expect(api.addBranch).not.toHaveBeenCalled();
});
it('conflicto de código conserva borrador y bloquea reenvío idéntico', () => {
  const { page, api } = setup();
  api.create.mockReturnValue(throwError(() => ({ status: 409 })));
  page.startAgency();
  page.agencyForm.setValue({
    code: ' ag2 ',
    name: 'Agencia 2',
    dropoff_ubigeo: '150101',
    dropoff_address: 'Av. Lima 2',
  });
  page.save();
  page.save();
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(page.agencyForm.controls.name.value).toBe('Agencia 2');
  expect(page.canSave).toBe(false);
  page.agencyForm.controls.code.setValue('AG3');
  expect(page.canSave).toBe(true);
});
it('sucursal incierta no se reenvía y mantiene borrador para revisión', () => {
  const { page, api } = setup();
  api.addBranch.mockReturnValue(throwError(() => ({ status: 500 })));
  page.startBranch();
  page.branchForm.setValue({ name: 'Destino', ubigeo: '010101', address: 'Calle 1' });
  page.save();
  page.save();
  expect(api.addBranch).toHaveBeenCalledTimes(1);
  expect(page.canSave).toBe(false);
  expect(page.branchForm.controls.ubigeo.value).toBe('010101');
  expect(page.mode()).toBe('branch');
});
it('bloquea cancelación y doble envío mientras crea sucursal', () => {
  const { page, api } = setup();
  const pending = new Subject<AgencyBranch>();
  api.addBranch.mockReturnValue(pending);
  page.startBranch();
  page.branchForm.setValue({ name: 'Destino', ubigeo: '010101', address: 'Calle 1' });
  page.save();
  page.save();
  page.cancel();
  expect(page.mode()).toBe('branch');
  expect(api.addBranch).toHaveBeenCalledTimes(1);
  pending.next({ id: 'b1', name: 'Destino', ubigeo: '010101', address: 'Calle 1', active: true });
  expect(page.mode()).toBe(null);
});
