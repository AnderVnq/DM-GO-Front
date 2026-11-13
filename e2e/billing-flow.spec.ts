import { test, expect, type Page } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';

async function openNotes(page: Page) {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  await navigate(page, 'Notas de salida', 'dispatch-notes');
}

const pendingNote = {
  status: 'pending_payment',
  payments: [
    {
      id: 'pending-payment-test',
      method: 'transfer',
      origin: 'PERU',
      reference: 'VOUCHER-42',
      amount_cents: 10000,
      paid_at: '2026-11-12T12:00:00Z',
      status: 'pending',
    },
  ],
};

test('crea un borrador con las guías del cliente seleccionado', async ({ page }) => {
  const fixture = await mockPanel(page);
  await openNotes(page);
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Casillero del cliente').fill('PE00042');
  await dialog.getByRole('button', { name: 'Buscar', exact: true }).click();
  await dialog.getByRole('checkbox', { name: /Audífonos de prueba/ }).check();
  await dialog.getByRole('button', { name: 'Crear borrador', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.inspector')).toContainText('NS-TEST-43');
  await expect(page.locator('.inspector')).toContainText('HAWB-TEST-42');
  expect(
    fixture.requests.filter((r) => r.path === '/dispatch-notes' && r.method === 'POST'),
  ).toEqual([
    {
      path: '/dispatch-notes',
      method: 'POST',
      body: {
        customer_id: fixture.customer.id,
        package_ids: ['package-test'],
        method: 'pickup',
        address_id: '',
        agency_id: '',
        branch_id: '',
      },
    },
  ]);
});

test('cambiar el casillero invalida el cliente y los paquetes elegidos', async ({ page }) => {
  const fixture = await mockPanel(page);
  await openNotes(page);
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Casillero del cliente').fill('PE00042');
  await dialog.getByRole('button', { name: 'Buscar', exact: true }).click();
  await dialog.getByRole('checkbox', { name: /Audífonos de prueba/ }).check();
  await dialog.getByLabel('Casillero del cliente').fill('PE00099');
  await expect(dialog.getByRole('button', { name: 'Crear borrador', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('heading', { name: 'Cliente de prueba', exact: true })).toHaveCount(
    0,
  );
  expect(
    fixture.requests.filter((r) => r.path === '/dispatch-notes' && r.method === 'POST'),
  ).toHaveLength(0);
});

for (const accept of [true, false]) {
  test(`${accept ? 'acepta' : 'rechaza con motivo'} un pago pendiente de revisión`, async ({
    page,
  }) => {
    const fixture = await mockPanel(page, 'supervisor', { note: pendingNote });
    await openNotes(page);
    await page.getByRole('button', { name: accept ? 'Aceptar' : 'Rechazar', exact: true }).click();
    const dialog = page.getByRole('dialog');
    if (!accept) {
      await expect(dialog.getByRole('button', { name: 'Confirmar', exact: true })).toBeDisabled();
      await dialog.getByLabel('Motivo').fill('El importe del comprobante no coincide.');
    }
    await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.inspector')).toContainText(accept ? 'Aceptado' : 'Rechazado');
    await expect(page.getByRole('button', { name: 'Aceptar', exact: true })).toHaveCount(0);
    expect(fixture.requests.filter((r) => r.path.endsWith('/review'))).toEqual([
      {
        path: '/dispatch-notes/note-test/payments/pending-payment-test/review',
        method: 'POST',
        body: { accept, reason: accept ? '' : 'El importe del comprobante no coincide.' },
      },
    ]);
  });
}

test('un pago ya revisado conserva el error sin anunciar aprobación', async ({ page }) => {
  await mockPanel(page, 'supervisor', { note: pendingNote });
  await page.route('**/api/v1/dispatch-notes/note-test/payments/*/review', (route) =>
    route.fulfill({ status: 409, json: { detail: 'El pago ya fue revisado' } }),
  );
  await openNotes(page);
  await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('El pago ya fue revisado');
  await expect(page.getByRole('status')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.locator('.inspector').getByText('Pendiente', { exact: true })).toBeVisible();
});

test('sube el comprobante antes de registrar el pago y conserva su identificador', async ({
  page,
}) => {
  const fixture = await mockPanel(page, 'supervisor', { note: { status: 'pending_payment' } });
  await openNotes(page);
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Importe en USD').fill('100.00');
  await dialog.getByLabel('Referencia', { exact: true }).fill('VOUCHER-42');
  await dialog.getByLabel('Evidencia del pago (opcional)').setInputFiles({
    name: 'voucher.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-test'),
  });
  await dialog.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const writes = fixture.requests.filter((r) => r.method === 'POST');
  expect(writes.map((r) => r.path)).toEqual(['/documents', '/dispatch-notes/note-test/payments']);
  expect(writes[1]?.body).toEqual({
    method: 'transfer',
    origin: 'PERU',
    reference: 'VOUCHER-42',
    amount_cents: 10000,
    evidence_document_id: 'document-test',
  });
});

test('un comprobante inválido no se descarta silenciosamente al registrar el pago', async ({
  page,
}) => {
  const fixture = await mockPanel(page, 'supervisor', { note: { status: 'pending_payment' } });
  await openNotes(page);
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Importe en USD').fill('100.00');
  await dialog.getByLabel('Evidencia del pago (opcional)').setInputFiles({
    name: 'voucher.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('no es un comprobante válido'),
  });
  await expect(dialog.getByRole('alert')).toContainText('Adjunta un archivo PDF');
  await dialog.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Adjunta un archivo PDF');
  expect(fixture.requests.filter((r) => r.path.endsWith('/payments'))).toHaveLength(0);
});

test('un error al subir evidencia conserva el importe y no genera un pago', async ({ page }) => {
  const fixture = await mockPanel(page, 'supervisor', { note: { status: 'pending_payment' } });
  await page.route('**/api/v1/documents', (route) =>
    route.fulfill({ status: 503, json: { detail: 'No se pudo guardar el documento.' } }),
  );
  await openNotes(page);
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Importe en USD').fill('100.00');
  await dialog.getByLabel('Evidencia del pago (opcional)').setInputFiles({
    name: 'voucher.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-test'),
  });
  await dialog.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo guardar el documento.');
  await expect(dialog.getByLabel('Importe en USD')).toHaveValue('100.00');
  await expect(dialog.getByRole('button', { name: 'Registrar pago', exact: true })).toBeEnabled();
  expect(fixture.requests.filter((r) => r.path.endsWith('/payments'))).toHaveLength(0);
});

test('una búsqueda anterior no repone el cliente después de cambiar el casillero', async ({
  page,
}) => {
  await mockPanel(page);
  const lookup = Promise.withResolvers<void>();
  const received = Promise.withResolvers<void>();
  await page.route('**/api/v1/customers?**', async (route) => {
    received.resolve();
    await lookup.promise;
    await route.fallback();
  });
  await openNotes(page);
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Casillero del cliente').fill('PE00042');
  await dialog.getByRole('button', { name: 'Buscar', exact: true }).click();
  await received.promise;
  await dialog.getByLabel('Casillero del cliente').fill('PE00099');
  lookup.resolve();
  await expect(dialog.getByRole('button', { name: 'Buscar', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('heading', { name: 'Cliente de prueba', exact: true })).toHaveCount(
    0,
  );
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Crear borrador', exact: true })).toBeDisabled();
});

test('al reabrir el pago se retira el archivo de una operación cancelada', async ({ page }) => {
  const fixture = await mockPanel(page, 'supervisor', { note: { status: 'pending_payment' } });
  await openNotes(page);
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Evidencia del pago (opcional)').setInputFiles({
    name: 'anterior.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-test'),
  });
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await expect(dialog.getByLabel('Evidencia del pago (opcional)')).toHaveValue('');
  await dialog.getByLabel('Importe en USD').fill('100.00');
  await dialog.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(fixture.requests.filter((r) => r.path === '/documents')).toHaveLength(0);
  expect(fixture.requests.find((r) => r.path.endsWith('/payments'))?.body).not.toHaveProperty(
    'evidence_document_id',
  );
});
