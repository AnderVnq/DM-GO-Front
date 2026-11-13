import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/realms/dm48/**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
});

test('protege el área interna sin una sesión válida', async ({ page }) => {
  await page.goto('/internal/packages');
  // Keycloak espera hasta 10 s por el iframe cuando el proveedor no responde.
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
});

test('mantiene legible el acceso y permite navegar con teclado', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible({
    timeout: 15000,
  });
  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noHorizontalOverflow).toBe(true);
  const button = page.getByRole('button', { name: 'Iniciar sesión' });
  await expect(button).toBeEnabled({ timeout: 15000 });
  await button.focus();
  await expect(button).toBeFocused();
});
