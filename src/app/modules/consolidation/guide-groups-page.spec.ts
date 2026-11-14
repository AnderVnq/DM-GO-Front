import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { GuideGroupsPage } from './guide-groups-page';
import { ConsolidationApi } from './consolidation-api';
import type { GuideBoard, GuideCard } from './consolidation.model';

const card: GuideCard = {
  id: 'p1',
  customer_id: 'c1',
  locker_code: 'PE00001',
  carrier_tracking: 'ABC123',
  store: 'UPS',
  description: 'Libro',
  unit_value_cents: 200,
  quantity: 2,
  declared_value_cents: 400,
};
const board: GuideBoard = {
  consolidation_id: 'con1',
  code: 'C001',
  status: 'open',
  groups: [{ id: 'g1', position: 1, customer_id: 'c1', packages: [card], created_at: '' }],
  ungrouped: [{ ...card, id: 'p2' }],
};
function setup(overrides: object = {}, initial = board) {
  const api = {
    guideGroups: vi.fn(() => of(initial)),
    createGuideGroup: vi.fn(() => of(board)),
    updateGuideGroup: vi.fn(() => of(board)),
    deleteGuideGroup: vi.fn(() => of(undefined)),
    orderGuideGroups: vi.fn(() => of(board)),
    ...overrides,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: ConsolidationApi, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'con1' }) } },
      },
    ],
  });
  return { page: TestBed.createComponent(GuideGroupsPage).componentInstance, api };
}
it('rechaza grupos que mezclen cliente o consignatario sin enviar la mutación', () => {
  const { page, api } = setup();
  page.board.set({ ...board, ungrouped: [{ ...card, id: 'p2', customer_id: 'other' }] });
  page.move('p2', 'g1');
  expect(api.updateGuideGroup).not.toHaveBeenCalled();
  expect(page.error()).toContain('cliente y consignatario');
  page.board.set({ ...board, ungrouped: [{ ...card, id: 'p2', consignee_id: 'different' }] });
  page.move('p2', 'g1');
  expect(api.updateGuideGroup).not.toHaveBeenCalled();
});
it('cerrado impide crear, mover, quitar y ordenar', () => {
  const { page, api } = setup({}, { ...board, status: 'closed' });
  page.addGroup();
  page.move('p2', 'g1');
  page.remove('g1', 'p1');
  page.reorder('g1', 1);
  page.deleteGroup('g1');
  expect(api.createGuideGroup).not.toHaveBeenCalled();
  expect(api.updateGuideGroup).not.toHaveBeenCalled();
  expect(api.orderGuideGroups).not.toHaveBeenCalled();
  expect(api.deleteGuideGroup).not.toHaveBeenCalled();
});
it('quitar el último paquete elimina el grupo y vuelve a consultar el tablero', () => {
  const { page, api } = setup();
  page.remove('g1', 'p1');
  expect(api.deleteGuideGroup).toHaveBeenCalledWith('g1');
  expect(api.guideGroups).toHaveBeenCalledTimes(2);
});
it('no cambia el tablero ante fallo y bloquea solicitudes simultáneas', () => {
  const pending = new Subject<GuideBoard>();
  const { page, api } = setup({ updateGuideGroup: vi.fn(() => pending) });
  page.move('p2', 'g1');
  page.move('p2', 'g1');
  expect(api.updateGuideGroup).toHaveBeenCalledTimes(1);
  pending.error({ status: 409, error: { code: 'guide_group_package' } });
  expect(page.busy()).toBe(false);
  expect(page.error()).toBeTruthy();
});
it('un borrador vacío se guarda al recibir su primer paquete', () => {
  const { page, api } = setup();
  page.addGroup();
  page.move('p2', page.drafts()[0]);
  expect(api.createGuideGroup).toHaveBeenCalledWith('con1', ['p2']);
  expect(page.drafts()).toEqual([]);
});
