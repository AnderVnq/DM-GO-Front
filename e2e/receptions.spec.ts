import { test, expect, type Page } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';
import type { Reception } from '../src/app/modules/receptions/reception.model';
const mid = '11111111-1111-4111-8111-111111111111';
const rid = '33333333-3333-4333-8333-333333333333';
async function setup(
  page: Page,
  failure: 'read' | 'ambiguous' | 'parse' | '' = '',
  role = 'supervisor',
) {
  await mockPanel(page, role);
  const writes: Record<string, unknown>[] = [];
  let failRead = false;
  let session: Reception = {
    id: rid,
    mawb_id: mid,
    mawb_number: '001-12345675',
    warehouse_code: 'LIM-01',
    status: 'open',
    opened_at: '2026-11-17T15:00:00Z',
    closed_at: null,
    scans: [],
    result: null,
  };
  await page.route('**/api/v1/warehouses**', (route) =>
    route.fulfill({
      json: {
        warehouses: [
          { code: 'USA-01', name: 'Miami', country: 'US', active: true },
          { code: 'LIM-01', name: 'Lima', country: 'PE', active: true },
          { code: 'LIM-OLD', name: 'Cerrado', country: 'PE', active: false },
        ],
      },
    }),
  );
  await page.route('**/api/v1/mawbs?**', (route) =>
    route.fulfill({
      json: { mawbs: [{ id: mid, number: '001-12345675', flight_number: 'LA2471' }], total: 1 },
    }),
  );
  await page.route('**/api/v1/mawbs/**', (route) =>
    route.fulfill({
      json: {
        id: mid,
        number: '001-12345675',
        status: 'closed',
        flight_number: 'LA2471',
        origin: 'MIA',
        destination: 'LIM',
      },
    }),
  );
  await page.route('**/api/v1/receptions**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (req.method() === 'GET') {
      if (path === '/api/v1/receptions')
        return route.fulfill({ json: { receptions: [], total: 0 } });
      if (failRead) {
        failRead = false;
        return route.fulfill({
          status: 503,
          json: { detail: 'Lectura temporalmente no disponible' },
        });
      }
      return route.fulfill({ json: session });
    }
    const body = req.postDataJSON() as Record<string, unknown>;
    writes.push({ path, ...body });
    if (path.endsWith('/scans')) {
      const code = String(body['code']),
        pieces = Number(body['pieces']);
      const saved = session.scans.find((s) => s.code === code);
      const scan = {
        code,
        pieces: body['replace'] ? pieces : (saved?.pieces ?? 0) + pieces,
        note: String(body['note']),
        scanned_at: '2026-11-17T16:00:00Z',
      };
      session = { ...session, scans: [...session.scans.filter((s) => s.code !== code), scan] };
      if (failure === 'read') failRead = true;
      if (failure === 'parse')
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{invalid' });
      if (failure === 'ambiguous')
        return route.fulfill({
          status: 500,
          json: { detail: 'No se pudo confirmar la respuesta' },
        });
      return route.fulfill({
        json: {
          code,
          pieces: scan.pieces,
          in_mawb: code === 'H-42',
          known_package: code === 'H-42',
        },
      });
    }
    if (path.endsWith('/close'))
      session = {
        ...session,
        status: 'closed',
        closed_at: '2026-11-17T17:00:00Z',
        result: {
          complete: [{ PackageID: 'p1', Guide: 'H-42', WR: 'WR-42', Status: 'IN_TRANSIT' }],
          different: [
            { PackageID: 'p2', Guide: 'H-DIFF', WR: 'WR-DIFF', Status: 'IN_TRANSIT', received: 2 },
          ],
          missing: [
            { PackageID: 'p3', Guide: 'H-MISSING', WR: 'WR-MISSING', Status: 'IN_TRANSIT' },
          ],
          extra: [
            {
              Code: 'UNKNOWN',
              PackageID: '',
              Pieces: 1,
              ScannedAt: '2026-11-17T16:00:00Z',
              Note: '',
            },
          ],
        },
      };
    return route.fulfill({ json: session });
  });
  return writes;
}
async function open(page: Page) {
  await login(page);
  await navigate(page, 'Recepción en Lima', 'receptions');
  await page.getByRole('button', { name: 'Nueva recepción', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva recepción', exact: true });
  await dialog.getByRole('button', { name: 'Seleccionar 001-12345675', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '001-12345675', exact: true })).toBeVisible();
  await expect(dialog.getByRole('option')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Abrir sesión', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('Guía o WR', { exact: true })).toBeFocused();
}
async function scan(page: Page, code = 'H-42') {
  await page.getByLabel('Guía o WR', { exact: true }).fill(code);
  await page.getByLabel('Guía o WR', { exact: true }).press('Enter');
}
test('escanea, corrige con lápiz y cierra con el cuadre canónico', async ({ page }, info) => {
  const writes = await setup(page);
  await open(page);
  expect(writes[0]).toMatchObject({ mawb_id: mid, warehouse_code: 'LIM-01' });
  await scan(page);
  await expect(
    page.getByRole('button', { name: 'Corregir escaneo H-42', exact: true }),
  ).toBeEnabled();
  await scan(page);
  await expect(
    page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'H-42', exact: true }) })
      .getByRole('cell', { name: '2', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Corregir escaneo H-42', exact: true }).click();
  const correction = page.getByRole('dialog', { name: 'Corregir escaneo', exact: true });
  await expect(
    correction.getByRole('button', { name: 'Guardar cambios', exact: true }),
  ).toBeDisabled();
  await correction.getByLabel('Cantidad final de piezas', { exact: true }).fill('3');
  await correction.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(writes.filter((w) => w['replace'])).toHaveLength(0);
  await page.getByRole('button', { name: 'Corregir escaneo H-42', exact: true }).click();
  await correction.getByLabel('Cantidad final de piezas', { exact: true }).fill('0');
  await correction.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(correction).not.toBeVisible();
  expect(writes.at(-1)).toMatchObject({ code: 'H-42', pieces: 0, replace: true });
  await expect(page.getByLabel('Guía o WR', { exact: true })).toBeEnabled();
  await scan(page, 'UNKNOWN');
  await expect(page.getByText(/Código no identificado; quedará/)).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar recepción', exact: true }).click();
  const close = page.getByRole('dialog', { name: 'Cerrar recepción', exact: true });
  await close.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(writes.filter((w) => String(w['path']).endsWith('/close'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Cerrar recepción', exact: true }).click();
  await close.getByRole('button', { name: 'Confirmar cierre', exact: true }).click();
  await expect(close).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Cuadre de recepción', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'MAWB 001-12345675', exact: true })).toBeFocused();
  for (const title of ['Completos · 1', 'Con diferencias · 1', 'Faltantes · 1', 'Sobrantes · 1'])
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByLabel('Guía o WR', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Continuar en Aduanas', exact: true }),
  ).toHaveAttribute('href', '/internal/customs');
  if (info.project.name === 'desktop')
    await page.getByRole('button', { name: /Cambiar a modo oscuro/ }).click();
  await page.screenshot({
    path: info.outputPath('reception.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
for (const failure of ['read', 'ambiguous', 'parse'] as const)
  test(`no repite escaneos ante fallo ${failure}`, async ({ page }) => {
    const writes = await setup(page, failure);
    await open(page);
    await scan(page);
    await expect(
      page.getByRole('alert').filter({
        hasText:
          failure === 'read'
            ? 'Lectura temporalmente'
            : failure === 'ambiguous'
              ? 'No se pudo confirmar la respuesta'
              : '',
      }),
    ).toBeVisible();
    await expect(page.getByLabel('Guía o WR', { exact: true })).toBeDisabled();
    expect(writes.filter((w) => String(w['path']).endsWith('/scans'))).toHaveLength(1);
    if (failure === 'read')
      await page.getByRole('button', { name: 'Actualizar recepción', exact: true }).click();
    else
      await page
        .getByRole('button', { name: 'Revisé el historial; continuar', exact: true })
        .click();
    await expect(page.getByLabel('Guía o WR', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Guía o WR', { exact: true })).toHaveValue('');
    expect(writes.filter((w) => String(w['path']).endsWith('/scans'))).toHaveLength(1);
  });
test('ventas no accede a recepción', async ({ page }) => {
  const writes = await setup(page, '', 'seller');
  await login(page);
  await expect(
    page.getByRole('heading', { name: 'Resumen de la operación', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Recepción en Lima', exact: true })).toHaveCount(0);
  await page.goto('/internal/receptions');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Acceso restringido', exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});
