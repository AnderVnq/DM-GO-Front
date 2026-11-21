import { test, expect } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';
for (const reduced of [false, true]) {
  test(`consulta en modal sin perder la página ni el foco, movimiento reducido=${reduced}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await mockPanel(page, 'supervisor');
    const bulk = {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'BLK-11',
      warehouse_code: 'USA-01',
      status: 'closed',
      package_ids: [],
      package_count: 0,
      created_at: '2026-11-18T17:00:00Z',
      seal: 'PRECINTO-11',
    };
    const offsets: string[] = [];
    await page.route('**/api/v1/bulks**', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/bulks')) {
        offsets.push(url.searchParams.get('offset') ?? '0');
        return route.fulfill({
          json: {
            bulks: [bulk],
            total: 11,
            limit: 10,
            offset: Number(url.searchParams.get('offset') ?? 0),
          },
        });
      }
      return route.fulfill({ json: bulk });
    });
    await login(page);
    await navigate(page, 'Bultos', 'bulks');
    const list = page.locator('app-record-browser').first();
    await list.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(list.locator('.record-pagination')).toContainText('Página 2');
    const table = await list.locator('table').elementHandle();
    const opener = list.getByRole('button', { name: 'Ver BLK-11', exact: true });
    await opener.click();
    const modal = page.getByRole('dialog', { name: 'Detalle del bulto', exact: true });
    await expect(modal).toBeVisible();
    await expect(modal).toHaveCSS('opacity', '1');
    await expect(modal.getByRole('heading', { name: 'BLK-11', exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/internal/bulks');
    expect(await modal.evaluate((el) => (el as HTMLDialogElement).matches(':modal'))).toBe(true);
    if (reduced) await expect(modal).toHaveCSS('transform', 'none');
    if (!reduced)
      await page.screenshot({ path: info.outputPath('bulk-detail-modal.png'), fullPage: true });
    await modal.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
    await expect(modal).not.toBeVisible();
    await expect(opener).toBeFocused();
    await expect(list.locator('.record-pagination')).toContainText('Página 2');
    expect(
      await table!.evaluate((el) => el === document.querySelector('app-record-browser table')),
    ).toBe(true);
    expect(offsets.at(-1)).toBe('10');
    await opener.click();
    await expect(modal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(opener).toBeFocused();
    expect(errors).toEqual([]);
  });
}
