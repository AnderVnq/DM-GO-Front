import { test, expect } from '@playwright/test';
import { mockPanel, login, navigate } from './fixtures/panel';
test('ofrece clientes al enfocar y busca con debounce antes de seleccionar su código', async ({
  page,
}) => {
  const { customer } = await mockPanel(page);
  const queries: string[] = [];
  await page.route('**/api/v1/customers?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has('locker_code') || params.has('doc_number')) return route.fallback();
    queries.push(params.get('q') ?? '');
    return route.fulfill({ json: { customers: [customer], total: 1, limit: 8, offset: 0 } });
  });
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
  const field = page.getByRole('combobox', {
    name: 'Casillero de cliente (opcional)',
    exact: true,
  });
  await field.focus();
  await expect(page.getByRole('option', { name: /PE00042/ })).toBeVisible();
  await field.fill('Ana');
  await field.fill('Ana Pérez');
  await expect.poll(() => queries.includes('Ana Pérez')).toBe(true);
  expect(queries).not.toContain('Ana');
  await page.getByRole('option', { name: /PE00042/ }).click();
  await expect(field).toHaveValue('PE00042');
  await expect(field).toHaveAttribute('aria-expanded', 'false');
});
test('contrae la navegación sin perder nombres y conserva la preferencia', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'El móvil conserva su menú desplegable.');
  await mockPanel(page);
  await login(page);
  const nav = page.getByRole('complementary', { name: 'Navegación principal' });
  const initial = (await nav.boundingBox())!.width;
  await page.getByRole('button', { name: 'Contraer navegación', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Expandir navegación', exact: true }),
  ).toBeVisible();
  expect((await nav.boundingBox())!.width).toBeLessThan(initial);
  await expect(nav.getByRole('link', { name: 'Clientes', exact: true })).toHaveAttribute(
    'title',
    'Clientes',
  );
  await nav.getByRole('link', { name: 'Clientes', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('dm48.navigation.collapsed'))).toBe('true');
  await page.screenshot({
    path: info.outputPath('sidebar-collapsed.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Expandir navegación', exact: true }).click();
  await expect.poll(async () => (await nav.boundingBox())!.width).toBe(initial);
});

test('consulta una guía liberada por su código sin solicitar UUID ni enlace', async ({ page }) => {
  await mockPanel(page, 'supervisor');
  const line = {
    id: '44444444-4444-4444-8444-444444444444',
    guide: 'H-42',
    customs_manifest: 'MAN-42',
    declaration: 'DAM-42',
    status: 'released',
    tax_cents: 0,
    currency: 'PEN',
    channel: 'green',
    proof_submitted: false,
    assessment_document_id: '',
    proof_document_id: '',
  };
  const queries: string[] = [];
  await page.route('**/api/v1/customs/lines**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith('/lines')) {
      queries.push(url.searchParams.get('q') ?? '');
      return r.fulfill({
        json: { lines: url.searchParams.get('pending') ? [] : [line], total: 1 },
      });
    }
    return r.fulfill({ json: line });
  });
  await login(page);
  await navigate(page, 'Aduanas', 'customs');
  const field = page.getByRole('combobox', {
    name: 'Buscar guía por código, declaración o manifiesto',
  });
  await field.focus();
  await expect(page.getByRole('option', { name: /H-42/ })).toBeVisible();
  await field.fill('H-42');
  await expect.poll(() => queries.includes('H-42')).toBe(true);
  await page.getByRole('option', { name: /H-42/ }).click();
  await expect(page.getByRole('heading', { name: 'Guía H-42', exact: true })).toBeVisible();
});

test('encuentra una ruta por código aunque sea de otra fecha', async ({ page }) => {
  await mockPanel(page, 'supervisor');
  const route = {
    id: '55555555-5555-4555-8555-555555555555',
    code: 'RT-42',
    driver_id: 'driver-test',
    driver_name: 'Repartidor de prueba',
    date: '2026-11-17',
    warehouse_code: 'LIM-01',
    status: 'planned',
    stops: [],
  };
  await page.route('**/api/v1/routes**', (r) => {
    const url = new URL(r.request().url());
    return r.fulfill({
      json: url.pathname.endsWith('/routes')
        ? { routes: url.searchParams.has('date') ? [] : [route], total: 1 }
        : route,
    });
  });
  await login(page);
  await navigate(page, 'Rutas de reparto', 'delivery-routes');
  const field = page.getByRole('combobox', { name: 'Buscar ruta por código o repartidor' });
  await field.focus();
  await expect(page.getByRole('option', { name: /RT-42.*Repartidor de prueba/ })).toBeVisible();
  await page.getByRole('option', { name: /RT-42/ }).click();
  await expect(page.getByRole('heading', { name: 'Ruta RT-42', exact: true })).toBeVisible();
});
