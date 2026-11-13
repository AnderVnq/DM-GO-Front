import { test, expect } from '@playwright/test';
import { mockPanel } from './fixtures/panel';

test('presenta la empresa y el recorrido sin depender del proveedor de acceso', async ({
  page,
}) => {
  let identityRequests = 0;
  await page.route('**/realms/dm48/**', (route) => {
    identityRequests++;
    return route.abort();
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Tus compras en Estados Unidos/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quiénes somos', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'De tu primera compra a tu puerta', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('20616483677', { exact: false })).toBeVisible();
  expect(identityRequests).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('crear casillero conduce al registro OIDC y regresa al área del cliente', async ({ page }) => {
  await mockPanel(page, 'customer');
  let registration = false;
  await page.route(
    '**/test-idp/realms/dm48/protocol/openid-connect/registrations*',
    async (route) => {
      registration = true;
      const url = new URL(route.request().url());
      expect(new URL(url.searchParams.get('redirect_uri')!).pathname).toBe('/portal');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      await route.fulfill({ contentType: 'text/html', body: '<h1>Crear cuenta</h1>' });
    },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear mi casillero', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Crear cuenta', exact: true })).toBeVisible();
  expect(registration).toBe(true);
});

for (const theme of ['light', 'dark'] as const) {
  test(`portada ${theme}: secciones navegables, preguntas accesibles y composición adaptable`, async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name === 'desktop')
      await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByRole('heading', { name: 'Quiénes somos', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Tú eliges cómo comprar/ })).toBeVisible();
    const question = page.getByText('¿Qué necesito para crear mi casillero?', { exact: true });
    await question.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByText(/Crea tu cuenta y completa tus datos de identificación/),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `.impeccable/review/public-home/${testInfo.project.name}-${theme}-top.png`,
    });
    await page.screenshot({
      path: `.impeccable/review/public-home/${testInfo.project.name}-${theme}.png`,
      fullPage: true,
    });
  });
}
