import { test, expect } from '@playwright/test';
import { loginPortal, mockPortal, navigatePortal } from './fixtures/portal';

test('la cuenta usa navegación lateral y el menú móvil conserva foco y cierre', async ({
  page,
}, info) => {
  await mockPortal(page, 'existing');
  await loginPortal(page);
  await expect(page.getByRole('heading', { name: 'Tu casillero está listo' })).toBeVisible();
  const toggle = page.getByRole('button', {
    name: 'Abrir menú de mi cuenta',
    exact: true,
    includeHidden: true,
  });
  if (await toggle.isVisible()) {
    await toggle.click();
    const menu = page.getByRole('dialog', { name: 'Navegación de mi cuenta' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: 'DM48, inicio' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(menu.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await toggle.click();
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const sidebar = await page.locator('.portal-sidebar').boundingBox();
    const logout = await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .boundingBox();
    expect(sidebar && logout && logout.x + logout.width <= sidebar.x + sidebar.width).toBeTruthy();
    await expect(page.getByRole('dialog', { name: 'Navegación de mi cuenta' })).toHaveCount(0);
    await expect(page.getByRole('main')).not.toHaveAttribute('inert', '');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  } else {
    const menu = await page
      .getByRole('navigation', { name: 'Mi cuenta', exact: true })
      .boundingBox();
    const content = await page.getByRole('main').boundingBox();
    expect(menu && content && menu.x + menu.width <= content.x).toBeTruthy();
  }
  await page.screenshot({ path: info.outputPath('portal-sidebar.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cambiar a modo oscuro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: info.outputPath('portal-sidebar-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await navigatePortal(page, 'Mis avisos');
  await expect(page.getByRole('heading', { name: 'Mis avisos', exact: true })).toBeVisible();
  if (await toggle.isVisible()) await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
