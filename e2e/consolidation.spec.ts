import { test, expect, type Page } from '@playwright/test';
import { mockPanel, login, navigate } from './fixtures/panel';
import type { Bulk, Consolidation } from '../src/app/modules/consolidation/consolidation.model';
import type { Package } from '../src/app/modules/shipments/package.model';

const bulkId = '11111111-1111-4111-8111-111111111111';
const consolidationId = '22222222-2222-4222-8222-222222222222';
async function logistics(page: Page, role = 'supervisor', failClose = false) {
  const fixture = await mockPanel(page, role);
  const calls: { path: string; method: string; body: Record<string, unknown> | null }[] = [];
  const stamp = '2026-11-13T12:00:00Z';
  let bulk: Bulk = {
    id: bulkId,
    code: 'BLK-000042',
    warehouse_code: 'USA-01',
    status: 'open',
    package_ids: [],
    created_at: stamp,
  };
  let consolidation: Consolidation = {
    id: consolidationId,
    code: 'Y-42',
    warehouse_code: 'USA-01',
    status: 'open',
    bulk_ids: [],
    hawbs: [],
    created_at: stamp,
  };
  let pack: Package = {
    id: 'package-test',
    customer_id: fixture.customer.id,
    mode: 'courier',
    status: 'RECEIVED_USA',
    carrier_tracking: 'TRACK-42',
    description: 'Audífonos',
    store: '',
    declared_value_cents: 10000,
    has_invoice: true,
    invoice_document_id: 'invoice-test',
    created_at: stamp,
    receipt: {
      number: 'WR-000042',
      warehouse_id: 'wh-test',
      weight_g: 1000,
      weight_kg: '1.00',
      dimensions_mm: [200, 100, 100],
      received_at: stamp,
    },
  };
  let failed = false;
  await page.route(
    /\/api\/v1\/(warehouses|bulks(?:\/.*)?|consolidations(?:\/.*)?|packages(?:\/package-test)?)(?:\?.*)?$/,
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname.replace('/api/v1', '');
      expect(req.headers()['authorization']).toMatch(/^Bearer /);
      const body = req.postData() ? (req.postDataJSON() as Record<string, unknown>) : null;
      calls.push({ path, method: req.method(), body });
      if (path === '/warehouses')
        return route.fulfill({
          json: {
            warehouses: [
              { id: 'wh-test', code: 'USA-01', name: 'Miami', country: 'US', active: true },
            ],
          },
        });
      if (path === '/packages') {
        expect(url.searchParams.get('customer_id')).toBe(fixture.customer.id);
        return route.fulfill({
          json: {
            packages: [
              pack,
              { ...pack, id: 'missing-invoice', description: 'Sin factura', has_invoice: false },
            ],
          },
        });
      }
      if (path === '/packages/package-test') return route.fulfill({ json: pack });
      if (path === '/bulks' && req.method() === 'POST') {
        expect(body).toEqual({ warehouse_code: 'USA-01' });
        return route.fulfill({ status: 201, json: bulk });
      }
      if (path === `/bulks/${bulkId}`) return route.fulfill({ json: bulk });
      if (path === `/bulks/${bulkId}/packages`) {
        bulk = { ...bulk, package_ids: ['package-test'] };
        pack = { ...pack, status: 'CONSOLIDATED' };
        return route.fulfill({ json: bulk });
      }
      if (path.endsWith('/remove')) {
        expect(body?.['reason']).toBeTruthy();
        bulk = { ...bulk, package_ids: [] };
        pack = { ...pack, status: 'RECEIVED_USA' };
        return route.fulfill({ json: bulk });
      }
      if (path === `/bulks/${bulkId}/close`) {
        bulk = {
          ...bulk,
          status: 'closed',
          seal: String(body?.['seal']),
          weight_g: Number(body?.['weight_g']),
          dimensions_mm: [
            Number(body?.['length_mm']),
            Number(body?.['width_mm']),
            Number(body?.['height_mm']),
          ],
          closed_at: stamp,
        };
        return route.fulfill({ json: bulk });
      }
      if (path.endsWith('/label.pdf'))
        return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' });
      if (path === '/consolidations' && req.method() === 'POST')
        return route.fulfill({ status: 201, json: consolidation });
      if (path === `/consolidations/${consolidationId}`)
        return route.fulfill({ json: consolidation });
      if (path === `/consolidations/${consolidationId}/bulks`) {
        consolidation = { ...consolidation, bulk_ids: [bulkId] };
        bulk = { ...bulk, consolidation_id: consolidationId };
        return route.fulfill({ json: consolidation });
      }
      if (path === `/consolidations/${consolidationId}/close`) {
        if (failClose && !failed) {
          failed = true;
          return route.fulfill({
            status: 409,
            json: {
              code: 'limit_reached',
              detail: 'Revisa el consignatario del paquete antes de emitir su guía.',
            },
          });
        }
        consolidation = {
          ...consolidation,
          status: 'closed',
          closed_at: stamp,
          hawbs: [
            {
              id: 'hawb-test',
              number: 'Y00042',
              customer_id: fixture.customer.id,
              package_ids: ['package-test'],
            },
          ],
        };
        return route.fulfill({ json: consolidation });
      }
      return route.fulfill({ status: 404, json: { code: 'not_found', detail: 'No existe.' } });
    },
  );
  return { calls, customer: fixture.customer };
}

async function filledBulk(page: Page) {
  await page.getByRole('button', { name: 'Crear bulto', exact: true }).click();
  await page.getByLabel('Casillero del cliente').fill('PE00042');
  await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
  await expect(page.getByRole('option', { name: /Sin factura/ })).toBeDisabled();
  await page
    .getByRole('combobox', { name: 'Paquete para añadir', exact: true })
    .selectOption('package-test');
  await page.getByRole('button', { name: 'Añadir al bulto', exact: true }).click();
  await expect(page.locator('.alert.success[role="status"]')).toContainText(
    'Paquete añadido al bulto',
  );
}
async function closeBulk(page: Page) {
  await page.getByLabel('Número de precinto', { exact: true }).fill('SEAL-42');
  await page.getByLabel('Peso final (g)', { exact: true }).fill('1500');
  await page.getByLabel('Largo final (mm)', { exact: true }).fill('300');
  await page.getByLabel('Ancho final (mm)', { exact: true }).fill('200');
  await page.getByLabel('Alto final (mm)', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Revisar cierre del bulto' }).click();
  await expect(page.getByRole('dialog')).toContainText('SEAL-42');
  await page.getByRole('button', { name: 'Confirmar cierre del bulto', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bulto cerrado', exact: true })).toBeVisible();
}

test('flujo físico: bulto, retiro con motivo, precinto y guías del consolidado', async ({
  page,
}, info) => {
  const { calls } = await logistics(page, 'supervisor', true);
  await login(page);
  await navigate(page, 'Bultos', 'bulks');
  await filledBulk(page);
  await page.getByRole('button', { name: 'Retirar paquete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar retiro' })).toBeDisabled();
  await page.getByLabel('Motivo del retiro').fill('Corregir el embalaje');
  await page.getByRole('button', { name: 'Confirmar retiro' }).click();
  await expect(page.locator('.alert.success[role="status"]')).toContainText('Paquete retirado');
  await page
    .getByRole('combobox', { name: 'Paquete para añadir', exact: true })
    .selectOption('package-test');
  await page.getByRole('button', { name: 'Añadir al bulto', exact: true }).click();
  await expect(page.locator('.alert.success[role="status"]')).toContainText('Paquete añadido');
  await closeBulk(page);
  const closed = calls.find((call) => call.path === `/bulks/${bulkId}/close`);
  expect(closed?.body).toEqual({
    seal: 'SEAL-42',
    weight_g: 1500,
    length_mm: 300,
    width_mm: 200,
    height_mm: 200,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar etiqueta PDF' }).click();
  expect((await download).suggestedFilename()).toBe('BLK-000042.pdf');
  await page.getByRole('button', { name: 'Cambiar a modo oscuro' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath('bulk-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'Preparar consolidado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'BLK-000042', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Crear consolidado', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir bulto al consolidado' }).click();
  await expect(page.locator('.alert.success[role="status"]')).toContainText('Bulto añadido');
  await page.getByRole('button', { name: 'Revisar cierre y generar guías' }).click();
  await expect(page.getByRole('dialog')).toContainText('Se emitirán las guías HAWB');
  await page.getByRole('button', { name: 'Cerrar y generar guías HAWB' }).click();
  await expect(page.getByRole('alert')).toContainText('Revisa el consignatario');
  await expect(page.getByRole('heading', { name: 'Guías HAWB emitidas' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Revisar cierre y generar guías' }).click();
  await page.getByRole('button', { name: 'Cerrar y generar guías HAWB' }).click();
  await expect(page.getByRole('heading', { name: 'Guías HAWB emitidas' })).toBeVisible();
  await expect(page.getByText('Y00042', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revisar cierre y generar guías' })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath('consolidation-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('referencias: retoma enlace conocido y descarta selecciones al cambiar búsqueda', async ({
  page,
}) => {
  const { calls } = await logistics(page);
  await login(page);
  await navigate(page, 'Bultos', 'bulks');
  await filledBulk(page);
  await page.getByLabel('Casillero del cliente').fill('PE00043');
  await expect(page.getByRole('combobox', { name: 'Paquete para añadir' })).toHaveCount(0);
  await page
    .getByLabel('Referencia o enlace del bulto')
    .fill(`https://example.com/internal/bulks?bulk_id=${bulkId}`);
  const before = calls.length;
  await page.getByRole('button', { name: 'Abrir bulto', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Pega la referencia');
  expect(calls).toHaveLength(before);
  await page
    .getByLabel('Referencia o enlace del bulto')
    .fill(`http://localhost:3000/internal/bulks?bulk_id=${bulkId}`);
  await page.getByRole('button', { name: 'Abrir bulto', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'BLK-000042', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retirar paquete', exact: true })).toBeVisible();
});

test('ventas no accede a bultos ni consolidados', async ({ page }) => {
  const { calls } = await logistics(page, 'seller');
  await login(page);
  await expect(page.locator('app-internal-shell')).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Abrir navegación' });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.getByRole('link', { name: 'Bultos', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Consolidados', exact: true })).toHaveCount(0);
  await page.goto(`/internal/bulks?bulk_id=${bulkId}`);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/forbidden$/);
  expect(
    calls.filter(
      (call) => call.path.startsWith('/bulks') || call.path.startsWith('/consolidations'),
    ),
  ).toEqual([]);
});
