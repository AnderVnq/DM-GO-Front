import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validPieces,
  normalizeScanCode,
  validScanCode,
  receptionReference,
} from '../../src/app/modules/receptions/reception-rules.ts';
test('solo una corrección permite cero piezas y nunca se aceptan fracciones', () => {
  assert.equal(validPieces(0, false), false);
  assert.equal(validPieces(0, true), true);
  assert.equal(validPieces(999, false), true);
  for (const pieces of [-1, 1.5, 1000, NaN]) assert.equal(validPieces(pieces, true), false);
});
test('normaliza el lector y respeta el límite en bytes del backend', () => {
  assert.equal(normalizeScanCode(' wr-42\r\n'), 'WR-42');
  assert.equal(validScanCode('  '), false);
  assert.equal(validScanCode('X'.repeat(40)), true);
  assert.equal(validScanCode('é'.repeat(21)), false);
});
test('acepta referencias locales de recepción sin abrir enlaces externos', () => {
  const id = '33333333-3333-4333-8333-333333333333';
  assert.equal(
    receptionReference(`/internal/receptions?reception_id=${id}`, 'reception', 'https://dm.test'),
    id,
  );
  assert.equal(
    receptionReference(
      `https://other.test/internal/receptions?reception_id=${id}`,
      'reception',
      'https://dm.test',
    ),
    null,
  );
  assert.equal(
    receptionReference(`/internal/airfreight?mawb_id=${id}`, 'reception', 'https://dm.test'),
    null,
  );
});
