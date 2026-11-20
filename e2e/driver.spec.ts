import { test, expect, type Page } from '@playwright/test';
import { login, mockPanel } from './fixtures/panel';
import type { DeliveryRoute } from '../src/app/modules/delivery/delivery-route.model';
const rid = '55555555-5555-4555-8555-555555555555',
  pid = '66666666-6666-4666-8666-666666666666';
async function setup(
  page: Page,
  options: { role?: string; agency?: boolean; conflict?: boolean; planned?: boolean } = {},
) {
  await mockPanel(page, options.role ?? 'driver');
  let route: DeliveryRoute = {
    id: rid,
    code: 'RT-42',
    driver_id: 'staff-test',
    driver_name: 'Repartidor de prueba',
    date: '2026-11-17',
    warehouse_code: 'LIM-01',
    status: options.planned ? 'planned' : 'in_progress',
    stops: [
      {
        id: 'stop-test',
        seq: 1,
        status: 'pending',
        kind: options.agency ? 'agency' : 'customer',
        recipient_name: options.agency ? 'Agencia de prueba' : 'Cliente de prueba',
        recipient_phone: '999999999',
        ubigeo: '150101',
        address: 'Av. Prueba 42',
        district: { code: '150131', name: 'San Isidro', province: 'Lima', department: 'Lima' },
        location: { lat: -12.09, lng: -77.03, precision: 'address' },
        navigation_url: 'https://www.google.com/maps/dir/?api=1&destination=-12.09,-77.03',
        reference: 'Puerta principal',
        packages: [
          { package_id: pid, result: 'pending' },
          { package_id: 'resolved-package', result: 'delivered' },
        ],
      },
    ],
  };
  const calls: string[] = [],
    writes: { path: string; body: Record<string, unknown> }[] = [],
    storage: { method: string; auth: string | undefined }[] = [];
  let uploadCount = 0;
  await page.route('**/api/v1/documents', (r) =>
    r.fulfill({ status: 403, json: { detail: 'El repartidor debe usar subida directa' } }),
  );
  await page.route('**/api/v1/documents/uploads', (r) => {
    uploadCount++;
    return r.fulfill({
      json: {
        upload_id: `up${uploadCount}`,
        method: 'PUT',
        url: `https://storage.example.test/up${uploadCount}`,
        headers: { 'Content-Type': r.request().postDataJSON().mime_type },
        expires_at: '2026-12-01T00:00:00Z',
      },
    });
  });
  await page.route('https://storage.example.test/**', (r) => {
    storage.push({ method: r.request().method(), auth: r.request().headers()['authorization'] });
    return r.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    });
  });
  await page.route('**/api/v1/documents/uploads/*/complete', (r) =>
    r.fulfill({
      json: {
        id: `doc-${new URL(r.request().url()).pathname.split('/').at(-2)}`,
        mime_type: 'image/jpeg',
        original_name: 'evidencia',
        size: 4,
      },
    }),
  );
  await page.route('**/api/v1/driver/**', async (r) => {
    const req = r.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith('/me')) {
      calls.push('profile');
      return r.fulfill({
        json: { id: 'staff-test', name: 'Repartidor de prueba', email: 'driver@example.test' },
      });
    }
    if (path.endsWith('/routes')) {
      calls.push('routes');
      return r.fulfill({ json: { routes: [route] } });
    }
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>;
      writes.push({ path, body });
      const result = path.endsWith('/deliver') ? 'delivered' : 'failed';
      route = {
        ...route,
        stops: route.stops.map((stop) => ({
          ...stop,
          status: result,
          packages: stop.packages.map((pkg) =>
            pkg.package_id === pid
              ? {
                  ...pkg,
                  result,
                  fail_reason: result === 'failed' ? String(body['reason']) : undefined,
                  resolved_at: '2026-11-17T22:00:00Z',
                }
              : pkg,
          ),
        })),
      };
      if (options.conflict)
        return r.fulfill({
          status: 409,
          json: { detail: 'Esos paquetes de la parada ya fueron resueltos' },
        });
      return r.fulfill({ json: route.stops[0] });
    }
    return r.fulfill({ status: 404 });
  });
  return { calls, writes, storage };
}
async function enter(page: Page) {
  await login(page);
  await expect(page).toHaveURL(/\/driver(?:\?|$)/);
  await page.getByRole('button', { name: 'Abrir ruta RT-42', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ruta RT-42', exact: true })).toBeVisible();
}
async function receiver(modal: ReturnType<Page['getByRole']>) {
  await modal.getByLabel('Nombre de quien recibe', { exact: true }).fill(' Ana Pérez ');
  await modal.getByLabel('Número de documento', { exact: true }).fill('46027897');
}
async function photo(modal: ReturnType<Page['getByRole']>) {
  await modal
    .getByLabel('Fotos o videos', { exact: true })
    .setInputFiles({ name: 'entrega.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('photo') });
}
async function location(page: Page, modal: ReturnType<Page['getByRole']>) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: -12.05, longitude: -77.03, accuracy: 10 });
  await modal.getByRole('button', { name: 'Obtener ubicación', exact: true }).click();
  await expect(modal.getByRole('status').filter({ hasText: 'Ubicación obtenida' })).toBeVisible();
}
test('repartidor accede a sus rutas y entrega con receptor, GPS y foto por enlace firmado', async ({
  page,
}, info) => {
  const { calls, writes, storage } = await setup(page);
  await enter(page);
  expect(calls.slice(0, 2)).toEqual(['profile', 'routes']);
  await page.getByRole('button', { name: 'Registrar entrega', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Registrar entrega', exact: true });
  await expect(modal.getByRole('checkbox')).toHaveCount(1);
  await expect(
    modal.getByRole('button', { name: 'Confirmar entrega', exact: true }),
  ).toBeDisabled();
  await receiver(modal);
  await photo(modal);
  await location(page, modal);
  await modal.getByRole('button', { name: 'Confirmar entrega', exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(writes[0]?.body).toEqual({
    package_ids: [pid],
    evidence_document_ids: ['doc-up1'],
    latitude: -12.05,
    longitude: -77.03,
    receiver: { name: 'Ana Pérez', doc_type: 'dni', doc_number: '46027897' },
  });
  expect(storage.filter((s) => s.method === 'PUT')).toHaveLength(1);
  expect(storage.every((s) => !s.auth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Registrar entrega', exact: true })).toHaveCount(0);
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: /Cambiar a modo oscuro/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  }
  await page.screenshot({
    path: info.outputPath('driver-delivery.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('agencia requiere su guía y admite video con subida directa', async ({ page }) => {
  const { writes, storage } = await setup(page, { agency: true });
  await enter(page);
  await page.getByRole('button', { name: 'Registrar entrega', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Registrar entrega', exact: true });
  await receiver(modal);
  await location(page, modal);
  await modal
    .getByLabel('Fotos o videos', { exact: true })
    .setInputFiles({ name: 'entrega.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') });
  await expect(
    modal.getByRole('button', { name: 'Confirmar entrega', exact: true }),
  ).toBeDisabled();
  await modal.getByLabel('Número de guía de la agencia', { exact: true }).fill(' AG-42 ');
  await modal.getByRole('button', { name: 'Confirmar entrega', exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(writes[0]?.body['agency_guide_number']).toBe('AG-42');
  expect(storage.filter((s) => s.method === 'PUT')).toHaveLength(1);
});
test('intento fallido no exige GPS ni evidencia y nunca envía selección vacía', async ({
  page,
}) => {
  const { writes } = await setup(page);
  await enter(page);
  await page.getByRole('button', { name: 'Registrar intento fallido', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Registrar intento fallido', exact: true });
  await modal.getByLabel('Motivo del intento fallido', { exact: true }).fill(' Ausente ');
  await modal.getByRole('checkbox').uncheck();
  await expect(
    modal.getByRole('button', { name: 'Confirmar intento fallido', exact: true }),
  ).toBeDisabled();
  await modal.getByRole('checkbox').check();
  await modal.getByRole('button', { name: 'Confirmar intento fallido', exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(writes[0]?.body).toEqual({
    package_ids: [pid],
    evidence_document_ids: [],
    reason: 'Ausente',
  });
});
test('conflicto actualiza paquetes sin perder el motivo ni repetir el POST', async ({ page }) => {
  const { writes } = await setup(page, { conflict: true });
  await enter(page);
  await page.getByRole('button', { name: 'Registrar intento fallido', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Registrar intento fallido', exact: true });
  await modal.getByLabel('Motivo del intento fallido', { exact: true }).fill('Ausente');
  await modal.getByRole('button', { name: 'Confirmar intento fallido', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('ya fueron resueltos');
  await expect(modal.getByRole('checkbox')).toHaveCount(0);
  await expect(modal.getByLabel('Motivo del intento fallido', { exact: true })).toHaveValue(
    'Ausente',
  );
  await expect(
    modal.getByRole('button', { name: 'Confirmar intento fallido', exact: true }),
  ).toBeDisabled();
  expect(writes).toHaveLength(1);
});
test('GPS denegado y PDF rechazado no permiten entregar', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, fail: (error: { code: number }) => void) =>
          fail({ code: 1 }),
      },
    }),
  );
  await enter(page);
  await page.getByRole('button', { name: 'Registrar entrega', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Registrar entrega', exact: true });
  await receiver(modal);
  await modal.getByLabel('Fotos o videos', { exact: true }).setInputFiles({
    name: 'factura.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF'),
  });
  await expect(modal.getByRole('alert')).toContainText('fotos JPG');
  await photo(modal);
  await modal.getByRole('button', { name: 'Obtener ubicación', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Permite el acceso');
  await expect(
    modal.getByRole('button', { name: 'Confirmar entrega', exact: true }),
  ).toBeDisabled();
});
test('rutas planificadas no permiten entregas', async ({ page }) => {
  await setup(page, { planned: true });
  await enter(page);
  await expect(page.getByText('Esta ruta aún no salió.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar entrega', exact: true })).toHaveCount(0);
});
test('ventas no puede abrir el área del repartidor', async ({ page }) => {
  const { calls } = await setup(page, { role: 'seller' });
  await login(page);
  await expect(
    page.getByRole('heading', { name: 'Resumen de la operación', exact: true }),
  ).toBeVisible();
  await page.goto('/driver');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Acceso restringido', exact: true }),
  ).toBeVisible();
  expect(calls).toHaveLength(0);
});

test('muestra mapa, distrito y navegación de la parada sin geocodificar la dirección', async ({
  page,
}, info) => {
  await setup(page);
  await enter(page);
  await expect(page.getByRole('heading', { name: 'Ruta RT-42', exact: true })).toBeVisible();
  await expect(page.getByText('San Isidro · Lima · Lima', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cómo llegar', exact: true })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/dir/?api=1&destination=-12.09,-77.03',
  );
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Punto de dirección registrado.', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('driver-map.png'), fullPage: true });
});
