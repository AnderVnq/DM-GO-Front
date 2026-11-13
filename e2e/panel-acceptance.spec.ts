import { test, expect } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';

test('permite usar la navegación con teclado y cerrar el menú móvil con Escape', async ({
  page,
}, testInfo) => {
  await mockPanel(page);
  await login(page);
  if (testInfo.project.name === 'desktop') {
    const link = page.getByRole('link', { name: 'Clientes', exact: true });
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/internal\/customers/);
    return;
  }
  const toggle = page.getByRole('button', { name: 'Abrir navegación' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(page.getByRole('navigation')).not.toBeVisible();
});

test('el diálogo de cotización protege el foco y lo devuelve al cerrar con Escape', async ({
  page,
}) => {
  await mockPanel(page);
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  const trigger = page.getByRole('button', { name: 'Nueva cotización', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Nueva cotización', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('mantiene los cinco módulos utilizables sin desbordamiento y registra ambos temas', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'desktop')
    await page.setViewportSize({ width: 1440, height: 1000 });
  await mockPanel(page);
  await login(page);
  const screens = [
    ['Clientes', 'customers', 'Clientes'],
    ['Paquetes', 'packages', 'Paquetes'],
    ['Notas de salida', 'dispatch-notes', 'Notas de salida'],
    ['Cotizaciones', 'quotes', 'Cotizaciones'],
    ['Resumen', 'overview', 'Resumen de la operación'],
  ];
  for (const [name, path, heading] of screens) {
    await navigate(page, name!, path!);
    await expect(page.getByRole('heading', { name: heading!, exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await navigate(page, 'Notas de salida', 'dispatch-notes');
  await expect(page.locator('.inspector h2')).toHaveText('NS-TEST-42');
  await page.screenshot({
    path: `.impeccable/review/spec-close/${testInfo.project.name}-light.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Cambiar a modo oscuro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.screenshot({
    path: `.impeccable/review/spec-close/${testInfo.project.name}-dark.png`,
    fullPage: true,
  });
});

test('recupera un listado tras un fallo de red sin perder la navegación', async ({ page }) => {
  await mockPanel(page);
  let attempts = 0;
  await page.route('**/api/v1/quotes?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('limit') !== '50') return route.fallback();
    if (++attempts === 1) await route.abort('failed');
    else await route.fallback();
  });
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  await expect(page.getByRole('alert')).toContainText('No se pudo establecer conexión.');
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.locator('.inspector h2')).toHaveText('CA-TEST-42');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
