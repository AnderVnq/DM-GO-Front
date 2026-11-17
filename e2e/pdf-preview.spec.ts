import { test, expect } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';
import { testPdf } from './fixtures/pdf';

test('muestra páginas, zoom y descarga desde la vista previa sin repetir la petición', async ({
  page,
}, info) => {
  await mockPanel(page);
  let requests = 0;
  await page.route('**/api/v1/quotes/quote-test/pdf', (route) => {
    requests++;
    return route.fulfill({ contentType: 'application/pdf', body: testPdf() });
  });
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: /Cambiar a modo oscuro/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  }
  const opener = page.getByRole('button', { name: 'Ver PDF de CA-TEST-42', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Cotización CA-TEST-42', exact: true });
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await expect(dialog.getByRole('img', { name: /Página 1 de 2/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Anterior', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await expect(dialog.getByRole('img', { name: /Página 2 de 2/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Aumentar zoom', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await expect(dialog.getByText('125 %', { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('pdf-preview.png'),
    fullPage: true,
    animations: 'disabled',
  });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('CA-TEST-42.pdf');
  expect(requests).toBe(1);
  expect(page.context().pages()).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test('reintenta un error de acceso sin abandonar el visor', async ({ page }) => {
  await mockPanel(page);
  let requests = 0;
  await page.route('**/api/v1/quotes/quote-test/pdf', (route) =>
    route.fulfill(
      ++requests === 1
        ? { status: 503, json: { detail: 'Documento temporalmente no disponible' } }
        : { contentType: 'application/pdf', body: testPdf() },
    ),
  );
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  await page.getByRole('button', { name: 'Ver PDF', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toHaveText('Documento temporalmente no disponible');
  await expect(dialog.getByRole('button', { name: 'Descargar PDF', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Reintentar vista previa', exact: true }).click();
  await expect(dialog.getByRole('img', { name: /Página 1 de 2/ })).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(requests).toBe(2);
});

test('conserva la vista previa y la extensión de una factura de imagen', async ({ page }) => {
  await mockPanel(page, 'supervisor', {
    package: { has_invoice: true, invoice_document_id: 'invoice-test' },
  });
  await page.context().route('https://files.example.test/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await login(page);
  await navigate(page, 'Clientes', 'customers');
  await page.getByRole('button', { name: 'Ver ficha de Cliente de prueba', exact: true }).click();
  await page.getByRole('link', { name: 'Ver paquetes', exact: true }).click();
  await page.getByRole('button', { name: 'Ver factura adjunta', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('img')).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Descargar imagen', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('factura-TEST-TRACK-42.png');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
