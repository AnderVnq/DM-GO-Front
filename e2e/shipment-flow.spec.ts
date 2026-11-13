import { test, expect, type Page } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';

async function openPackages(page: Page) {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  await navigate(page, 'Clientes', 'customers');
  await page.getByLabel('Casillero o documento', { exact: true }).fill('PE00042');
  await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
  await page.getByRole('link', { name: 'Ver paquetes', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Detalle del paquete', exact: true }),
  ).toBeVisible();
}

const invoice = {
  name: 'factura.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-test'),
};

test('adjunta la factura en multipart y abre su enlace autorizado', async ({ page }) => {
  const fixture = await mockPanel(page, 'supervisor', { package: { status: 'PREALERTED' } });
  let multipart = '';
  page.on('request', (request) => {
    if (request.url().endsWith('/packages/package-test/invoice'))
      multipart = request.postData() ?? '';
  });
  await page.context().route('https://files.example.test/invoice.pdf', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>Factura de prueba</title>Factura de prueba',
    }),
  );
  await openPackages(page);
  await page.locator('.inspector input[type=file]').setInputFiles(invoice);
  await expect(page.getByRole('button', { name: 'Cambiar factura', exact: true })).toBeEnabled();
  expect(multipart).toContain('name="file"; filename="factura.pdf"');
  expect(multipart).toContain('%PDF-test');
  expect(
    fixture.requests.filter((r) => r.path.endsWith('/invoice') && r.method === 'POST'),
  ).toHaveLength(1);
  const opened = page.context().waitForEvent('page');
  await page.getByRole('button', { name: 'Ver factura adjunta', exact: true }).click();
  const preview = await opened;
  await expect(preview).toHaveURL('https://files.example.test/invoice.pdf');
  await expect(preview).toHaveTitle('Factura de prueba');
  expect(await preview.evaluate(() => window.opener)).toBe(null);
  await preview.close();
});

test('una factura de un paquete consolidado permanece en solo lectura', async ({ page }) => {
  await mockPanel(page, 'supervisor', {
    package: { status: 'CONSOLIDATED', has_invoice: true, invoice_document_id: 'invoice-test' },
  });
  await openPackages(page);
  await expect(page.getByRole('button', { name: 'Cambiar factura', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Ver factura adjunta', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.inspector')).toContainText(
    'La factura solo se puede cambiar antes de consolidar.',
  );
});

test('un archivo inválido no se sube y se puede reemplazar por uno válido', async ({ page }) => {
  const fixture = await mockPanel(page, 'supervisor', { package: { status: 'RECEIVED_USA' } });
  await openPackages(page);
  const input = page.locator('.inspector input[type=file]');
  await input.setInputFiles({
    name: 'archivo.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('contenido no válido'),
  });
  await expect(page.locator('.inspector').getByRole('alert')).toContainText(
    'Adjunta un archivo PDF',
  );
  expect(fixture.requests.filter((r) => r.path.endsWith('/invoice'))).toHaveLength(0);
  await input.setInputFiles(invoice);
  await expect(page.getByRole('button', { name: 'Cambiar factura', exact: true })).toBeEnabled();
  await expect(page.locator('.inspector').getByRole('alert')).toHaveCount(0);
});

test('reintenta el seguimiento sin borrar el error independiente de la factura', async ({
  page,
}, testInfo) => {
  await mockPanel(page, 'supervisor', { package: { status: 'PREALERTED' } });
  let attempts = 0;
  await page.route('**/api/v1/packages/package-test/tracking', async (route) => {
    if (++attempts === 1)
      return route.fulfill({ status: 503, json: { detail: 'No se pudo cargar el seguimiento.' } });
    await route.fallback();
  });
  await openPackages(page);
  await expect(page.locator('.inspector').getByRole('alert')).toContainText(
    'No se pudo cargar el seguimiento.',
  );
  await page.locator('.inspector input[type=file]').setInputFiles({
    name: 'archivo.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('contenido no válido'),
  });
  await expect(
    page.getByRole('button', { name: 'Reintentar seguimiento', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('tracking-retry.png'), fullPage: true });
  await page.getByRole('button', { name: 'Reintentar seguimiento', exact: true }).click();
  await expect(page.getByText('Compra prealertada', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reintentar seguimiento', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.inspector').getByRole('alert')).toHaveText(
    'Adjunta un archivo PDF, JPEG, PNG o WEBP.',
  );
  expect(attempts).toBe(2);
});

test('bloquea valores fuera del contrato y conserva el formulario de prealerta', async ({
  page,
}) => {
  const fixture = await mockPanel(page);
  await openPackages(page);
  await page.getByRole('button', { name: 'Nueva prealerta', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tienda', { exact: true }).fill('Tienda de prueba');
  await dialog.getByLabel('Tracking del transportista', { exact: true }).fill('TEST-NEW-42');
  await dialog.getByLabel('Contenido del paquete', { exact: true }).fill('Audífonos nuevos');
  const amount = dialog.getByLabel('Valor declarado en USD');
  for (const value of ['0', '100000.01']) {
    await amount.fill(value);
    await dialog.getByRole('button', { name: 'Registrar prealerta', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('mayor que cero y de hasta USD 100 000');
    expect(
      fixture.requests.filter((r) => r.path === '/packages' && r.method === 'POST'),
    ).toHaveLength(0);
  }
  await amount.fill('100000');
  await dialog.getByRole('button', { name: 'Registrar prealerta', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    fixture.requests.find((r) => r.path === '/packages' && r.method === 'POST')?.body?.[
      'declared_value_cents'
    ],
  ).toBe(10000000);
});

test('al cambiar de cliente no conserva el filtro invisible del cliente anterior', async ({
  page,
}) => {
  const fixture = await mockPanel(page);
  const second = {
    ...fixture.customer,
    id: 'customer-second',
    locker_code: 'PE00043',
    name: 'Segundo cliente',
  };
  await page.route('**/api/v1/customers?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('locker_code') === 'PE00043')
      await route.fulfill({ json: second });
    else await route.fallback();
  });
  await page.route('**/api/v1/customers/customer-second', (route) =>
    route.fulfill({ json: second }),
  );
  await page.route('**/api/v1/packages?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('customer_id') === second.id)
      await route.fulfill({
        json: {
          packages: [
            {
              id: 'package-second',
              customer_id: second.id,
              mode: 'courier',
              status: 'PREALERTED',
              store: 'Segunda tienda',
              carrier_tracking: 'SECOND-TRACK',
              description: 'Paquete segundo',
              declared_value_cents: 2000,
              has_invoice: false,
              created_at: second.created_at,
            },
          ],
        },
      });
    else await route.fallback();
  });
  await openPackages(page);
  await page.getByLabel('Filtrar paquetes del cliente').fill('sin coincidencias');
  await expect(page.getByRole('heading', { name: 'Sin coincidencias', exact: true })).toBeVisible();
  await page.getByLabel('Casillero o documento del cliente').fill('PE00043');
  await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
  await expect(page.locator('.identity')).toContainText('Segundo cliente');
  await expect(page.getByLabel('Filtrar paquetes del cliente')).toHaveValue('');
  await expect(page.getByRole('cell', { name: 'SECOND-TRACK', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'TEST-TRACK-42', exact: true })).toHaveCount(0);
});

test('un rechazo 403 al adjuntar factura conserva el paquete y permite volver a intentar', async ({
  page,
}) => {
  await mockPanel(page, 'supervisor', { package: { status: 'PREALERTED' } });
  let attempts = 0;
  await page.route('**/api/v1/packages/package-test/invoice', async (route) => {
    if (++attempts === 1) await route.fulfill({ status: 403, json: {} });
    else await route.fallback();
  });
  await openPackages(page);
  const input = page.locator('.inspector input[type=file]');
  await input.setInputFiles(invoice);
  await expect(page.locator('.inspector').getByRole('alert')).toContainText('No tienes permiso');
  await expect(page.locator('.inspector')).toContainText('TEST-TRACK-42');
  await input.setInputFiles(invoice);
  await expect(page.getByRole('button', { name: 'Cambiar factura', exact: true })).toBeEnabled();
  await expect(page.locator('.inspector').getByRole('alert')).toHaveCount(0);
  expect(attempts).toBe(2);
});

test('bloquea el doble envío de prealerta y restaura la selección desde la URL', async ({
  page,
}) => {
  const fixture = await mockPanel(page);
  let writes = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/packages', async (route) => {
    if (route.request().method() === 'POST') {
      writes++;
      await pending;
    }
    await route.fallback();
  });
  try {
    await openPackages(page);
    await page.getByRole('button', { name: 'Nueva prealerta', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Tienda', { exact: true }).fill('Nueva tienda');
    await dialog.getByLabel('Tracking del transportista').fill('TEST-NEW-43');
    await dialog.getByLabel('Contenido del paquete').fill('Nuevo libro');
    await dialog.getByLabel('Valor declarado en USD').fill('49.99');
    await dialog.locator('form').evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect.poll(() => writes).toBe(1);
    await expect(dialog.getByRole('button', { name: 'Registrando…', exact: true })).toBeDisabled();
    release();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.inspector')).toContainText('TEST-NEW-43');
    expect(
      fixture.requests.filter((r) => r.path === '/packages' && r.method === 'POST'),
    ).toHaveLength(1);
    await page.getByRole('button', { name: /Tienda de prueba.*Audífonos de prueba/ }).click();
    await expect(page).toHaveURL(/package_id=package-test/);
    await page.reload();
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.locator('.inspector')).toContainText('TEST-TRACK-42');
    await expect(page).toHaveURL(/customer_id=customer-test.*package_id=package-test/);
    expect(writes).toBe(1);
  } finally {
    release();
  }
});

test('muestra paquetes vacíos sin inventar seguimiento ni consultas globales', async ({ page }) => {
  const fixture = await mockPanel(page);
  await page.route('**/api/v1/packages?**', (route) => route.fulfill({ json: { packages: [] } }));
  await login(page);
  await navigate(page, 'Paquetes', 'packages');
  await expect(
    page.getByRole('heading', { name: 'Selecciona un cliente', exact: true }),
  ).toBeVisible();
  expect(fixture.requests.filter((r) => r.path === '/packages')).toEqual([]);
  await page.getByLabel('Casillero o documento del cliente').fill('PE00042');
  await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Todavía no hay paquetes', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva prealerta', exact: true })).toBeEnabled();
  await expect(page.locator('.inspector')).toHaveCount(0);
  expect(fixture.requests.filter((r) => r.path.endsWith('/tracking'))).toEqual([]);
});
