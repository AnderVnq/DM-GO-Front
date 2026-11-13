import { test, expect } from '@playwright/test';
import { mockPortal, loginPortal, fillOnboarding } from './fixtures/portal';

test('completa el registro y muestra el código y la dirección reales de su casillero', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'desktop')
    await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await mockPortal(page);
  await loginPortal(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `.impeccable/review/public-home/portal-${testInfo.project.name}-form.png`,
    fullPage: true,
  });
  await fillOnboarding(page);
  await page.getByRole('button', { name: 'Crear mi casillero', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tu casillero está listo', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('PE00042', { exact: true })).toBeVisible();
  await expect(page.getByText('100 Test Street', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `.impeccable/review/public-home/portal-${testInfo.project.name}-ready.png`,
    fullPage: true,
  });
  expect(fixture.writes).toEqual([
    { doc_type: 'dni', doc_number: '70000042', name: 'Cliente de prueba', phone: '999000042' },
  ]);
});

test('un cliente existente consulta su casillero sin volver a registrarse', async ({ page }) => {
  const fixture = await mockPortal(page, 'existing');
  await loginPortal(page);
  await expect(
    page.getByRole('heading', { name: 'Tu casillero está listo', exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toEqual([]);
  await expect(page.getByRole('button', { name: 'Crear mi casillero', exact: true })).toHaveCount(
    0,
  );
});

for (const mode of ['link', 'pending'] as const) {
  test(`muestra la vinculación pendiente (${mode}) sin revelar otro casillero`, async ({
    page,
  }) => {
    const fixture = await mockPortal(page, mode);
    await loginPortal(page);
    if (mode === 'link') {
      await fillOnboarding(page);
      await page.getByRole('button', { name: 'Crear mi casillero', exact: true }).click();
    }
    await expect(
      page.getByRole('heading', { name: 'Estamos revisando tu vinculación', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('PE00042', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Crear mi casillero', exact: true })).toHaveCount(
      0,
    );
    expect(fixture.writes).toHaveLength(mode === 'link' ? 1 : 0);
  });
}

test('conserva los datos del registro tras 422 y permite corregirlos', async ({ page }) => {
  const fixture = await mockPortal(page, 'validation');
  await loginPortal(page);
  await fillOnboarding(page);
  await page.getByRole('button', { name: 'Crear mi casillero', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Revisa el documento ingresado.');
  await expect(page.getByLabel('Número de documento', { exact: true })).toHaveValue('70000042');
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveValue('999000042');
  await page.getByRole('button', { name: 'Crear mi casillero', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tu casillero está listo', exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toHaveLength(2);
});

test('recupera un perfil creado en otra sesión sin duplicar el alta', async ({ page }) => {
  const fixture = await mockPortal(page, 'already');
  await loginPortal(page);
  await fillOnboarding(page);
  await page.getByRole('button', { name: 'Crear mi casillero', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tu casillero está listo', exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
});

test('el personal conserva su panel y no consulta perfiles del portal', async ({ page }) => {
  const fixture = await mockPortal(page, 'new', 'supervisor');
  await page.goto('/login?returnUrl=%2Fportal');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  expect(fixture.requests).toEqual([]);
});

test('desde la portada completa el retorno del registro y obtiene su casillero', async ({
  page,
}) => {
  const fixture = await mockPortal(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear mi casillero', exact: true }).first().click();
  await expect(page).toHaveURL(/\/portal$/);
  await fillOnboarding(page);
  await page.getByRole('button', { name: 'Crear mi casillero', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tu casillero está listo', exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
});

test('permite reintentar el registro cuando el proveedor de acceso vuelve a estar disponible', async ({
  page,
}) => {
  await mockPortal(page, 'existing');
  const unavailable = (route: import('@playwright/test').Route) => route.abort();
  await page.route('**/test-idp/realms/dm48/**', unavailable);
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear mi casillero', exact: true }).first().click();
  await expect(page.getByRole('alert')).toContainText('No se pudo abrir el registro.', {
    timeout: 15000,
  });
  await page.unroute('**/test-idp/realms/dm48/**', unavailable);
  await page.getByRole('button', { name: 'Crear mi casillero', exact: true }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Tu casillero está listo', exact: true }),
  ).toBeVisible();
});

test('explica el formato del documento y permite corregir DNI o RUC', async ({ page }) => {
  await mockPortal(page);
  await loginPortal(page);
  const document = page.getByLabel('Número de documento', { exact: true });
  await document.fill('ABC');
  await document.press('Tab');
  await expect(document).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByText('Ingresa 8 dígitos para DNI o 11 dígitos para RUC.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Tipo de documento', { exact: true }).selectOption('ruc');
  await document.fill('20601030013');
  await expect(document).not.toHaveAttribute('aria-invalid', 'true');
});
