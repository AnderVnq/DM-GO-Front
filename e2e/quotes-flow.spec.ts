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
