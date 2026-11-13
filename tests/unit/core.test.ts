import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountToCents, formatUsd } from '../../src/app/shared/amount.ts';
import { canManage, isStaff, safeReturnUrl, isApiRequest } from '../../src/app/core/access.ts';
import { validateAppConfig } from '../../src/app/core/app-config.ts';
import { problemMessage } from '../../src/app/core/api-problem.ts';

test('convierte importes a centavos sin redondeo binario', () => {
  for (const [input, expected] of [
    ['129,90', 12990],
    ['0.29', 29],
    ['10', 1000],
    [' 0.01 ', 1],
  ] as const) {
    assert.equal(parseAmountToCents(input), expected);
  }
});
test('rechaza decimales excesivos, notación científica, negativos e importes inseguros', () => {
  for (const input of ['', '1.234', '1,234.56', '1e3', '-1', 'Infinity', '90071992547409.92']) {
    assert.equal(parseAmountToCents(input), null, input);
  }
  assert.match(formatUsd(12990), /129[.,]90/);
});
test('separa roles de personal y de gestión', () => {
  assert.equal(isStaff(['seller']), true);
  assert.equal(canManage(['seller']), false);
  assert.equal(canManage(['supervisor']), true);
  assert.equal(canManage(['admin']), true);
  assert.equal(isStaff(['customer', 'driver']), false);
});
test('solo permite retornar a las áreas protegidas de personal y clientes', () => {
  assert.equal(
    safeReturnUrl('/internal/packages?customer_id=123'),
    '/internal/packages?customer_id=123',
  );
  assert.equal(safeReturnUrl('/portal'), '/portal');
  assert.equal(safeReturnUrl('/portal?step=registration'), '/portal?step=registration');
  for (const input of [
    'https://evil.test',
    '//evil.test',
    '/internality',
    '/internal/\\evil',
    '/portal-evil',
    '/portal/%2f%2fevil.test',
    '/internal/%2F%2Fevil',
  ]) {
    assert.equal(safeReturnUrl(input), '/internal/overview');
  }
});
test('no filtra Bearer a otros orígenes ni prefijos parecidos', () => {
  const origin = 'http://localhost:3000';
  assert.equal(isApiRequest('/api/v1/me', '/api/v1', origin), true);
  assert.equal(isApiRequest('/api/v1', '/api/v1', origin), true);
  assert.equal(isApiRequest('/api/v10/me', '/api/v1', origin), false);
  assert.equal(isApiRequest('https://storage.test/api/v1/me', '/api/v1', origin), false);
});
test('valida configuración pública antes de arrancar', () => {
  assert.throws(() => validateAppConfig({}), /configuración/i);
  assert.throws(() => validateAppConfig({ apiBaseUrl: 'javascript:evil' }), /configuración/i);
  assert.deepEqual(
    validateAppConfig({
      apiBaseUrl: '/api/v1',
      oidcUrl: 'http://localhost:8081',
      oidcRealm: 'dm48',
      oidcClientId: 'dm48-web',
    }),
    {
      apiBaseUrl: '/api/v1',
      oidcUrl: 'http://localhost:8081',
      oidcRealm: 'dm48',
      oidcClientId: 'dm48-web',
    },
  );
});
test('normaliza errores y conserva el identificador de soporte', () => {
  assert.match(
    problemMessage({ status: 422, detail: 'Documento inválido', request_id: 'req-1' }),
    /Documento inválido/,
  );
  assert.match(
    problemMessage({ status: 422, detail: 'Documento inválido', request_id: 'req-1' }),
    /req-1/,
  );
  assert.match(problemMessage({ status: 0 }), /conexión/i);
  assert.match(problemMessage({ status: 403 }), /permiso/i);
});
