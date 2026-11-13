import { test, expect, type Page } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';

async function openNotes(page: Page) {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  await navigate(page, 'Notas de salida', 'dispatch-notes');
}

const addresses = [
  {
    id: 'address-test',
    ubigeo: '150101',
    line: 'Dirección de prueba 42',
    reference: '',
    primary: true,
  },
];
const agencies = [
  {
    id: 'agency-test',
    name: 'Agencia de prueba',
    active: true,
    branches: [{ id: 'branch-test', name: 'Sucursal de prueba', active: true }],
  },
  {
    id: 'agency-other',
    name: 'Otra agencia',
    active: true,
    branches: [{ id: 'branch-other', name: 'Otra sucursal', active: true }],
  },
];

test('conserva la dirección existente al abrir y guardar el destino', async ({ page }) => {
  const fixture = await mockPanel(page, 'supervisor', {
    customer: { addresses },
    note: { method: 'home', address_id: 'address-test' },
  });
  await openNotes(page);
  await page.getByRole('button', { name: 'Cambiar destino', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Dirección', exact: true })).toHaveValue(
    'address-test',
  );
  await dialog.getByRole('button', { name: 'Guardar destino', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(fixture.requests.filter((r) => r.path.endsWith('/destination'))).toEqual([
    {
      path: '/dispatch-notes/note-test/destination',
      method: 'PUT',
      body: { method: 'home', address_id: 'address-test', agency_id: '', branch_id: '' },
    },
  ]);
});

test('conserva agencia y sucursal y exige elegir otra sucursal al cambiar de agencia', async ({
  page,
}) => {
  const fixture = await mockPanel(page, 'supervisor', {
    agencies,
    note: { method: 'agency_pickup', agency_id: 'agency-test', branch_id: 'branch-test' },
  });
  await openNotes(page);
  await page.getByRole('button', { name: 'Cambiar destino', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Agencia', exact: true })).toHaveValue(
    'agency-test',
  );
  await expect(dialog.getByRole('combobox', { name: 'Sucursal', exact: true })).toHaveValue(
    'branch-test',
  );
  await dialog.getByRole('combobox', { name: 'Agencia', exact: true }).selectOption('agency-other');
  await expect(dialog.getByRole('combobox', { name: 'Sucursal', exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Guardar destino', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Completa los datos del destino.');
  expect(fixture.requests.filter((r) => r.path.endsWith('/destination'))).toHaveLength(0);
  await dialog
    .getByRole('combobox', { name: 'Sucursal', exact: true })
    .selectOption('branch-other');
  await dialog.getByRole('button', { name: 'Guardar destino', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(fixture.requests.find((r) => r.path.endsWith('/destination'))?.body).toMatchObject({
    agency_id: 'agency-other',
    branch_id: 'branch-other',
  });
});

test('impide cantidades fraccionarias y registra un cargo con centavos enteros', async ({
  page,
}) => {
  const fixture = await mockPanel(page);
  await openNotes(page);
  await page.getByRole('button', { name: 'Añadir cargo', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Cargo', exact: true }).selectOption('HANDLING_TEST');
  await dialog.getByLabel('Cantidad', { exact: true }).fill('2.5');
  await expect(dialog.getByRole('button', { name: 'Añadir cargo', exact: true })).toBeDisabled();
  await dialog.getByLabel('Cantidad', { exact: true }).fill('9007199254740992');
  await expect(dialog.getByRole('button', { name: 'Añadir cargo', exact: true })).toBeDisabled();
  await dialog.getByLabel('Cantidad', { exact: true }).fill('2');
  await dialog.getByLabel('Tarifa en USD (opcional)', { exact: true }).fill('1.25');
  await dialog.getByRole('button', { name: 'Añadir cargo', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.inspector')).toContainText('Manipulación de prueba');
  expect(
    fixture.requests.filter((r) => r.path.endsWith('/charges') && r.method === 'POST'),
  ).toEqual([
    {
      path: '/dispatch-notes/note-test/charges',
      method: 'POST',
      body: { code: 'HANDLING_TEST', package_id: '', quantity: 2, rate_cents: 125 },
    },
  ]);
});

test('actualiza la tarifa y muestra los importes devueltos por el servidor', async ({ page }) => {
  const fixture = await mockPanel(page, 'supervisor', {
    note: {
      lines: [
        {
          id: 'line-test',
          charge_code: 'HANDLING_TEST',
          charge_name: 'Manipulación de prueba',
          calc: 'per_unit',
          rate_cents: 125,
          quantity: 2,
          amount_cents: 250,
          applies: true,
          manual: true,
        },
      ],
    },
  });
  await openNotes(page);
  await page.getByRole('button', { name: 'Tarifa', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Tarifa en USD', { exact: true })).toHaveValue('1.25');
  await dialog.getByLabel('Tarifa en USD', { exact: true }).fill('3.50');
  await dialog.getByRole('button', { name: 'Guardar tarifa', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.inspector')).toContainText('USD 7.00');
  expect(fixture.requests.find((r) => r.path.endsWith('/charges/line-test'))).toEqual({
    path: '/dispatch-notes/note-test/charges/line-test',
    method: 'PATCH',
    body: { rate_cents: 350 },
  });
});

test('añade y retira una guía del borrador sin alterar la selección del cliente', async ({
  page,
}) => {
  const fixture = await mockPanel(page);
  await openNotes(page);
  await page.getByRole('button', { name: 'Añadir paquetes', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(dialog).toContainText('No hay más paquetes disponibles');
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.locator('.inspector')).toContainText('HAWB-TEST-42');
  await page.getByRole('button', { name: 'Retirar', exact: true }).click();
  await expect(page.locator('.inspector')).not.toContainText('HAWB-TEST-42');
  expect(
    fixture.requests.filter((r) => r.path.includes('/dispatch-notes/note-test/packages')),
  ).toEqual([
    {
      path: '/dispatch-notes/note-test/packages',
      method: 'POST',
      body: { package_id: 'package-test' },
    },
    { path: '/dispatch-notes/note-test/packages/package-test', method: 'DELETE', body: null },
  ]);
});
