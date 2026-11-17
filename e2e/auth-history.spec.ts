import { test, expect } from '@playwright/test';
import { mockPanel } from './fixtures/panel';

test('login → registro → atrás → atrás permite volver a iniciar sesión', async ({ page }) => {
  await mockPanel(page);
  const attempts = new Set<string | null>();
  await page.route('**/test-idp/realms/dm48/protocol/openid-connect/auth**', (route) => {
    if (new URL(route.request().url()).searchParams.get('prompt') === 'none')
      return route.fallback();
    attempts.add(new URL(route.request().url()).searchParams.get('state'));
    return route.fulfill({
      contentType: 'text/html',
      body: '<h1>Acceso de prueba</h1><a href="/test-idp/register-view">Crear cuenta</a>',
    });
  });
  await page.route('**/test-idp/register-view', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Registro de prueba</h1>' }),
  );
  await page.goto('/login?returnUrl=%2Fportal%2Fpackages');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acceso de prueba' })).toBeVisible();
  await page.getByRole('link', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Registro de prueba' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Acceso de prueba' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fportal%2Fpackages$/);
  const button = page.getByRole('button', { name: 'Iniciar sesión', exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole('heading', { name: 'Acceso de prueba' })).toBeVisible();
  expect(attempts.size).toBe(2);
});

test('cancelar el registro con Atrás permite abrirlo otra vez desde la portada', async ({
  page,
}) => {
  await mockPanel(page);
  const attempts = new Set<string | null>();
  await page.route('**/test-idp/realms/dm48/protocol/openid-connect/registrations**', (route) => {
    attempts.add(new URL(route.request().url()).searchParams.get('state'));
    return route.fulfill({ contentType: 'text/html', body: '<h1>Registro de prueba</h1>' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear mi casillero', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Registro de prueba' })).toBeVisible();
  await page.goBack();
  const button = page.getByRole('button', { name: 'Crear mi casillero', exact: true }).first();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole('heading', { name: 'Registro de prueba' })).toBeVisible();
  expect(attempts.size).toBe(2);
});
