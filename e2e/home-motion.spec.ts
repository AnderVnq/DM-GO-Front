import { test, expect } from '@playwright/test';

test.use({ video: 'on' });

test('el avión recorre USA a Perú una sola vez y termina sobre el destino', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' });
  await page.goto('/');
  const hero = page.locator('.hero');
  await expect(hero).toHaveAttribute('data-hero-motion', 'running');
  await page.locator('.route-diagram').scrollIntoViewIfNeeded();
  const plane = page.locator('.route-aircraft');
  const initial = await plane.getAttribute('transform');
  await expect.poll(() => plane.getAttribute('transform')).not.toBe(initial);
  await expect(hero).toHaveAttribute('data-hero-motion', 'complete');
  await expect(plane).toHaveAttribute('transform', /^translate\(456 76\)/);
  await expect(
    page.getByRole('button', { name: 'Crear mi casillero', exact: true }).first(),
  ).toBeEnabled();
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('respeta movimiento reducido y el cambio de preferencia durante el recorrido', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.hero')).toHaveAttribute('data-hero-motion', 'static');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await expect(page.locator('.hero')).toHaveAttribute('data-hero-motion', 'running');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.hero')).toHaveAttribute('data-hero-motion', 'complete');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('usar teclado finaliza la secuencia sin retrasar el foco', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.hero')).toHaveAttribute('data-hero-motion', 'running');
  await page.keyboard.press('Tab');
  await expect(page.locator('.hero')).toHaveAttribute('data-hero-motion', 'complete');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
});
