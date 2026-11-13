import { test, expect, type Page } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';

async function openCustomers(page: Page) {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  await navigate(page, 'Clientes', 'customers');
}

async function fillRegistration(page: Page) {
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Número de documento', { exact: true }).fill('70000043');
  await dialog.getByLabel('Nombre o razón social', { exact: true }).fill('Cliente registrado');
  await dialog.getByLabel('Correo electrónico', { exact: true }).fill('nuevo@example.test');
  await dialog.getByLabel('Teléfono', { exact: true }).fill('999000043');
  return dialog;
}

async function findCustomer(page: Page) {
  await page.getByLabel('Casillero o documento', { exact: true }).fill('PE00042');
  await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cliente de prueba', exact: true })).toBeVisible();
}

test('registra un cliente y conserva el casillero e identificador asignados por la API', async ({
  page,
}) => {
  const fixture = await mockPanel(page);
  await openCustomers(page);
  await page.route('**/api/v1/customers?locker_code=UNKNOWN', (route) =>
    route.fulfill({ status: 404, json: { detail: 'El cliente no existe' } }),
  );
  await page.getByLabel('Casillero o documento', { exact: true }).fill('UNKNOWN');
  await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('El cliente no existe');
  const dialog = await fillRegistration(page);
  await dialog.getByRole('button', { name: 'Registrar cliente', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Cliente registrado', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Casillero PE00043', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page).toHaveURL(/\/customers\?id=created-customer-test$/);
  expect(fixture.requests.filter((r) => r.path === '/customers' && r.method === 'POST')).toEqual([
    {
      path: '/customers',
      method: 'POST',
      body: {
        doc_type: 'dni',
        doc_number: '70000043',
        name: 'Cliente registrado',
        email: 'nuevo@example.test',
        phone: '999000043',
      },
    },
  ]);
});

test('actualiza el contacto sin cambiar de cliente ni de casillero', async ({ page }) => {
  const fixture = await mockPanel(page);
  await openCustomers(page);
  await findCustomer(page);
  await page
    .getByRole('textbox', { name: 'Correo electrónico', exact: true })
    .fill('actualizado@example.test');
  await page.getByRole('textbox', { name: 'Teléfono', exact: true }).fill('999000044');
  await page.getByRole('button', { name: 'Guardar contacto', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Datos de contacto actualizados.');
  await expect(page.getByRole('textbox', { name: 'Correo electrónico', exact: true })).toHaveValue(
    'actualizado@example.test',
  );
  await expect(page.getByRole('link', { name: 'Ver paquetes', exact: true })).toHaveAttribute(
    'href',
    '/internal/packages?customer_id=customer-test',
  );
  expect(fixture.requests.find((r) => r.path.endsWith('/contact'))).toEqual({
    path: '/customers/customer-test/contact',
    method: 'PATCH',
    body: { email: 'actualizado@example.test', phone: '999000044' },
  });
});

test('asocia el error de documento al campo y permite corregir sin perder datos', async ({
  page,
}, testInfo) => {
  await mockPanel(page);
  let attempts = 0;
  await page.route('**/api/v1/customers', async (route) => {
    if (route.request().method() !== 'POST' || ++attempts > 1) return route.fallback();
    await route.fulfill({
      status: 422,
      json: {
        detail: 'Datos del cliente inválidos',
        errors: { document: 'Documento no encontrado en el registro oficial.' },
      },
    });
  });
  await openCustomers(page);
  const dialog = await fillRegistration(page);
  await dialog.getByRole('button', { name: 'Registrar cliente', exact: true }).click();
  const number = dialog.getByRole('textbox', { name: 'Número de documento', exact: true });
  await expect(number).toHaveAttribute('aria-invalid', 'true');
  await page.screenshot({ path: testInfo.outputPath('registration-errors.png'), fullPage: true });
  await expect(number).toHaveAccessibleDescription(
    'Documento no encontrado en el registro oficial.',
  );
  await expect(dialog.getByLabel('Nombre o razón social', { exact: true })).toHaveValue(
    'Cliente registrado',
  );
  await number.fill('70000044');
  await expect(number).not.toHaveAttribute('aria-invalid', 'true');
  await dialog.getByRole('button', { name: 'Registrar cliente', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Cliente registrado', exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(2);
});

test('muestra el error de teléfono junto al contacto y conserva las entradas', async ({ page }) => {
  await mockPanel(page);
  await page.route('**/api/v1/customers/customer-test/contact', (route) =>
    route.fulfill({
      status: 422,
      json: { detail: 'Datos del cliente inválidos', errors: { phone: 'Entre 7 y 15 dígitos.' } },
    }),
  );
  await openCustomers(page);
  await findCustomer(page);
  const phone = page.getByRole('textbox', { name: 'Teléfono', exact: true });
  await phone.fill('123');
  await page.getByRole('button', { name: 'Guardar contacto', exact: true }).click();
  await expect(phone).toHaveAccessibleDescription('Entre 7 y 15 dígitos.');
  await expect(phone).toHaveValue('123');
  await expect(page.getByRole('status')).toHaveCount(0);
  await phone.fill('999000044');
  await expect(phone).not.toHaveAttribute('aria-invalid', 'true');
});

test('un documento duplicado conserva el formulario y no indica registro exitoso', async ({
  page,
}) => {
  await mockPanel(page);
  await page.route('**/api/v1/customers', (route) =>
    route.fulfill({ status: 409, json: { detail: 'Ya existe un cliente con ese documento' } }),
  );
  await openCustomers(page);
  const dialog = await fillRegistration(page);
  await dialog.getByRole('button', { name: 'Registrar cliente', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Ya existe un cliente con ese documento');
  await expect(dialog.getByLabel('Número de documento', { exact: true })).toHaveValue('70000043');
  await expect(
    dialog.getByRole('button', { name: 'Registrar cliente', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Cliente registrado', exact: true })).toHaveCount(
    0,
  );
});

test('una búsqueda fallida no conserva el éxito de una edición anterior', async ({ page }) => {
  await mockPanel(page);
  await openCustomers(page);
  await findCustomer(page);
  await page.getByRole('button', { name: 'Guardar contacto', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Datos de contacto actualizados.');
  await page.route('**/api/v1/customers?**', (route) =>
    route.fulfill({ status: 404, json: { detail: 'El cliente no existe' } }),
  );
  await page.getByLabel('Casillero o documento', { exact: true }).fill('PE99999');
  await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('El cliente no existe');
  await expect(page.getByText('Datos de contacto actualizados.', { exact: true })).toHaveCount(0);
});
