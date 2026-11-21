import { test, expect, type Page } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';
import type { TransitAgency } from '../src/app/modules/delivery/agency.model';
const aid = '88888888-8888-4888-8888-888888888888';
async function setup(
  page: Page,
  options: { role?: string; duplicate?: boolean; branchUncertain?: boolean } = {},
) {
  const role = options.role ?? 'admin';
  await mockPanel(page, role);
  let items: TransitAgency[] = [
    {
      id: aid,
      code: 'COURIER',
      name: 'Courier de prueba',
      dropoff_ubigeo: '150101',
      dropoff_address: 'Av. Lima 42',
      active: true,
      branches: [
        {
          id: 'b1',
          name: 'Sucursal activa',
          ubigeo: '010101',
          address: 'Calle Destino 1',
          active: true,
        },
        {
          id: 'b2',
          name: 'Sucursal antigua',
          ubigeo: '040101',
          address: 'Calle Antigua 1',
          active: false,
        },
      ],
    },
    {
      id: 'inactive',
      code: 'INACTIVA',
      name: 'Agencia inactiva',
      dropoff_ubigeo: '150101',
      dropoff_address: 'Av. Antigua 1',
      active: false,
      branches: [],
    },
  ];
  const writes: { path: string; body: Record<string, unknown> }[] = [],
    queries: string[] = [];
  await page.route('**/api/v1/agencies**', async (r) => {
    const req = r.request(),
      u = new URL(req.url()),
      path = u.pathname;
    if (req.method() === 'GET') {
      queries.push(u.search);
      const all = u.searchParams.get('all') === 'true';
      return r.fulfill({
        json: {
          agencies: items
            .filter((a) => all || a.active)
            .map((a) => ({ ...a, branches: a.branches.filter((b) => all || b.active) })),
        },
      });
    }
    const body = req.postDataJSON() as Record<string, unknown>;
    writes.push({ path, body });
    if (role !== 'admin')
      return r.fulfill({ status: 403, json: { detail: 'Solo administración' } });
    if (path.endsWith('/branches')) {
      const branch = {
        id: 'created-branch',
        name: String(body['name']),
        ubigeo: String(body['ubigeo']),
        address: String(body['address']),
        active: true,
      };
      items = items.map((a) => (a.id === aid ? { ...a, branches: [...a.branches, branch] } : a));
      if (options.branchUncertain)
        return r.fulfill({
          status: 500,
          json: { detail: 'Respuesta temporalmente no disponible' },
        });
      return r.fulfill({ json: branch });
    }
    if (options.duplicate)
      return r.fulfill({ status: 409, json: { detail: 'Ya existe una agencia con ese código' } });
    const agency = {
      id: 'created-agency',
      code: String(body['code']),
      name: String(body['name']),
      dropoff_ubigeo: String(body['dropoff_ubigeo']),
      dropoff_address: String(body['dropoff_address']),
      active: true,
      branches: [],
    };
    items.push(agency);
    return r.fulfill({ json: agency });
  });
  return { writes, queries };
}
async function enter(page: Page) {
  await login(page);
  await navigate(page, 'Agencias', 'agencies');
  await expect(
    page.getByRole('heading', { name: 'Catálogo de agencias', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Ver agencia Courier de prueba', exact: true }),
  ).toBeEnabled();
}
async function closeDetail(page: Page) {
  const modal = page.getByRole('dialog', { name: 'Detalle de la agencia', exact: true });
  if (await modal.isVisible()) {
    await modal.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
    await expect(modal).not.toBeVisible();
  }
}
async function select(page: Page) {
  await closeDetail(page);
  await page.getByRole('button', { name: 'Ver agencia Courier de prueba', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Courier de prueba', exact: true })).toBeVisible();
}
async function agencyForm(page: Page) {
  await page.getByRole('button', { name: 'Nueva agencia', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Nueva agencia', exact: true });
  await modal.getByLabel('Código de agencia', { exact: true }).fill(' new_co ');
  await modal.getByLabel('Nombre de agencia', { exact: true }).fill(' Nueva agencia ');
  await modal
    .getByLabel('Dirección del counter en Lima', { exact: true })
    .fill(' Av. Counter 100 ');
  await modal.getByLabel('Ubigeo del counter', { exact: true }).fill('150101');
  return modal;
}
async function branchForm(page: Page) {
  await page.getByRole('button', { name: 'Nueva sucursal', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Nueva sucursal de destino', exact: true });
  await modal.getByLabel('Nombre de sucursal', { exact: true }).fill(' Destino Nuevo ');
  await modal
    .getByLabel('Dirección de recojo en destino', { exact: true })
    .fill(' Calle Destino 42 ');
  await modal.getByLabel('Ubigeo de destino', { exact: true }).fill('010101');
  return modal;
}
test('admin crea agencia y sucursal distinguiendo counter y destino', async ({ page }, info) => {
  const { writes } = await setup(page);
  await enter(page);
  const agency = await agencyForm(page);
  await agency.getByRole('button', { name: 'Crear agencia', exact: true }).click();
  await expect(agency).not.toBeVisible();
  expect(writes[0]?.body).toEqual({
    code: 'NEW_CO',
    name: 'Nueva agencia',
    dropoff_ubigeo: '150101',
    dropoff_address: 'Av. Counter 100',
  });
  await expect(page.getByRole('heading', { name: 'Nueva agencia', exact: true })).toBeVisible();
  await select(page);
  const branch = await branchForm(page);
  await branch.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(writes.filter((w) => w.path.endsWith('/branches'))).toHaveLength(0);
  await branchForm(page);
  await branch.getByRole('button', { name: 'Crear sucursal', exact: true }).click();
  await expect(branch).not.toBeVisible();
  expect(writes.at(-1)?.body).toEqual({
    name: 'Destino Nuevo',
    ubigeo: '010101',
    address: 'Calle Destino 42',
  });
  await expect(page.getByRole('cell', { name: 'Destino Nuevo', exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`agency_id=${aid}`));
  if (info.project.name === 'desktop') {
    await closeDetail(page);
    await page.getByRole('button', { name: /Cambiar a modo oscuro/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await select(page);
  }
  await page.screenshot({
    path: info.outputPath('agency-catalog.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('filtro completo consulta inactivas y sus sucursales sin perder ceros del ubigeo', async ({
  page,
}) => {
  const { queries } = await setup(page);
  await enter(page);
  await select(page);
  await expect(page.getByRole('cell', { name: 'Sucursal antigua', exact: true })).toHaveCount(0);
  await closeDetail(page);
  await page.getByLabel('Incluir inactivas', { exact: true }).check();
  await expect(
    page.getByRole('button', { name: 'Ver agencia Agencia inactiva', exact: true }),
  ).toBeVisible();
  await select(page);
  await expect(page.getByRole('cell', { name: 'Sucursal antigua', exact: true })).toBeVisible();
  expect(queries).toContain('?all=true');
  await expect(page.getByRole('cell', { name: '010101', exact: true })).toBeVisible();
  await closeDetail(page);
  await page.getByLabel('Buscar en el catálogo cargado', { exact: true }).fill('INACTIVA');
  await expect(
    page.getByRole('button', { name: 'Ver agencia Courier de prueba', exact: true }),
  ).toHaveCount(0);
});
test('ventas consulta sin botones de alta', async ({ page }) => {
  const { writes } = await setup(page, { role: 'seller' });
  await enter(page);
  await expect(page.getByRole('button', { name: 'Nueva agencia', exact: true })).toHaveCount(0);
  await select(page);
  await expect(page.getByRole('button', { name: 'Nueva sucursal', exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(0);
});
test('código duplicado conserva borrador y no habilita el mismo payload', async ({ page }) => {
  const { writes } = await setup(page, { duplicate: true });
  await enter(page);
  const modal = await agencyForm(page);
  await modal.getByRole('button', { name: 'Crear agencia', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Ya existe');
  await expect(modal.getByLabel('Nombre de agencia', { exact: true })).toHaveValue(
    ' Nueva agencia ',
  );
  await expect(modal.getByRole('button', { name: 'Crear agencia', exact: true })).toBeDisabled();
  await modal.getByLabel('Código de agencia', { exact: true }).fill('OTHER_CODE');
  await expect(modal.getByRole('button', { name: 'Crear agencia', exact: true })).toBeEnabled();
  expect(writes).toHaveLength(1);
});
test('respuesta incierta de sucursal bloquea reintento y permite revisar catálogo', async ({
  page,
}) => {
  const { writes } = await setup(page, { branchUncertain: true });
  await enter(page);
  await select(page);
  const modal = await branchForm(page);
  await modal.getByRole('button', { name: 'Crear sucursal', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('puede haberse creado');
  await expect(modal.getByRole('button', { name: 'Crear sucursal', exact: true })).toBeDisabled();
  await expect(modal.getByLabel('Nombre de sucursal', { exact: true })).toHaveValue(
    ' Destino Nuevo ',
  );
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Destino Nuevo', exact: true })).toBeVisible();
  expect(writes.filter((w) => w.path.endsWith('/branches'))).toHaveLength(1);
});
