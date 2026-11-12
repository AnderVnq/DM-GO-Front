import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paymentIssue,
  canEditNote,
  canCancelNote,
} from '../../src/app/modules/billing/billing-rules.ts';

test('impide pagos nulos, negativos, inseguros o mayores al saldo', () => {
  for (const amount of [null, 0, -1, 10001, Number.MAX_SAFE_INTEGER + 1])
    assert.ok(paymentIssue(10000, amount));
  assert.equal(paymentIssue(10000, 10000), null);
  assert.equal(paymentIssue(10000, 29), null);
});
test('solo permite editar borradores', () => {
  assert.equal(canEditNote('draft'), true);
  assert.equal(canEditNote('paid'), false);
  assert.equal(canEditNote('pending_payment'), false);
});
test('no permite anular una nota pagada o con pagos aceptados', () => {
  assert.equal(canCancelNote('draft', 0), true);
  assert.equal(canCancelNote('pending_payment', 0), true);
  assert.equal(canCancelNote('pending_payment', 1), false);
  assert.equal(canCancelNote('paid', 10000), false);
});
