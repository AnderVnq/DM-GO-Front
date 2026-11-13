import { test, expect } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';

test('busca un cliente, consulta el seguimiento y registra una prealerta', async ({ page }) => {
  const fixture = await mockPanel(page);
  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  await navigate(page, 'Clientes', 'customers');
  await page.getByLabel('Casillero o documento', { exact: true }).fill('PE00042');
  await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cliente de prueba', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ver paquetes', exact: true }).click();
  await expect(page.getByText('Liberado por aduana', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva prealerta', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tienda', { exact: true }).fill('Otra tienda');
  await dialog.getByLabel('Tracking del transportista').fill('TEST-NEW-43');
  await dialog.getByLabel('Contenido del paquete').fill('Libro de prueba');
  await dialog.getByLabel('Valor declarado en USD').fill('49.99');
  await dialog.getByRole('button', { name: 'Registrar prealerta', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.inspector')).toContainText('Libro de prueba');
  expect(fixture.requests.filter((r) => r.path === '/packages' && r.method === 'POST')).toEqual([
    {
      path: '/packages',
      method: 'POST',
      body: {
        customer_id: fixture.customer.id,
        mode: 'courier',
        store: 'Otra tienda',
        carrier_tracking: 'TEST-NEW-43',
        description: 'Libro de prueba',
        declared_value_cents: 4999,
      },
    },
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('liquida una nota, impide el sobrepago y registra el saldo exacto una vez', async ({
  page,
}) => {
  const fixture = await mockPanel(page);
  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  await navigate(page, 'Notas de salida', 'dispatch-notes');
  await page.getByRole('button', { name: 'Liquidar nota', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Importe en USD').fill('100.01');
  await dialog.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(fixture.requests.filter((r) => r.path.endsWith('/payments'))).toHaveLength(0);
  await dialog.getByLabel('Importe en USD').fill('100.00');
  await dialog.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('Pago registrado.');
  expect(fixture.requests.filter((r) => r.path.endsWith('/payments'))).toEqual([
    {
      path: '/dispatch-notes/note-test/payments',
      method: 'POST',
      body: { method: 'transfer', origin: 'PERU', reference: '', amount_cents: 10000 },
    },
  ]);
  await expect(page.getByRole('button', { name: 'Registrar pago', exact: true })).toHaveCount(0);
  await expect(page.locator('.inspector')).toContainText('Transferencia');
});

test('el vendedor consulta notas sin acciones de gestión', async ({ page }) => {
  await mockPanel(page, 'seller');
  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  await navigate(page, 'Notas de salida', 'dispatch-notes');
  await expect(page.getByRole('heading', { name: 'NS-TEST-42', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Liquidar nota', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Anular nota', exact: true })).toHaveCount(0);
});

test('una cuenta de cliente no accede al panel del personal', async ({ page }) => {
  await mockPanel(page, 'customer');
  await login(page);
  await expect(page).toHaveURL(/\/forbidden/);
  await expect(page.getByRole('navigation')).toHaveCount(0);
});

test('un conflicto al liquidar conserva el borrador y permite volver', async ({ page }) => {
  await mockPanel(page);
  await page.route('**/api/v1/dispatch-notes/note-test/liquidate', (route) =>
    route.fulfill({ status: 409, json: {} }),
  );
  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  await navigate(page, 'Notas de salida', 'dispatch-notes');
  await page.getByRole('button', { name: 'Liquidar nota', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('El registro cambió.');
  await dialog.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Liquidar nota', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Registrar pago', exact: true })).toHaveCount(0);
});

for (const status of [401, 403]) {
  test(`responde al rechazo ${status} de la API sin mostrar éxito`, async ({ page }) => {
    await mockPanel(page);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
    await page.route('**/api/v1/quotes?**', (route) => route.fulfill({ status, json: {} }));
    await navigate(page, 'Cotizaciones', 'quotes');
    if (status === 401) {
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    } else await expect(page.getByRole('alert')).toContainText('No tienes permiso');
  });
}

test('traduce el desglose y rechaza una respuesta de PDF incorrecta', async ({ page }) => {
  await mockPanel(page);
  await page.route('**/api/v1/quotes/quote-test/pdf', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html>Error de generación</html>' }),
  );
  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  await navigate(page, 'Cotizaciones', 'quotes');
  await expect(
    page.locator('.inspector').getByText('Compra asistida', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.inspector').getByText('Tributos estimados en Perú', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /PDF/ }).click();
  await expect(page.getByRole('alert')).toContainText('La respuesta recibida no es un PDF.');
});

test('muestra el rechazo de una factura grande y conserva el paquete', async ({ page }) => {
  await mockPanel(page);
  await page.route('**/api/v1/packages/package-test/invoice', (route) =>
    route.fulfill({ status: 413, json: {} }),
  );
  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  await navigate(page, 'Clientes', 'customers');
  await page.getByLabel('Casillero o documento', { exact: true }).fill('PE00042');
  await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
  await page.getByRole('link', { name: 'Ver paquetes', exact: true }).click();
  await page.locator('.inspector input[type=file]').setInputFiles({
    name: 'factura.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-test'),
  });
  await expect(page.locator('.inspector').getByRole('alert')).toContainText('15 MB');
  await expect(page.getByRole('button', { name: 'Adjuntar factura', exact: true })).toBeEnabled();
  await expect(page.locator('.inspector')).toContainText('TEST-TRACK-42');
});
