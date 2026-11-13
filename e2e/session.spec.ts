import { test, expect } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';

test('una renovación rechazada devuelve al acceso y detiene las consultas protegidas', async ({
  page,
}) => {
  await page.clock.install();
  const fixture = await mockPanel(page);
  let renewals = 0;
  await page.route('**/test-idp/realms/dm48/protocol/openid-connect/token', async (route) => {
    if (
      new URLSearchParams(route.request().postData() ?? '').get('grant_type') === 'refresh_token'
    ) {
      renewals++;
      await route.fulfill({ status: 400, json: { error: 'invalid_grant' } });
    } else await route.fallback();
  });
  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  await navigate(page, 'Cotizaciones', 'quotes');
  await expect(page.getByRole('heading', { name: 'CA-TEST-42', exact: true })).toBeVisible();
  const previousRequests = fixture.requests.length;
  await page.clock.fastForward(271000);
  const toggle = page.getByRole('button', { name: 'Abrir navegación' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnUrl=/);
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect(renewals).toBe(1);
  expect(fixture.requests.slice(previousRequests)).toEqual([]);
});

test('dos consultas simultáneas comparten una renovación correcta de sesión', async ({ page }) => {
  await page.clock.install();
  const fixture = await mockPanel(page);
  let renewals = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/test-idp/realms/dm48/protocol/openid-connect/token', async (route) => {
    if (
      new URLSearchParams(route.request().postData() ?? '').get('grant_type') === 'refresh_token'
    ) {
      renewals++;
      await pending;
    }
    await route.fallback();
  });
  try {
    await login(page);
    await navigate(page, 'Cotizaciones', 'quotes');
    await expect(page.locator('.inspector h2')).toHaveText('CA-TEST-42');
    const before = fixture.requests.length;
    await page.clock.fastForward(271000);
    await navigate(page, 'Resumen', 'overview');
    await expect(page.getByRole('status').filter({ hasText: 'Cargando notas…' })).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Cargando cotizaciones…' }),
    ).toBeVisible();
    await expect.poll(() => renewals).toBe(1);
    expect(fixture.requests.slice(before)).toEqual([]);
    release();
    await expect(page.getByRole('cell', { name: 'NS-TEST-42', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'CA-TEST-42', exact: true })).toBeVisible();
    expect(renewals).toBe(1);
    expect(
      fixture.requests
        .slice(before)
        .map((r) => r.path)
        .sort(),
    ).toEqual(['/dispatch-notes', '/quotes']);
  } finally {
    release();
  }
});
