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
