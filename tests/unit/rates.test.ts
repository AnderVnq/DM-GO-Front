import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountToCents } from '../../src/app/shared/amount.ts';
import { normalizeWeightKg } from '../../src/app/shared/weight.ts';
import {
  rateInput as buildRateInput,
  measurementInput as buildMeasurementInput,
} from '../../src/app/modules/shipments/rate-rules.ts';
const rateInput = (
  value: { price: string; min_lb: number; volumetric_divisor: number; valid_from: string },
  now: number,
) => buildRateInput({ ...value, price_per_lb_cents: parseAmountToCents(value.price) }, now);
const measurementInput = (value: {
  weight_kg: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
}) => buildMeasurementInput({ ...value, weight_kg: normalizeWeightKg(value.weight_kg) });
const now = Date.parse('2026-11-18T15:00:00Z');
test('precio convierte centavos exactos y no envía fecha si se aplica al publicar', () => {
  assert.deepEqual(
    rateInput({ price: '12,34', min_lb: 1, volumetric_divisor: 166, valid_from: '' }, now),
    { price_per_lb_cents: 1234, min_lb: 1, volumetric_divisor: 166 },
  );
  for (const price of ['0', '-1', '1e2', '0.001', '900719925474099.99'])
    assert.equal(
      rateInput({ price, min_lb: 1, volumetric_divisor: 166, valid_from: '' }, now),
      null,
    );
});
test('fecha de inicio usa Perú y rechaza fechas imposibles o pasadas', () => {
  const base = { price: '5.50', min_lb: 1, volumetric_divisor: 166 };
  assert.equal(
    rateInput({ ...base, valid_from: '2026-11-19T09:30' }, now)?.valid_from,
    '2026-11-19T09:30:00-05:00',
  );
  assert.equal(rateInput({ ...base, valid_from: '2026-02-30T10:00' }, now), null);
  assert.equal(rateInput({ ...base, valid_from: '2026-11-17T09:30' }, now), null);
  assert.equal(rateInput({ ...base, min_lb: 1.5, valid_from: '' }, now), null);
});
test('medidas conservan decimales de kg y exigen milímetros enteros del contrato', () => {
  assert.deepEqual(
    measurementInput({ weight_kg: '1,250', length_mm: 100, width_mm: 200, height_mm: 300 }),
    { weight_kg: '1.250', length_mm: 100, width_mm: 200, height_mm: 300 },
  );
  assert.equal(
    measurementInput({ weight_kg: '0', length_mm: 100, width_mm: 200, height_mm: 300 }),
    null,
  );
  assert.equal(
    measurementInput({ weight_kg: '1', length_mm: 0, width_mm: 200, height_mm: 300 }),
    null,
  );
  assert.equal(
    measurementInput({ weight_kg: '1', length_mm: 100.5, width_mm: 200, height_mm: 300 }),
    null,
  );
  assert.equal(
    measurementInput({ weight_kg: '1', length_mm: 3001, width_mm: 200, height_mm: 300 }),
    null,
  );
});
