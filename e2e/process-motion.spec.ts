import { test, expect } from '@playwright/test';
test.use({ video: 'on' });

test('la secuencia de pasos se activa al entrar y no vuelve a empezar', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' });
  await page.goto('/');
  const list = page.locator('.steps');
  await expect(list).toHaveAttribute('data-process-motion', 'ready');
  for (const step of await list.locator('li').all()) {
    await step.scrollIntoViewIfNeeded();
    await expect(step).toHaveAttribute('data-step-motion', 'complete');
  }
  await expect(list).toHaveAttribute('data-process-motion', 'complete');
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.evaluate(() => scrollTo(0, 0));
  await list.scrollIntoViewIfNeeded();
  await expect(list).toHaveAttribute('data-process-motion', 'complete');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('los pasos permanecen estáticos con movimiento reducido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const list = page.locator('.steps');
  await list.scrollIntoViewIfNeeded();
  await expect(list).toHaveAttribute('data-process-motion', 'static');
  await expect(list.locator('h3')).toHaveCount(5);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('el teclado finaliza la explicación y mantiene el enlace de navegación disponible', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.locator('.steps li').first().scrollIntoViewIfNeeded();
  await page.keyboard.press('Tab');
  await expect(page.locator('.steps')).toHaveAttribute('data-process-motion', 'complete');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
});
