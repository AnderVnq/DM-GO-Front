import { test, expect } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';

for (const { store, url } of [
  { store: '', url: '' },
  { store: 'Tienda de prueba', url: '' },
  { store: '', url: 'https://example.test/producto' },
  { store: 'Tienda de prueba', url: 'https://example.test/producto' },
]) {
  test(`crea una cotización con tienda ${store ? 'indicada' : 'vacía'} y enlace ${url ? 'indicado' : 'vacío'}`, async ({
    page,
  }) => {
    const fixture = await mockPanel(page);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
    await navigate(page, 'Cotizaciones', 'quotes');
    await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre del cliente o prospecto').fill('Prospecto de prueba');
    await dialog.getByLabel('Correo electrónico').fill('prospecto@example.test');
    await dialog.getByLabel('Producto', { exact: true }).fill('Audífonos');
    await dialog.getByLabel(/^Tienda/).fill(store);
    await dialog.getByLabel(/^Enlace del producto/).fill(url);
    await dialog.getByLabel('Precio unitario en USD').fill('100.00');
    await dialog.getByLabel('Peso estimado en gramos').fill('500');
    await expect(
      dialog.getByRole('button', { name: 'Crear cotización', exact: true }),
    ).toBeEnabled();
    await dialog.getByRole('button', { name: 'Crear cotización', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'CA-TEST-43', exact: true })).toBeVisible();
    const requests = fixture.requests.filter((r) => r.path === '/quotes' && r.method === 'POST');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toMatchObject({
      store,
      product_url: url,
      product_name: 'Audífonos',
      unit_cents: 10000,
      grams: 500,
      quantity: 1,
    });
  });
}

for (const status of [422, 403, 409]) {
  test(`conserva las entradas y permite corregir una creación rechazada con ${status}`, async ({
    page,
  }) => {
    await mockPanel(page);
    let attempts = 0;
    await page.route('**/api/v1/quotes', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      attempts++;
      if (attempts === 1)
        await route.fulfill({
          status,
          json: {
            detail: 'No se pudo registrar esta cotización.',
            errors: { product_name: 'Revisa el producto.' },
          },
        });
      else await route.fallback();
    });
    await login(page);
    await navigate(page, 'Cotizaciones', 'quotes');
    await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre del cliente o prospecto').fill('Prospecto recuperable');
    await dialog.getByLabel('Correo electrónico').fill('prospecto@example.test');
    await dialog.getByLabel('Producto', { exact: true }).fill('Audífonos');
    await dialog.getByLabel('Precio unitario en USD').fill('100.25');
    await dialog.getByLabel('Peso estimado en gramos').fill('500');
    await dialog.getByRole('button', { name: 'Crear cotización', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('No se pudo registrar esta cotización.');
    await expect(dialog.getByLabel('Nombre del cliente o prospecto')).toHaveValue(
      'Prospecto recuperable',
    );
    await expect(dialog.getByLabel('Producto', { exact: true })).toHaveValue('Audífonos');
    await expect(dialog.getByLabel('Precio unitario en USD')).toHaveValue('100.25');
    await expect(page.locator('.inspector h2')).toHaveText('CA-TEST-42');
    expect(attempts).toBe(1);
    await dialog.getByRole('button', { name: 'Crear cotización', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.inspector h2')).toHaveText('CA-TEST-43');
    expect(attempts).toBe(2);
  });
}

test('descarga el PDF binario de la cotización con su número', async ({ page }) => {
  await mockPanel(page);
  await page.route('**/api/v1/quotes/quote-test/pdf', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.7\nCotización de prueba' }),
  );
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('CA-TEST-42.pdf');
  expect(await file.failure()).toBeNull();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('exige correo o teléfono del prospecto antes de enviar la cotización', async ({ page }) => {
  const fixture = await mockPanel(page);
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre del cliente o prospecto').fill('Nuevo prospecto');
  await dialog.getByLabel('Producto', { exact: true }).fill('Audífonos');
  await dialog.getByLabel('Precio unitario en USD').fill('100');
  await dialog.getByLabel('Peso estimado en gramos').fill('500');
  await dialog.getByRole('button', { name: 'Crear cotización', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Indica al menos un correo electrónico o teléfono para el prospecto.',
  );
  expect(fixture.requests.filter((r) => r.path === '/quotes' && r.method === 'POST')).toHaveLength(
    0,
  );
  await dialog.getByLabel('Teléfono', { exact: true }).fill('999000043');
  await dialog.getByRole('button', { name: 'Crear cotización', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.inspector h2')).toHaveText('CA-TEST-43');
  expect(
    fixture.requests.filter((r) => r.path === '/quotes' && r.method === 'POST')[0]?.body,
  ).toMatchObject({
    prospect_name: 'Nuevo prospecto',
    prospect_phone: '999000043',
    prospect_email: '',
  });
});
