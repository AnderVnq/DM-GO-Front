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

test('un pago ya revisado conserva el error y actualiza su estado sin anunciar aprobación', async ({
  page,
}) => {
  const fixture = await mockPanel(page, 'supervisor', { note: pendingNote });
  await page.route('**/api/v1/dispatch-notes/note-test', (route) =>
    route.fulfill({
      json: {
        ...fixture.note,
        status: 'paid',
        paid_cents: 10000,
        balance_cents: 0,
        payments: fixture.note.payments.map((payment) => ({ ...payment, status: 'accepted' })),
      },
    }),
  );
  await page.route('**/api/v1/dispatch-notes/note-test/payments/*/review', (route) =>
    route.fulfill({ status: 409, json: { detail: 'El pago ya fue revisado' } }),
  );
  await openNotes(page);
  await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('El pago ya fue revisado');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Confirmar', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.locator('.inspector').getByText('Aceptado', { exact: true })).toBeVisible();
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

test('anula una nota solo tras confirmar con motivo y la deja en solo lectura', async ({
  page,
}) => {
  const fixture = await mockPanel(page);
  await openNotes(page);
  const trigger = page.getByRole('button', { name: 'Anular nota de salida', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Confirmar', exact: true })).toBeDisabled();
  await dialog.getByLabel('Motivo').fill('   ');
  await expect(dialog.getByRole('button', { name: 'Confirmar', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Volver', exact: true }).click();
  expect(fixture.requests.filter((r) => r.path.endsWith('/cancel'))).toHaveLength(0);
  await trigger.click();
  await dialog.getByLabel('Motivo').fill('  Solicitud duplicada del cliente.  ');
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.inspector')).toContainText(
    'Motivo de anulación: Solicitud duplicada del cliente.',
  );
  for (const name of [
    'Liquidar nota',
    'Registrar pago',
    'Añadir cargo',
    'Cambiar destino',
    'Anular nota de salida',
  ]) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  expect(fixture.requests.filter((r) => r.path.endsWith('/cancel'))).toEqual([
    {
      path: '/dispatch-notes/note-test/cancel',
      method: 'POST',
      body: { reason: 'Solicitud duplicada del cliente.' },
    },
  ]);
});

test('una nota pagada permanece en solo lectura incluso para administración', async ({ page }) => {
  await mockPanel(page, 'admin', { note: { status: 'paid', paid_cents: 10000, balance_cents: 0 } });
  await openNotes(page);
  await expect(page.locator('.inspector')).toContainText('Pagado');
  for (const name of [
    'Liquidar nota',
    'Registrar pago',
    'Añadir cargo',
    'Añadir paquetes',
    'Cambiar destino',
    'Anular nota de salida',
  ]) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: 'Ver PDF', exact: true })).toBeEnabled();
});

test('solicita de nuevo el enlace firmado de la nota al repetir la descarga', async ({ page }) => {
  await mockPanel(page);
  let links = 0;
  await page.route('**/api/v1/dispatch-notes/note-test/pdf', (route) =>
    route.fulfill({
      json: {
        url: `https://files.example.test/note-${++links}.pdf`,
        expires_at: '2027-01-01T00:00:00Z',
      },
    }),
  );
  const externalHeaders: (string | undefined)[] = [];
  await page.context().route('https://files.example.test/**', async (route) => {
    externalHeaders.push(route.request().headers()['authorization']);
    await route.fulfill({ contentType: 'text/plain', body: 'Documento de prueba' });
  });
  await openNotes(page);
  for (let index = 1; index <= 2; index++) {
    const popup = page.context().waitForEvent('page');
    await page.getByRole('button', { name: 'Ver PDF', exact: true }).click();
    const preview = await popup;
    await expect(preview).toHaveURL(`https://files.example.test/note-${index}.pdf`);
    await preview.waitForLoadState();
    expect(await preview.evaluate(() => window.opener)).toBeNull();
    await preview.close();
  }
  expect(links).toBe(2);
  expect(externalHeaders).toEqual([undefined, undefined]);
});

test('un conflicto al cobrar actualiza el saldo y no vuelve a enviar un pago obsoleto', async ({
  page,
}) => {
  const fixture = await mockPanel(page, 'supervisor', { note: { status: 'pending_payment' } });
  let payments = 0;
  let reads = 0;
  await page.route('**/api/v1/dispatch-notes/note-test/payments', (route) => {
    payments++;
    return route.fulfill({ status: 409, json: { detail: 'Otro operador registró un pago.' } });
  });
  await page.route('**/api/v1/dispatch-notes/note-test', async (route) => {
    reads++;
    await route.fulfill({
      json: {
        id: 'note-test',
        number: 'NS-TEST-42',
        customer_id: fixture.customer.id,
        status: 'paid',
        method: 'pickup',
        total_cents: 10000,
        paid_cents: 10000,
        balance_cents: 0,
        currency: 'USD',
        guides: [],
        lines: [],
        payments: [],
        created_at: fixture.customer.created_at,
      },
    });
  });
  await openNotes(page);
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Importe en USD').fill('100');
  await dialog.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Otro operador registró un pago.');
  await expect(page.locator('.inspector app-status').first()).toHaveText('Pagado');
  await expect(dialog.getByLabel('Importe en USD')).toHaveValue('100');
  expect(reads).toBe(1);
  await expect(dialog.getByRole('button', { name: 'Registrar pago', exact: true })).toBeDisabled();
  await dialog.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit());
  expect(payments).toBe(1);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('si falla la recarga de un conflicto bloquea la nota obsoleta y conserva el importe', async ({
  page,
}) => {
  await mockPanel(page, 'supervisor', { note: { status: 'pending_payment' } });
  let writes = 0;
  await page.route('**/api/v1/dispatch-notes/note-test/payments', (route) => {
    writes++;
    return route.fulfill({ status: 409, json: { detail: 'El saldo cambió.' } });
  });
  await page.route('**/api/v1/dispatch-notes/note-test', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await openNotes(page);
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar pago', exact: true });
  await dialog.getByLabel('Importe en USD').fill('50.00');
  await dialog.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo actualizar la nota.');
  await expect(dialog.getByLabel('Importe en USD')).toHaveValue('50.00');
  await expect(dialog.getByRole('button', { name: 'Registrar pago', exact: true })).toBeDisabled();
  await expect(page.locator('.inspector')).toHaveCount(0);
  expect(writes).toBe(1);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
});
