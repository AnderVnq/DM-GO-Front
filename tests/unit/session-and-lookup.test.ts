import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionExpiredError, requiresLogin } from '../../src/app/core/session-error.ts';
import { matchesCustomerLookup } from '../../src/app/modules/quotes/quote-rules.ts';

test('una renovación fallida requiere salir de la ruta interna', () => {
  assert.equal(requiresLogin(new SessionExpiredError()), true);
  assert.equal(requiresLogin({ status: 401 }), true);
  assert.equal(requiresLogin({ status: 403 }), false);
  assert.equal(requiresLogin(new Error('Fallo de conexión')), false);
});
test('ignora el cliente encontrado si el casillero cambió mientras esperaba', () => {
  assert.equal(matchesCustomerLookup('PE00042', 'PE00043'), false);
  assert.equal(matchesCustomerLookup('PE00042', ''), false);
  assert.equal(matchesCustomerLookup('PE00042', ' pe00042 '), true);
});
