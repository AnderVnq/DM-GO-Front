import { test, expect, type Page } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';
const mid = '11111111-1111-4111-8111-111111111111';
const cid = '22222222-2222-4222-8222-222222222222';
async function operations(
  page: Page,
  options: { role?: string; openConsolidation?: boolean; conflict?: boolean } = {},
) {
  await mockPanel(page, options.role ?? 'supervisor');
  let mawb = {
    id: mid,
    number: '001-12345675',
    flight_number: 'LA2471',
    origin: 'MIA',
    destination: 'LIM',
    departure_at: '2026-11-17T23:30:00-05:00',
    status: 'open',
    dispatched_at: undefined as string | undefined,
    consolidation_ids: [] as string[],
  };
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const manifests: string[] = [];
  await page.route('**/api/v1/mawbs**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET')
      return route.fulfill({ json: path === '/api/v1/mawbs' ? { mawbs: [mawb], total: 1 } : mawb });
    const body = request.postDataJSON() as Record<string, unknown>;
    writes.push({ path, body });
    if (path.endsWith('/dispatch')) {
      mawb = { ...mawb, status: 'closed', dispatched_at: '2026-11-18T04:30:00Z' };
      if (options.conflict)
        return route.fulfill({ status: 409, json: { detail: 'La MAWB ya fue despachada' } });
      return route.fulfill({ json: { mawb, packages_in_transit: 7 } });
    }
    if (path.endsWith('/consolidations')) mawb = { ...mawb, consolidation_ids: [cid] };
    return route.fulfill({ json: mawb });
  });
  await page.route('**/api/v1/consolidations?**', (route) =>
    route.fulfill({
      json: {
        consolidations: [{ id: cid, code: 'Y-2026-42', warehouse_code: 'USA-01', bulk_count: 1 }],
        total: 1,
      },
    }),
  );
  await page.route(`**/api/v1/consolidations/${cid}**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/manifest')) {
      manifests.push(url.search);
      if (url.searchParams.get('format') === 'csv')
        return route.fulfill({
          contentType: 'text/csv; charset=utf-8',
          body: 'hawb,packages\nH-42,2\nTOTAL,2\n',
        });
      return route.fulfill({
        json: {
          consolidation: 'Y-2026-42',
          mawb: mawb.consolidation_ids.length ? mawb.number : '',
          rows: [
            {
              hawb: 'H-42',
              customer_name: 'Cliente del manifiesto',
              customer_doc_type: 'dni',
              customer_doc_number: '70000042',
              packages: 2,
              weight_g: 1200,
              weight_kg: '1.200',
              real_lb: 3,
              volumetric_lb: 5,
              billable_lb: 5,
              billable_kg: '2.268',
              declared_value_cents: 12500,
              descriptions: ['Audífonos', 'Libro'],
            },
          ],
          totals: {
            hawbs: 1,
            packages: 2,
            weight_g: 1200,
            weight_kg: '1.200',
            real_lb: 3,
            volumetric_lb: 5,
            billable_lb: 5,
            billable_kg: '2.268',
            declared_value_cents: 12500,
          },
        },
      });
    }
    return route.fulfill({
      json: {
        id: cid,
        code: 'Y-2026-42',
        warehouse_code: 'USA-01',
        status: options.openConsolidation ? 'open' : 'closed',
      },
    });
  });
  return { writes, manifests };
}
async function createFlight(page: Page) {
  await page.getByRole('button', { name: 'Nueva MAWB', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva MAWB', exact: true });
  await expect(dialog.getByRole('button', { name: 'Crear MAWB', exact: true })).toBeDisabled();
  await dialog.getByLabel('Número MAWB', { exact: true }).fill('001-12345675');
  await dialog.getByLabel('Número de vuelo', { exact: true }).fill('la2471');
  await dialog.getByLabel('Aeropuerto de origen', { exact: true }).fill('mia');
  await dialog.getByLabel('Aeropuerto de destino', { exact: true }).fill('lim');
  await dialog
    .getByLabel('Salida prevista · hora de Perú', { exact: true })
    .fill('2026-11-17T23:30');
  await dialog.getByLabel('Número MAWB', { exact: true }).fill('001-12345670');
  await expect(dialog.getByLabel('Número MAWB', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(dialog.getByRole('button', { name: 'Crear MAWB', exact: true })).toBeDisabled();
  await dialog.getByLabel('Número MAWB', { exact: true }).fill('001-12345675');
  await dialog.getByRole('button', { name: 'Crear MAWB', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function inspect(page: Page) {
  await page.getByRole('button', { name: 'Revisar Y-2026-42', exact: true }).click();
}
test('crea la guía aérea, revisa el manifiesto y confirma la salida con el resultado del backend', async ({
  page,
}, info) => {
  const { writes } = await operations(page);
  await login(page);
  await navigate(page, 'Operación aérea', 'airfreight');
  await createFlight(page);
  expect(writes[0]?.body).toEqual({
    number: '001-12345675',
    flight_number: 'LA2471',
    origin: 'MIA',
    destination: 'LIM',
    departure_at: '2026-11-17T23:30:00-05:00',
  });
  await expect(page).toHaveURL(new RegExp(`mawb_id=${mid}`));
  await expect(page.getByRole('button', { name: 'Registrar salida', exact: true })).toBeDisabled();
  await inspect(page);
  await expect(page.getByText('Cliente del manifiesto', { exact: true })).toBeVisible();
  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar manifiesto CSV', exact: true }).click();
  expect((await csv).suggestedFilename()).toBe('manifest-Y-2026-42.csv');
  await page.getByRole('button', { name: 'Asociar a 001-12345675', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Asociar a 001-12345675', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Registrar salida', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Registrar salida del vuelo', exact: true });
  await confirm.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(writes.filter((write) => write.path.endsWith('/dispatch'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Registrar salida', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirmar salida', exact: true }).click();
  await expect(confirm).not.toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Salida registrada. 7 paquetes en tránsito.');
  await expect(
    page
      .getByRole('dialog', { name: 'Detalle de la guía aérea', exact: true })
      .getByText('Despachada', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '001-12345675', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Registrar salida', exact: true })).toHaveCount(0);
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Detalle de la guía aérea', exact: true }),
    ).not.toBeVisible();
    await page.getByRole('button', { name: /Cambiar a modo oscuro/ }).click();
    await page.getByRole('button', { name: 'Ver 001-12345675', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  }
  await page.screenshot({
    path: info.outputPath('airfreight.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('no admite un consolidado abierto y conserva el vuelo consultado', async ({ page }) => {
  const { manifests, writes } = await operations(page, { openConsolidation: true });
  await login(page);
  await navigate(page, 'Operación aérea', 'airfreight');
  await createFlight(page);
  await inspect(page);
  await expect(
    page.getByText('Cierra el consolidado antes de asociarlo a una MAWB.', { exact: true }),
  ).toBeVisible();
  expect(manifests).toHaveLength(0);
  expect(writes.filter((write) => write.path.endsWith('/consolidations'))).toHaveLength(0);
  await expect(page.getByRole('heading', { name: '001-12345675', exact: true })).toBeVisible();
});
test('un conflicto al despachar actualiza la MAWB sin anunciar una salida exitosa', async ({
  page,
}) => {
  await operations(page, { conflict: true });
  await login(page);
  await navigate(page, 'Operación aérea', 'airfreight');
  await createFlight(page);
  await inspect(page);
  await page.getByRole('button', { name: 'Asociar a 001-12345675', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar salida', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Confirmar salida', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('La MAWB ya fue despachada');
  await expect(
    dialog.getByRole('button', { name: 'Confirmar salida', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('status')).toHaveCount(0);
});
test('ventas no ve ni puede abrir el módulo aéreo', async ({ page }) => {
  const { writes } = await operations(page, { role: 'seller' });
  await login(page);
  await expect(
    page.getByRole('heading', { name: 'Resumen de la operación', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Operación aérea', exact: true })).toHaveCount(0);
  await page.goto('/internal/airfreight');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Acceso restringido', exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});
