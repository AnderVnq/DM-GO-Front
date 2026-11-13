import { test, expect, type Page } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';

for (const theme of ['light', 'dark'] as const) {
  test(`inicia con la paleta ${theme} del sistema sin preferencia guardada`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    await mockPanel(page);
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Panel interno', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const colors = await page.locator('body').evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, text: style.color };
    });
    expect(colors).toEqual(
      theme === 'light'
        ? { background: 'rgb(248, 250, 252)', text: 'rgb(15, 23, 42)' }
        : { background: 'rgb(11, 17, 32)', text: 'rgb(241, 245, 249)' },
    );
    await expect(
      page.getByRole('button', {
        name: theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro',
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
    await login(page);
    await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
    await navigate(page, 'Clientes', 'customers');
    await page.getByLabel('Casillero o documento', { exact: true }).fill('PE00042');
    await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
    await page.getByRole('link', { name: 'Ver paquetes', exact: true }).click();
    await expect(page.getByText('Liberado por aduana', { exact: true })).toBeVisible();
    expect(
      await page.locator('.inspector').evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe(theme === 'light' ? 'rgb(226, 232, 240)' : 'rgb(23, 32, 51)');
    await page.screenshot({ path: testInfo.outputPath('packages.png'), fullPage: true });
    await assertTextContrast(page);
    await navigate(page, 'Cotizaciones', 'quotes');
    await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('quote-dialog.png'), fullPage: true });
    await assertTextContrast(page);
  });
}

test('cambia con teclado y conserva la elección al recargar y entrar al panel', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await mockPanel(page);
  await page.goto('/login');
  const toggle = page.getByRole('button', { name: 'Cambiar a modo oscuro', exact: true });
  await toggle.focus();
  await toggle.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('dm48-theme'))).toBe('dark');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Cambiar a modo claro', exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar a modo claro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page).toHaveURL(/\/internal\/overview/);
  await expect(
    page.getByRole('button', { name: 'Cambiar a modo oscuro', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('sigue cambios del sistema hasta que se elige un tema manualmente', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await mockPanel(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Panel interno', exact: true })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Cambiar a modo claro', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

async function assertTextContrast(page: Page) {
  const pairs = await page.evaluate(() => {
    const luminance = (rgb: string) => {
      const values = rgb
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
    };
    return [
      ...document.querySelectorAll<HTMLElement>(
        '.field, .inspector dt, .inspector p, .data-table th, .muted, .button:enabled, .text-button:enabled',
      ),
    ]
      .filter((el) => el.checkVisibility() && el.textContent?.trim())
      .map((el) => {
        const color = getComputedStyle(el).color;
        let parent: Element | null = el;
        let background = 'rgba(0, 0, 0, 0)';
        while (parent && background === 'rgba(0, 0, 0, 0)') {
          background = getComputedStyle(parent).backgroundColor;
          parent = parent.parentElement;
        }
        const a = luminance(color),
          b = luminance(background);
        return {
          text: el.textContent!.trim().slice(0, 35),
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      });
  });
  for (const pair of pairs) expect(pair.ratio, pair.text).toBeGreaterThanOrEqual(4.5);
}

test('permite cambiar de tema cuando el almacenamiento de preferencias está bloqueado', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem,
      set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'dm48-theme') throw new DOMException('Bloqueado', 'SecurityError');
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'dm48-theme') throw new DOMException('Bloqueado', 'SecurityError');
      return set.call(this, key, value);
    };
  });
  await mockPanel(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Cambiar a modo oscuro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Cambiar a modo claro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
