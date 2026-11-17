import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMawb,
  limaDeparture,
  flightReference,
} from '../../src/app/modules/airfreight/airfreight-rules.ts';
test('valida el dígito IATA de MAWB sin modificar referencias inválidas', () => {
  assert.equal(normalizeMawb('001 12345675'), '001-12345675');
  assert.equal(normalizeMawb('001-12345670'), null);
  assert.equal(normalizeMawb('001-1234567x'), null);
});
test('envía hora de Perú con zona explícita y rechaza fechas imposibles', () => {
  assert.equal(limaDeparture('2026-11-17T23:30'), '2026-11-17T23:30:00-05:00');
  assert.equal(
    new Date(limaDeparture('2026-11-17T23:30')!).toISOString(),
    '2026-11-18T04:30:00.000Z',
  );
  assert.equal(limaDeparture('2026-02-30T12:00'), null);
  assert.equal(limaDeparture('2026-11-17T24:30'), null);
});
test('solo admite UUID o enlaces locales del registro correspondiente', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(
    flightReference(`/internal/airfreight?mawb_id=${id}`, 'mawb', 'https://dm.test'),
    id,
  );
  assert.equal(
    flightReference(
      `https://evil.test/internal/airfreight?mawb_id=${id}`,
      'mawb',
      'https://dm.test',
    ),
    null,
  );
  assert.equal(
    flightReference(`/internal/customers?mawb_id=${id}`, 'mawb', 'https://dm.test'),
    null,
  );
});
