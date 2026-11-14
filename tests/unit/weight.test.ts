import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeWeightKg, formatMeasuredWeight } from '../../src/app/shared/weight.ts';

test('conserva precisión y ceros del texto y normaliza la coma', () => {
  for (const [input, expected] of [
    ['1,500', '1.500'],
    ['0.001', '0.001'],
    ['500', '500'],
    ['0.250', '0.250'],
  ]) {
    assert.equal(normalizeWeightKg(input), expected);
  }
});

test('rechaza pesos vacíos, fuera de rango y formatos ambiguos sin redondearlos', () => {
  for (const input of [
    '',
    '0',
    '0.000',
    '500.001',
    '-1',
    '1.0001',
    '1e2',
    '.5',
    '1.',
    '1,2.3',
    'NaN',
  ]) {
    assert.equal(normalizeWeightKg(input), null, input);
  }
});

test('prioriza el peso en kg recibido y usa gramos solo si no viene', () => {
  assert.equal(formatMeasuredWeight({ weight_kg: '2.300', weight_g: 9999 }), '2.300 kg');
  assert.equal(formatMeasuredWeight({ weight_g: 250 }), '0.25 kg');
  assert.equal(formatMeasuredWeight(undefined), '—');
});
