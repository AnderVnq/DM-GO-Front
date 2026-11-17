import test from 'node:test';
import assert from 'node:assert/strict';
import { isDriver, safeReturnUrl } from '../../src/app/core/access.ts';
import {
  evidenceError,
  validPoint,
  validReceiver,
} from '../../src/app/modules/delivery/driver-rules.ts';
test('driver no equivale a supervisor y admite retorno local seguro', () => {
  assert.equal(isDriver(['driver']), true);
  assert.equal(isDriver(['admin']), false);
  assert.equal(safeReturnUrl('/driver?date=2026-11-17'), '/driver?date=2026-11-17');
  assert.equal(safeReturnUrl('/driver-evil'), '/internal/overview');
});
test('evidencias son fotos de hasta15MB o videos hasta200MB, nunca PDF', () => {
  assert.equal(evidenceError({ type: 'image/jpeg', size: 15 * 1024 * 1024 }), '');
  assert.equal(evidenceError({ type: 'video/mp4', size: 200 * 1024 * 1024 }), '');
  for (const f of [
    { type: 'application/pdf', size: 10 },
    { type: 'image/png', size: 15 * 1024 * 1024 + 1 },
    { type: 'video/quicktime', size: 200 * 1024 * 1024 + 1 },
    { type: 'image/jpeg', size: 0 },
  ])
    assert.notEqual(evidenceError(f), '');
});
test('ubicación exige coordenadas finitas en rango y receptor con documento válido', () => {
  assert.equal(validPoint({ latitude: -12.1, longitude: -77 }), true);
  assert.equal(validPoint(null), false);
  assert.equal(validPoint({ latitude: 91, longitude: 0 }), false);
  assert.equal(validPoint({ latitude: 0, longitude: NaN }), false);
  assert.equal(validReceiver(' Ana Pérez ', 'dni', '46027897'), true);
  assert.equal(validReceiver('Ana', 'dni', '123'), false);
  assert.equal(validReceiver(' ', 'dni', '46027897'), false);
});
