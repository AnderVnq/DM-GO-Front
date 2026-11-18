import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAgency,
  normalizeBranch,
  validAgency,
  validBranch,
} from '../../src/app/modules/delivery/agency-rules.ts';
test('normaliza código y direcciones sin quitar espacios interiores significativos', () => {
  assert.deepEqual(
    normalizeAgency({
      code: ' courier_1 ',
      name: ' Agencia  Uno ',
      dropoff_ubigeo: ' 150101 ',
      dropoff_address: ' Av. Lima 42 ',
    }),
    {
      code: 'COURIER_1',
      name: 'Agencia  Uno',
      dropoff_ubigeo: '150101',
      dropoff_address: 'Av. Lima 42',
    },
  );
  assert.deepEqual(
    normalizeBranch({ name: ' Centro ', ubigeo: ' 040101 ', address: ' Calle 42 ' }),
    { name: 'Centro', ubigeo: '040101', address: 'Calle 42' },
  );
});
test('alta de agencia valida código y counter con ubigeo exacto de seis dígitos', () => {
  const input = {
    code: 'COURIER',
    name: 'Agencia',
    dropoff_ubigeo: '150101',
    dropoff_address: 'Av. Lima',
  };
  assert.equal(validAgency(input), true);
  for (const code of ['A', 'A-B', 'A'.repeat(21)])
    assert.equal(validAgency({ ...input, code }), false);
  assert.equal(validAgency({ ...input, dropoff_ubigeo: '15010' }), false);
  assert.equal(validAgency({ ...input, name: ' ' }), false);
});
test('sucursal requiere nombre, dirección y ubigeo conservando ceros iniciales', () => {
  assert.equal(validBranch({ name: 'Destino', ubigeo: '010101', address: 'Calle 1' }), true);
  assert.equal(validBranch({ name: 'Destino', ubigeo: '10101', address: 'Calle 1' }), false);
  assert.equal(validBranch({ name: 'Destino', ubigeo: '010101', address: ' ' }), false);
});
