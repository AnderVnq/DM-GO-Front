import { test, expect, type Page } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';
import type { DeliveryRoute } from '../src/app/modules/delivery/delivery-route.model';
const rid = '55555555-5555-4555-8555-555555555555',
  pid = '66666666-6666-4666-8666-666666666666';
async function setup(
  page: Page,
  options: {
    role?: string;
    readFailure?: boolean;
    conflict?: boolean;
    createUncertain?: boolean;
    failConflict?: boolean;
  } = {},
) {
  await mockPanel(page, options.role ?? 'supervisor');
  let created = false,
    failRead = false;
  let route: DeliveryRoute = {
    id: rid,
    code: 'RT-42',
    driver_id: 'driver-test',
    driver_name: 'Repartidor de prueba',
    date: '2026-11-17',
    warehouse_code: 'LIM-01',
    status: 'planned',
    stops: [],
  };
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const dates: string[] = [];
  await page.route('**/api/v1/drivers', (r) =>
    r.fulfill({
      json: {
        drivers: [
          {
            id: 'driver-test',
            name: 'Repartidor de prueba',
            email: 'driver@example.test',
            last_seen_at: '2026-11-17T15:00:00Z',
          },
        ],
      },
    }),
  );
  await page.route('**/api/v1/warehouses**', (r) =>
    r.fulfill({
      json: {
        warehouses: [
          { code: 'USA-01', name: 'Miami', country: 'US', active: true },
          { code: 'LIM-01', name: 'Lima', country: 'PE', active: true },
          { code: 'LIM-OLD', name: 'Inactivo', country: 'PE', active: false },
        ],
      },
    }),
  );
  await page.route(`**/api/v1/packages/${pid}`, (r) =>
    r.fulfill({
      json: {
        id: pid,
        customer_id: 'c1',
        carrier_tracking: 'HAWB-42',
        description: 'Audífonos',
        locker_code: 'PE00042',
        status: 'RELEASED',
        delivery_method: 'home',
        failed_attempts: 0,
      },
    }),
  );
  await page.route('**/api/v1/routes**', async (r) => {
    const req = r.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (req.method() === 'GET') {
      if (path.endsWith('/routes')) {
        dates.push(url.searchParams.get('date') ?? '');
        return r.fulfill({
          json: { routes: created && url.searchParams.get('date') === route.date ? [route] : [] },
        });
      }
      if (failRead) {
        failRead = false;
        return r.fulfill({ status: 503, json: { detail: 'Detalle temporalmente no disponible' } });
      }
      return r.fulfill({ json: route });
    }
    const body = req.postDataJSON() as Record<string, unknown>;
    writes.push({ path, body });
    if (path.endsWith('/routes')) {
      created = true;
      route = { ...route, date: String(body['date']) };
      if (options.createUncertain)
        return r.fulfill({ status: 500, json: { detail: 'Respuesta no confirmada' } });
    }
    if (path.endsWith('/stops'))
      route = {
        ...route,
        stops: [
          {
            id: 'stop-test',
            seq: 1,
            status: 'pending',
            kind: 'customer',
            recipient_name: 'Cliente de prueba',
            recipient_phone: '999999999',
            ubigeo: '150101',
            address: 'Av. Prueba 42',
            reference: 'Puerta principal',
            packages: [{ package_id: pid, result: 'pending' }],
          },
        ],
      };
    if (path.endsWith('/start')) {
      route = { ...route, status: 'in_progress', started_at: '2026-11-17T15:00:00Z' };
      if (options.conflict)
        return r.fulfill({ status: 409, json: { detail: 'La ruta ya fue iniciada' } });
    }
    if (path.endsWith('/complete'))
      route = { ...route, status: 'completed', completed_at: '2026-11-17T18:00:00Z' };
    return r.fulfill({ json: route });
  });
  await page.route('**/api/v1/route-stops/*/fail', (r) => {
    const body = r.request().postDataJSON();
    writes.push({ path: new URL(r.request().url()).pathname, body });
    route = {
      ...route,
      stops: route.stops.map((s) => ({
        ...s,
        status: 'failed',
        packages: s.packages.map((p) => ({
          ...p,
          result: 'failed',
          fail_reason: body.reason,
          resolved_at: '2026-11-17T17:00:00Z',
        })),
      })),
    };
    failRead = !!options.readFailure;
    if (options.failConflict)
      return r.fulfill({
        status: 409,
        json: { detail: 'Esos paquetes de la parada ya fueron resueltos' },
      });
    return r.fulfill({ json: route.stops[0] });
  });
  return { writes, dates };
}
async function enter(page: Page) {
  await login(page);
  await navigate(page, 'Rutas de reparto', 'delivery-routes');
  await expect(page.getByRole('heading', { name: 'Rutas por fecha', exact: true })).toBeVisible();
}
async function create(page: Page) {
  await page.getByRole('button', { name: 'Nueva ruta', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Nueva ruta de reparto', exact: true });
  await modal.getByLabel('Fecha de la nueva ruta', { exact: true }).fill('2026-11-17');
  await modal.getByLabel('Repartidor', { exact: true }).selectOption('driver-test');
  await expect(
    modal.getByLabel('Almacén de salida en Perú', { exact: true }).getByRole('option'),
  ).toHaveCount(2);
  await modal.getByRole('button', { name: 'Crear ruta', exact: true }).click();
  return modal;
}
async function assigned(page: Page) {
  await page.route('**/api/v1/packages?**', (route) =>
    route.fulfill({
      json: {
        packages: [
          {
            id: pid,
            carrier_tracking: 'TRACK-ROUTE',
            locker_code: 'PE00042',
            description: 'Contenido para reparto',
          },
        ],
        total: 1,
      },
    }),
  );
  await create(page);
  await expect(page.getByRole('heading', { name: 'Ruta RT-42', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Seleccionar TRACK-ROUTE', exact: true }).click();
  await expect(page.getByText('Audífonos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Asignar a RT-42', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Parada 1 · Cliente de prueba', exact: true }),
  ).toBeVisible();
}
async function start(page: Page) {
  await page.getByRole('button', { name: 'Iniciar reparto', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Iniciar reparto', exact: true })
    .getByRole('button', { name: 'Confirmar salida', exact: true })
    .click();
}
async function fail(page: Page) {
  await page.getByRole('button', { name: 'Registrar no entregados', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Registrar no entregados', exact: true });
  await modal.getByLabel('Motivo de no entrega', { exact: true }).fill(' Destinatario ausente ');
  await modal.getByRole('button', { name: 'Confirmar no entregados', exact: true }).click();
}
test('crea, asigna, inicia, registra fallidos y finaliza con estado del servidor', async ({
  page,
}, info) => {
  const { writes, dates } = await setup(page);
  await enter(page);
  await assigned(page);
  expect(writes[0]?.body).toEqual({
    date: '2026-11-17',
    driver_id: 'driver-test',
    warehouse_code: 'LIM-01',
  });
  expect(writes[1]?.body).toEqual({ package_id: pid });
  expect(dates).toContain('2026-11-17');
  await page.getByRole('button', { name: 'Iniciar reparto', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Iniciar reparto', exact: true });
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(writes.filter((w) => w.path.endsWith('/start'))).toHaveLength(0);
  await start(page);
  await expect(page.getByRole('button', { name: 'Finalizar ruta', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Registrar no entregados', exact: true }).click();
  const failure = page.getByRole('dialog', { name: 'Registrar no entregados', exact: true });
  await expect(
    failure.getByRole('button', { name: 'Confirmar no entregados', exact: true }),
  ).toBeDisabled();
  await failure.getByRole('checkbox').uncheck();
  await failure.getByLabel('Motivo de no entrega', { exact: true }).fill('Ausente');
  await expect(
    failure.getByRole('button', { name: 'Confirmar no entregados', exact: true }),
  ).toBeDisabled();
  await failure.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await fail(page);
  expect(writes.at(-1)?.body).toEqual({ package_ids: [pid], reason: 'Destinatario ausente' });
  await expect(page.getByRole('button', { name: 'Finalizar ruta', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Finalizar ruta', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Finalizar ruta', exact: true })
    .getByRole('button', { name: 'Confirmar cierre', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Ruta finalizada');
  await expect(page.getByRole('button', { name: 'Finalizar ruta', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`route_id=${rid}`));
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: /Cambiar a modo oscuro/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  }
  await page.screenshot({
    path: info.outputPath('delivery-route.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('no repite no entregados si falla la lectura posterior', async ({ page }) => {
  const { writes } = await setup(page, { readFailure: true });
  await enter(page);
  await assigned(page);
  await start(page);
  await fail(page);
  await expect(page.getByRole('alert').filter({ hasText: 'Detalle temporalmente' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finalizar ruta', exact: true })).toBeDisabled();
  expect(writes.filter((w) => w.path.endsWith('/fail'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Actualizar detalle de ruta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Finalizar ruta', exact: true })).toBeEnabled();
  expect(writes.filter((w) => w.path.endsWith('/fail'))).toHaveLength(1);
});
test('actualiza un conflicto de salida sin éxito falso', async ({ page }) => {
  await setup(page, { conflict: true });
  await enter(page);
  await assigned(page);
  await start(page);
  const modal = page.getByRole('dialog', { name: 'Iniciar reparto', exact: true });
  await expect(modal.getByRole('alert')).toContainText('ya fue iniciada');
  await expect(modal.getByRole('button', { name: 'Confirmar salida', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toHaveCount(0);
});
test('apertura incierta obliga a revisar el listado antes de crear otra ruta', async ({ page }) => {
  const { writes } = await setup(page, { createUncertain: true });
  await enter(page);
  const modal = await create(page);
  await expect(modal.getByRole('alert')).toContainText('puede haberse creado');
  await expect(modal.getByRole('button', { name: 'Crear ruta', exact: true })).toBeDisabled();
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver ruta RT-42', exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
});
test('ventas no ve ni puede abrir rutas de reparto', async ({ page }) => {
  const { writes } = await setup(page, { role: 'seller' });
  await login(page);
  await expect(
    page.getByRole('heading', { name: 'Resumen de la operación', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Rutas de reparto', exact: true })).toHaveCount(0);
  await page.goto('/internal/delivery-routes');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Acceso restringido', exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});

test('actualiza el modal tras conflicto sin perder el motivo', async ({ page }) => {
  await setup(page, { failConflict: true });
  await enter(page);
  await assigned(page);
  await start(page);
  await fail(page);
  const modal = page.getByRole('dialog', { name: 'Registrar no entregados', exact: true });
  await expect(modal.getByRole('checkbox')).toHaveCount(0);
  await expect(modal.getByLabel('Motivo de no entrega', { exact: true })).toHaveValue(
    ' Destinatario ausente ',
  );
  await expect(modal.getByRole('status')).toContainText('se retiraron de la selección');
  await expect(
    modal.getByRole('button', { name: 'Confirmar no entregados', exact: true }),
  ).toBeDisabled();
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Finalizar ruta', exact: true })).toBeEnabled();
});
