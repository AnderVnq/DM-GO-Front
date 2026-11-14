import { test, expect, type Page } from '@playwright/test';
import { mockPortal, loginPortal, navigatePortal } from './fixtures/portal';

async function coordination(page: Page) {
  const { customer } = await mockPortal(page, 'existing');
  const writes: { path: string; body: Record<string, unknown> | null }[] = [];
  const consent =
    'Declaro que cuento con la autorización de esta persona para usar sus datos personales y su documento como consignatario de mis importaciones.';
  let pack = {
    id: 'own-package',
    customer_id: customer.id,
    mode: 'courier',
    status: 'IN_TRANSIT',
    store: '',
    carrier_tracking: 'TRACK-42',
    description: 'Audífonos',
    declared_value_cents: 10000,
    has_invoice: true,
    created_at: '2026-11-13T12:00:00Z',
    delivery_method: 'pickup',
    delivery_address_id: '',
    delivery_agency_id: '',
    delivery_agency_branch_id: '',
    failed_attempts: 0,
    home_delivery_allowed: false,
  };
  const consignees = [
    {
      id: 'self',
      name: 'Cliente de prueba',
      doc_type: 'dni',
      doc_number: '70000042',
      verified: true,
      relationship: 'self',
      phone: '',
      email: '',
      created_at: pack.created_at,
    },
  ];
  const usage = {
    year: 2026,
    doc_type: 'dni',
    doc_number: '70000042',
    locked: 1,
    pending: 0,
    limit: 3,
    remaining: 2,
  };
  let attempts = 0;
  await page.route(
    /\/api\/v1\/portal\/(me|packages|agencies|consignees|notifications)(\/.*)?$/,
    async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace('/api/v1/portal/', '');
      expect(req.headers()['authorization']).toMatch(/^Bearer /);
      const body = req.postData() ? (req.postDataJSON() as Record<string, unknown>) : null;
      if (req.method() !== 'GET') writes.push({ path, body });
      if (path === 'me')
        return route.fulfill({
          json: {
            ...customer,
            addresses: [
              {
                id: 'own-address',
                ubigeo: '130101',
                line: 'Calle de prueba 42',
                reference: 'Puerta azul',
                primary: true,
              },
            ],
          },
        });
      if (path === 'packages')
        return route.fulfill({
          json: {
            packages: [
              pack,
              { ...pack, id: 'exhausted', carrier_tracking: 'TRACK-OLD', failed_attempts: 2 },
            ],
          },
        });
      if (path === 'agencies')
        return route.fulfill({
          json: {
            agencies: [
              {
                id: 'agency-a',
                name: 'Agencia A',
                branches: [
                  { id: 'branch-a', name: 'Trujillo', address: 'Sede A', ubigeo: '130101' },
                ],
              },
              {
                id: 'agency-b',
                name: 'Agencia B',
                branches: [{ id: 'branch-b', name: 'Lima', address: 'Sede B', ubigeo: '150101' }],
              },
            ],
          },
        });
      if (path === 'packages/own-package/delivery') {
        pack = {
          ...pack,
          delivery_method: String(body?.['method']),
          delivery_address_id: String(body?.['address_id']),
          delivery_agency_id: String(body?.['agency_id']),
          delivery_agency_branch_id: String(body?.['branch_id']),
        };
        return route.fulfill({ json: pack });
      }
      if (path === 'consignees' && req.method() === 'GET')
        return route.fulfill({ json: { consignees, consent_text: consent } });
      if (path === 'consignees' && req.method() === 'POST') {
        consignees.push({
          ...consignees[0]!,
          ...body,
          id: 'family',
          name: 'Familiar verificado',
          relationship: 'family',
        });
        return route.fulfill({ status: 201, json: consignees.at(-1) });
      }
      if (path.endsWith('/usage')) return route.fulfill({ json: usage });
      if (path === 'packages/own-package/consignee') {
        attempts++;
        return attempts === 1
          ? route.fulfill({
              status: 409,
              json: {
                code: 'limit_reached',
                detail:
                  'El destinatario llegó a su límite; elige otro o pide autorización a un supervisor.',
                usage: { ...usage, remaining: 0 },
              },
            })
          : route.fulfill({ json: { ...usage, pending: 1, remaining: 1 } });
      }
      if (path === 'consignees/family' && req.method() === 'DELETE')
        return route.fulfill({ status: 204 });
      if (path === 'notifications')
        return route.fulfill({
          json: {
            notifications: [
              {
                id: 'notice-1',
                subject: 'Paquete en camino',
                body: 'Tu paquete está en tránsito.\nConsulta su seguimiento.',
                kind: 'package.status_changed',
                link: 'http://localhost:3000/packages/own-package',
                created_at: pack.created_at,
              },
              {
                id: 'notice-2',
                subject: 'Aviso informativo',
                body: '<script>Este texto se muestra sin ejecutar HTML.</script>',
                kind: 'info',
                link: 'https://example.com/packages/own-package',
                created_at: pack.created_at,
              },
            ],
          },
        });
      return route.fulfill({ status: 404, json: {} });
    },
  );
  return { writes, consent };
}

test('entrega propia: dirección, cambio de agencia y restricción de intentos', async ({
  page,
}, info) => {
  const { writes } = await coordination(page);
  await loginPortal(page);
  await navigatePortal(page, 'Mis entregas');
  await page.getByLabel('Forma de entrega').selectOption('home');
  await page
    .getByRole('combobox', { name: 'Dirección de entrega', exact: true })
    .selectOption('own-address');
  await page.getByRole('button', { name: 'Guardar preferencia' }).click();
  await expect(page.getByRole('status')).toContainText('Preferencia de entrega guardada');
  expect(writes.at(-1)?.body).toEqual({
    method: 'home',
    address_id: 'own-address',
    agency_id: '',
    branch_id: '',
  });
  await page.getByLabel('Forma de entrega').selectOption('agency_pickup');
  await page.getByRole('combobox', { name: 'Agencia', exact: true }).selectOption('agency-a');
  await page.getByLabel('Sucursal de destino').selectOption('branch-a');
  await page.getByRole('combobox', { name: 'Agencia', exact: true }).selectOption('agency-b');
  await expect(page.getByLabel('Sucursal de destino')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Guardar preferencia' })).toBeDisabled();
  await page.getByLabel('Sucursal de destino').selectOption('branch-b');
  await page.getByRole('button', { name: 'Guardar preferencia' }).click();
  await expect(page.getByRole('status')).toContainText('Preferencia de entrega guardada');
  expect(writes.at(-1)?.body).toEqual({
    method: 'agency_pickup',
    address_id: '',
    agency_id: 'agency-b',
    branch_id: 'branch-b',
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('delivery-light.png'), fullPage: true });
  await page.getByRole('button', { name: /Cambiar a modo oscuro/ }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath('delivery-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('combobox', { name: 'Paquete', exact: true }).selectOption('exhausted');
  await expect(
    page.getByRole('option', { name: 'Entrega a domicilio', exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('libreta con autorización, asignación recuperable y avisos con enlace seguro', async ({
  page,
}, info) => {
  const { writes, consent } = await coordination(page);
  await loginPortal(page);
  await navigatePortal(page, 'Mis destinatarios');
  await page.getByText('Añadir destinatario', { exact: true }).click();
  await page.getByLabel('Número de documento').fill('70000043');
  await expect(page.getByRole('button', { name: 'Guardar destinatario' })).toBeDisabled();
  await page.getByLabel(consent, { exact: true }).check();
  await page.getByRole('button', { name: 'Guardar destinatario' }).click();
  await expect(page.getByRole('heading', { name: 'Familiar verificado' })).toBeVisible();
  expect(writes.at(-1)?.body).toMatchObject({
    doc_type: 'dni',
    doc_number: '70000043',
    relationship: 'family',
    consent: true,
    name: '',
  });
  await page.getByLabel('Paquete para asignar').selectOption('own-package');
  await page.getByRole('button', { name: 'Asignar destinatario' }).click();
  await expect(page.getByRole('alert')).toContainText('llegó a su límite');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Asignar destinatario' })).toBeEnabled();
  await page.getByRole('button', { name: 'Asignar destinatario' }).click();
  await expect(page.getByRole('status')).toContainText('Destinatario asignado a TRACK-42');
  expect(writes.at(-1)).toEqual({
    path: 'packages/own-package/consignee',
    body: { consignee_id: 'family' },
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('consignees.png'), fullPage: true });
  await page.getByRole('button', { name: 'Quitar de mi libreta' }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(writes.some((w) => w.path === 'consignees/family')).toBe(false);
  await page.getByRole('button', { name: 'Quitar de mi libreta' }).click();
  await page.getByRole('button', { name: 'Confirmar baja' }).click();
  await expect(page.getByRole('status')).toContainText('Destinatario quitado');
  await navigatePortal(page, 'Mis avisos');
  await expect(page.getByRole('link', { name: 'Ver paquete', exact: true })).toHaveAttribute(
    'href',
    '/portal/packages?package_id=own-package',
  );
  await page.getByRole('button', { name: /Aviso informativo/ }).click();
  await expect(page.locator('.notice-body')).toContainText('<script>');
  await expect(page.getByRole('link', { name: 'Ver paquete', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('notifications.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
