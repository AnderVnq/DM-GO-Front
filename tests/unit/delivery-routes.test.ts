import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validRouteDate,
  routeDayLabel,
  canStartRoute,
  canCompleteRoute,
  validFailureSelection,
} from '../../src/app/modules/delivery/delivery-route-rules.ts';
test('valida fecha de calendario y muestra el mismo día sin desfase UTC', () => {
  assert.equal(validRouteDate('2028-02-29'), true);
  assert.equal(validRouteDate('2026-02-29'), false);
  assert.equal(validRouteDate('2026-13-01'), false);
  assert.equal(routeDayLabel('2026-11-17'), '17/11/2026');
});
test('inicio exige ruta planificada con paradas y cierre sin paquetes pendientes', () => {
  const stops = [{ packages: [{ package_id: 'p1', result: 'pending' }] }];
  assert.equal(canStartRoute({ status: 'planned', stops }), true);
  assert.equal(canStartRoute({ status: 'planned', stops: [] }), false);
  assert.equal(canStartRoute({ status: 'in_progress', stops }), false);
  assert.equal(canCompleteRoute({ status: 'in_progress', stops }), false);
  assert.equal(
    canCompleteRoute({
      status: 'in_progress',
      stops: [{ packages: [{ package_id: 'p1', result: 'failed' }] }],
    }),
    true,
  );
  assert.equal(canCompleteRoute({ status: 'completed', stops: [] }), false);
});
test('fallo exige motivo y selección no vacía sin paquetes ajenos o resueltos', () => {
  const packages = [
    { package_id: 'p1', result: 'pending' },
    { package_id: 'p2', result: 'delivered' },
  ];
  assert.equal(validFailureSelection(packages, ['p1'], ' Ausente '), true);
  for (const ids of [[], ['p2'], ['other'], ['p1', 'p1']])
    assert.equal(validFailureSelection(packages, ids, 'Ausente'), false);
  assert.equal(validFailureSelection(packages, ['p1'], ' '), false);
});
