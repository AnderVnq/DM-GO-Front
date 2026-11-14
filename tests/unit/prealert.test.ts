import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prealertTotal, normalizeTracking } from '../../src/app/modules/shipments/package-rules.ts';
import { isAdmin } from '../../src/app/core/access.ts';

test('calcula total seguro con cantidad entera entre 1 y 999', () => {
  assert.equal(prealertTotal(29, 3), 87);
  assert.equal(prealertTotal(1, 999), 999);
  for (const [cents, quantity] of [
    [0, 1],
    [1, 0],
    [1, 1000],
    [1, 1.2],
    [Number.MAX_SAFE_INTEGER, 2],
    [5_000_000, 3],
  ]) {
    assert.equal(prealertTotal(cents, quantity), null);
  }
});
test('normaliza tracking sin permitir espacios ni caracteres fuera del contrato', () => {
  assert.equal(normalizeTracking('ab-123'), 'AB-123');
  for (const tracking of ['short', ' ab1234', 'ABC_123', 'a'.repeat(41)]) {
    assert.equal(normalizeTracking(tracking), null);
  }
});
test('solo admin obtiene privilegios exclusivos aunque supervisor pueda gestionar operaciones', () => {
  assert.equal(isAdmin(['admin']), true);
  for (const role of ['supervisor', 'seller', 'customer', 'driver'])
    assert.equal(isAdmin([role]), false);
});
