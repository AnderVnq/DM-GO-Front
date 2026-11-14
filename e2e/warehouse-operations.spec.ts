import { test, expect, type Page } from '@playwright/test';
import { mockPanel, login, navigate } from './fixtures/panel';
import type { Warehouse } from '../src/app/modules/warehouses/warehouse.model';
import type { Package } from '../src/app/modules/shipments/package.model';

async function warehouseOperations(page: Page, role = 'admin') {
  const fixture = await mockPanel(page, role);
  const writes: { path: string; body: Record<string, unknown> | null }[] = [];
  const us: Warehouse = {
    id: 'us',
    code: 'USA-01',
    name: 'Miami',
    country: 'US',
    timezone: 'America/New_York',
    active: true,
    address: {
      line1: '100 Test Street',
      line2: '',
      city: 'Miami',
      state: 'FL',
      postal_code: '33101',
    },
    created_at: '2026-11-13T12:00:00Z',
    updated_at: '2026-11-13T12:00:00Z',
  };
  const warehouses = [
    us,
    { ...us, id: 'pe', code: 'LIM-01', name: 'Lima', country: 'PE' },
    { ...us, id: 'inactive', code: 'USA-03', name: 'Inactivo', active: false },
  ];
  let packages: Package[] = [];
  let receiptAttempts = 0;
  await page.route(
    /\/api\/v1\/(warehouses(?:\/[^/]+)?|warehouse\/[^/]+|documents|packages\/received-package\/assign)(?:\?.*)?$/,
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace('/api/v1', '');
      expect(request.headers()['authorization']).toMatch(/^Bearer /);
      const body = request.headers()['content-type']?.includes('application/json')
        ? (request.postDataJSON() as Record<string, unknown>)
        : null;
      if (request.method() !== 'GET') writes.push({ path, body });
      if (path === '/warehouses' && request.method() === 'GET')
        return route.fulfill({ json: { warehouses } });
      if (path === '/warehouses' && request.method() === 'POST') {
        const created = { ...us, ...body, id: 'new-warehouse' } as Warehouse;
        warehouses.push(created);
        return route.fulfill({ status: 201, json: created });
      }
      if (path.startsWith('/warehouses/') && request.method() === 'PATCH') {
        const index = warehouses.findIndex((w) => w.id === path.split('/')[2]);
        warehouses[index] = { ...warehouses[index]!, ...body } as Warehouse;
        return route.fulfill({ json: warehouses[index] });
      }
      if (path === '/documents')
        return route.fulfill({
          status: 201,
          json: {
            id: 'arrival-photo',
            original_name: 'arrival.png',
            mime_type: 'image/png',
            size: 67,
          },
        });
      if (path === '/warehouse/receipts') {
        receiptAttempts++;
        if (receiptAttempts === 1)
          return route.fulfill({
            status: 422,
            json: {
              code: 'ambiguous_tracking',
              detail: 'Indica el casillero para identificar la prealerta.',
            },
          });
        const received: Package = {
          id: 'received-package',
          customer_id: '',
          carrier_tracking: String(body?.['carrier_tracking']),
          description: String(body?.['description']),
          status: 'RECEIVED_USA',
          mode: 'courier',
          store: '',
          has_invoice: false,
          declared_value_cents: 0,
          created_at: us.created_at,
          receipt: {
            number: 'WR-000042',
            weight_g: 1000,
            weight_kg: '1.00',
            received_at: us.created_at,
            dimensions_mm: [200, 100, 100],
            condition: 'good',
            billable_lb: 3,
            freight_cents: 1500,
          },
        };
        packages = [received];
        return route.fulfill({
          status: 201,
          json: { matched_by: 'unidentified', package: received },
        });
      }
      if (path === '/warehouse/unidentified') return route.fulfill({ json: { packages } });
      if (path.endsWith('/assign')) {
        const assigned = { ...packages[0]!, customer_id: String(body?.['customer_id']) };
        packages = [];
        return route.fulfill({ json: assigned });
      }
      return route.fulfill({ status: 404, json: {} });
    },
  );
  return { ...fixture, writes };
}

test('administración crea y edita almacenes sin cambiar código ni país', async ({ page }, info) => {
  const { writes } = await warehouseOperations(page);
  await login(page);
  await navigate(page, 'Almacenes', 'warehouses');
  await page.getByRole('button', { name: 'Nuevo almacén' }).click();
  await page.getByLabel(/^Código\s*Formato/).fill('USA-02');
  await page.getByLabel('Nombre', { exact: true }).fill('Segunda sede');
  await page.getByLabel('Dirección', { exact: true }).fill('200 Test Street');
  await page.getByLabel('Ciudad', { exact: true }).fill('Miami');
  await page.getByRole('button', { name: 'Guardar almacén' }).click();
  await expect(page.getByRole('status')).toContainText('Almacén creado');
  expect(writes.at(-1)?.body).toMatchObject({
    code: 'USA-02',
    country: 'US',
    name: 'Segunda sede',
    address: { line1: '200 Test Street', city: 'Miami' },
  });
  await expect(page.getByLabel(/^Código\s*Formato/)).toBeDisabled();
  await expect(page.getByLabel(/^País \(ISO\)/)).toBeDisabled();
  await page.getByLabel('Nombre', { exact: true }).fill('Sede actualizada');
  await page.getByLabel('Almacén activo', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Guardar almacén' }).click();
  await expect(page.getByRole('status')).toContainText('Almacén actualizado');
  expect(writes.at(-1)?.body).toMatchObject({ name: 'Sede actualizada', active: false });
  expect(writes.at(-1)?.body).not.toHaveProperty('code');
  expect(writes.at(-1)?.body).not.toHaveProperty('country');
  await page.getByLabel('Incluir inactivos').check();
  await expect(page.getByRole('row').filter({ hasText: 'USA-02' })).toContainText('Inactivo');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('warehouses.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('ventas consulta almacenes sin acceso a recepción ni administración', async ({ page }) => {
  const { writes } = await warehouseOperations(page, 'seller');
  await login(page);
  await navigate(page, 'Almacenes', 'warehouses');
  await expect(page.getByRole('heading', { name: 'Miami', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo almacén' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar almacén' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Recibir paquete en USA' })).toHaveCount(0);
  await page.goto('/internal/warehouses/receiving');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();
  expect(writes).toEqual([]);
});

test('supervisión recibe con fotos y asigna sin conservar una búsqueda anterior', async ({
  page,
}, info) => {
  const { writes, customer } = await warehouseOperations(page, 'supervisor');
  await login(page);
  await navigate(page, 'Almacenes', 'warehouses');
  await page.getByRole('link', { name: 'Recibir paquete en USA' }).click();
  await expect(page.getByRole('combobox', { name: 'Almacén USA', exact: true })).toHaveValue(
    'USA-01',
  );
  await expect(page.getByRole('option', { name: /LIM-01|USA-03/ })).toHaveCount(0);
  await page.getByLabel('Tracking del transportista (opcional)').fill('TRACK-42');
  await page.getByLabel('Descripción del contenido').fill('Audífonos');
  await page.getByLabel(/^Peso \(g\)/).fill('1000');
  await page.getByLabel('Largo (mm)', { exact: true }).fill('200');
  await page.getByLabel('Ancho (mm)', { exact: true }).fill('100');
  await page.getByLabel(/^Alto \(mm\)/).fill('100');
  await expect(page.getByRole('button', { name: 'Registrar recepción' })).toBeDisabled();
  await page.getByLabel('Fotografías de llegada').setInputFiles({
    name: 'arrival.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(page.getByRole('list', { name: 'Fotografías adjuntas' })).toContainText(
    'arrival.png',
  );
  await page.getByRole('button', { name: 'Registrar recepción' }).click();
  await expect(page.getByRole('alert')).toContainText('Indica el casillero');
  await expect(page.getByLabel(/^Peso \(g\)/)).toHaveValue('1000');
  await expect(page.getByRole('list', { name: 'Fotografías adjuntas' })).toContainText(
    'arrival.png',
  );
  await page.getByLabel('Casillero de la etiqueta (opcional)').fill('PE00042');
  await page.getByRole('button', { name: 'Registrar recepción' }).click();
  await expect(page.getByRole('heading', { name: 'Recepción registrada' })).toBeVisible();
  expect(writes.at(-1)?.body).toMatchObject({
    warehouse_code: 'USA-01',
    carrier_tracking: 'TRACK-42',
    locker_code: 'PE00042',
    weight_g: 1000,
    length_mm: 200,
    width_mm: 100,
    height_mm: 100,
    photo_document_ids: ['arrival-photo'],
  });
  await expect(page.getByLabel(/^Peso \(g\)/)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Registrar recepción' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cambiar a modo oscuro' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath('receiving-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'Identificar propietario', exact: true }).click();
  await expect(page).toHaveURL(/unidentified\?package_id=received-package/);
  await page.getByLabel('Casillero del cliente').fill('PE00042');
  await page.getByRole('button', { name: 'Buscar cliente' }).click();
  await expect(page.getByRole('button', { name: 'Asignar paquete al cliente' })).toBeVisible();
  await page.getByLabel('Casillero del cliente').fill('PE00043');
  await expect(page.getByRole('button', { name: 'Asignar paquete al cliente' })).toHaveCount(0);
  await page.getByLabel('Casillero del cliente').fill('PE00042');
  await page.getByRole('button', { name: 'Buscar cliente' }).click();
  await page.getByRole('button', { name: 'Asignar paquete al cliente' }).click();
  await expect(page.getByRole('status')).toContainText(`WR-000042 asignado a ${customer.name}`);
  expect(writes.at(-1)).toEqual({
    path: '/packages/received-package/assign',
    body: { customer_id: customer.id },
  });
  expect(writes.filter((w) => w.path === '/documents')).toHaveLength(1);
  await expect(
    page.getByRole('heading', { name: 'No hay paquetes pendientes de identificar' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
