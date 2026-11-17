import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canRelease,
  reportFileError,
  validManifest,
  customsMoney,
} from '../../src/app/modules/customs/customs-rules.ts';
test('exige constancia real cuando hay tributos y nunca libera guías ya liberadas', () => {
  assert.equal(canRelease({ status: 'pending_tax', tax_cents: 100, proof_document_id: '' }), false);
  assert.equal(
    canRelease({ status: 'proof_sent', tax_cents: 100, proof_document_id: 'doc' }),
    true,
  );
  assert.equal(canRelease({ status: 'inspection', tax_cents: 0, proof_document_id: '' }), true);
  assert.equal(canRelease({ status: 'released', tax_cents: 0, proof_document_id: '' }), false);
  assert.equal(canRelease({ status: 'unknown_guide', tax_cents: 0, proof_document_id: '' }), false);
});
test('reporte CSV o XLSX no vacío hasta 5 MB, manifiesto limitado en bytes', () => {
  assert.equal(reportFileError({ name: 'agente.csv', size: 5 * 1024 * 1024 }), '');
  assert.notEqual(reportFileError({ name: 'agente.xls', size: 100 }), '');
  assert.notEqual(reportFileError({ name: 'agente.xlsx', size: 0 }), '');
  assert.notEqual(reportFileError({ name: 'agente.csv', size: 5 * 1024 * 1024 + 1 }), '');
  assert.equal(validManifest(' A-42 '), true);
  assert.equal(validManifest(''), false);
  assert.equal(validManifest('á'.repeat(26)), false);
});
test('presenta PEN y USD sin convertirlos ni aceptar importes inseguros', () => {
  assert.match(customsMoney(1234, 'PEN'), /PEN.*12.34/);
  assert.match(customsMoney(1234, 'USD'), /USD.*12.34/);
  assert.equal(customsMoney(Number.MAX_SAFE_INTEGER + 1, 'USD'), '—');
});
