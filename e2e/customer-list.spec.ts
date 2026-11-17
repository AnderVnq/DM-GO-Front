import { test, expect } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';

test('carga, pagina, filtra y abre la ficha completa desde el listado', async ({ page }, info) => {
  const fixture = await mockPanel(page);
  const queries: URLSearchParams[] = [];
  await page.route('**/api/v1/customers?**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has('locker_code') || params.has('doc_number')) return route.fallback();
    queries.push(params);
    const offset = Number(params.get('offset') || 0);
    const q = params.get('q') || '';
    const count = q ? 1 : offset === 0 ? 25 : 1;
    const customers = Array.from({ length: count }, (_, i) => ({
      ...fixture.customer,
      id: i === 0 ? fixture.customer.id : `customer-${i}`,
      name: i === 0 ? fixture.customer.name : `Cliente ${i}`,
      seller: i % 2 === 0 ? null : { id: 'seller-1', name: 'Ana Ventas' },
    }));
    await route.fulfill({
      json: { customers, total: q ? 1 : 26, limit: Number(params.get('limit')), offset },
    });
  });
  await login(page);
  await navigate(page, 'Clientes', 'customers');
  const listing = page.getByRole('region', { name: 'Listado de clientes', exact: true });
  await expect(listing.getByRole('status')).toHaveText('1–25 de 26 clientes');
  await expect(listing.getByText('Ana Ventas', { exact: true }).first()).toBeVisible();
  expect(queries[0]?.get('limit')).toBe('25');
  expect(queries[0]?.get('sort')).toBe('newest');
  await listing.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(listing.getByRole('status')).toHaveText('26–26 de 26 clientes');
  expect(queries.at(-1)?.get('offset')).toBe('25');
  await expect(listing.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled();
  await listing
    .getByRole('button', { name: 'Ver ficha de Cliente de prueba', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Cliente de prueba', exact: true })).toBeVisible();
  expect(
    fixture.requests.some(
      (request) => request.path === '/customers/customer-test' && request.method === 'GET',
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Volver al listado', exact: true }).click();
  await expect(listing.getByRole('status')).toHaveText('26–26 de 26 clientes');
  await page.getByLabel('Buscar clientes', { exact: true }).fill('Ana');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(listing.getByRole('status')).toHaveText('1–1 de 1 clientes');
  expect(queries.at(-1)?.get('q')).toBe('Ana');
  expect(queries.at(-1)?.get('offset')).toBe('0');
  await page.getByRole('combobox', { name: 'Ordenar por', exact: true }).selectOption('name');
  await expect.poll(() => queries.at(-1)?.get('sort')).toBe('name');
  await page.screenshot({
    path: info.outputPath('customers-list-light.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /Cambiar a modo oscuro/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: info.outputPath('customers-list-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('diferencia un error recuperable de un listado vacío', async ({ page }) => {
  await mockPanel(page);
  let failed = true;
  await page.route('**/api/v1/customers?**', (route) =>
    route.fulfill(
      failed
        ? { status: 503, json: { detail: 'Listado temporalmente no disponible' } }
        : { json: { customers: [], total: 0, limit: 25, offset: 0 } },
    ),
  );
  await login(page);
  await navigate(page, 'Clientes', 'customers');
  await expect(page.getByRole('alert')).toHaveText('Listado temporalmente no disponible');
  await expect(page.getByRole('heading', { name: 'Sin clientes para mostrar' })).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'Reintentar listado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sin clientes para mostrar' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('recupera el listado después de un enlace a una ficha inexistente', async ({ page }) => {
  await mockPanel(page);
  await page.route('**/api/v1/customers/missing', (route) =>
    route.fulfill({ status: 404, json: { detail: 'El cliente no existe' } }),
  );
  await login(page);
  await navigate(page, 'Clientes', 'customers');
  await page.goto('/internal/customers?id=missing');
  const signIn = page.getByRole('button', { name: 'Iniciar sesión', exact: true });
  await expect(
    page.getByRole('heading', { name: 'Clientes', exact: true }).or(signIn),
  ).toBeVisible();
  if (await signIn.isVisible()) await signIn.click();
  await expect(page.getByRole('alert')).toHaveText('El cliente no existe');
  await page.getByRole('button', { name: 'Volver al listado', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Listado de clientes', exact: true }).getByRole('status'),
  ).toHaveText('1–1 de 1 clientes');
  await expect(page).not.toHaveURL(/id=missing/);
});
