import { test, expect, type Page } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';
import type { CourierRate } from '../src/app/modules/shipments/rate.model';
async function setup(
  page: Page,
  options: {
    role?: string;
    overlap?: boolean;
    uncertain?: boolean;
    noCurrent?: boolean;
    failCurrent?: boolean;
  } = {},
) {
  const role = options.role ?? 'admin';
  await mockPanel(page, role);
  const initial: CourierRate = {
    id: 'rate-current',
    price_per_lb_cents: 550,
    min_lb: 1,
    volumetric_divisor: 166,
    valid_from: '2026-11-01T00:00:00-05:00',
    valid_to: null,
  };
  let history: CourierRate[] = options.noCurrent ? [] : [initial],
    current: CourierRate | null = options.noCurrent ? null : initial,
    failCurrent = !!options.failCurrent;
  const creates: Record<string, unknown>[] = [],
    quotes: Record<string, unknown>[] = [],
    reads: string[] = [];
  await page.route('**/api/v1/rates**', async (r) => {
    const req = r.request(),
      path = new URL(req.url()).pathname;
    if (req.method() === 'GET') {
      reads.push(path);
      if (path.endsWith('/current')) {
        if (failCurrent) {
          failCurrent = false;
          return r.fulfill({ status: 503, json: { detail: 'Tarifa temporalmente no disponible' } });
        }
        if (!current)
          return r.fulfill({
            status: 404,
            json: { code: 'no_rate', detail: 'No hay una tarifa vigente' },
          });
        return r.fulfill({ json: current });
      }
      return r.fulfill({ json: { rates: history } });
    }
    const body = req.postDataJSON() as Record<string, unknown>;
    if (path.endsWith('/quote')) {
      quotes.push(body);
      return r.fulfill({
        json: {
          rate_id: 'rate-current',
          real_lb: 3,
          volumetric_lb: 5,
          billable_lb: 5,
          billable_kg: '2.268',
          price_per_lb_cents: 550,
          freight_cents: 2750,
        },
      });
    }
    creates.push(body);
    if (role !== 'admin')
      return r.fulfill({ status: 403, json: { detail: 'Solo administración' } });
    if (options.overlap)
      return r.fulfill({
        status: 409,
        json: { detail: 'La vigencia se superpone con otra tarifa' },
      });
    const created: CourierRate = {
      id: 'rate-new',
      price_per_lb_cents: Number(body['price_per_lb_cents']),
      min_lb: Number(body['min_lb']),
      volumetric_divisor: Number(body['volumetric_divisor']),
      valid_from: String(body['valid_from'] ?? new Date().toISOString()),
      valid_to: null,
    };
    history = [created, ...history.map((rate) => ({ ...rate, valid_to: created.valid_from }))];
    if (!body['valid_from']) current = created;
    else if (current) current = { ...current, valid_to: created.valid_from };
    if (options.uncertain)
      return r.fulfill({ status: 500, json: { detail: 'Respuesta de publicación no confirmada' } });
    return r.fulfill({ json: created });
  });
  return { creates, quotes, reads };
}
async function enter(page: Page) {
  await login(page);
  await navigate(page, 'Tarifas courier', 'rates');
  await expect(page.getByRole('heading', { name: 'Tarifa vigente', exact: true })).toBeVisible();
}
async function form(page: Page, scheduled = true) {
  await page.getByRole('button', { name: 'Publicar nueva tarifa', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Publicar nueva tarifa', exact: true });
  await expect(
    modal.getByRole('button', { name: 'Confirmar publicación', exact: true }),
  ).toBeDisabled();
  await modal.getByLabel('Precio en USD por libra', { exact: true }).fill('12,34');
  await modal.getByLabel('Mínimo facturable (lb)', { exact: true }).fill('2');
  if (scheduled)
    await modal
      .getByLabel('Inicio · hora de Perú (opcional)', { exact: true })
      .fill('2030-06-15T09:00');
  return modal;
}
async function calculate(page: Page) {
  await page.getByLabel('Peso real (kg)', { exact: true }).fill('1,250');
  await page.getByLabel('Largo (mm)', { exact: true }).fill('400');
  await page.getByLabel('Ancho (mm)', { exact: true }).fill('300');
  await page.getByLabel('Alto (mm)', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Calcular flete', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Resultado del flete', exact: true }),
  ).toBeVisible();
}
test('admin publica versión programada y simula el flete vigente confirmado por servidor', async ({
  page,
}, info) => {
  const { creates, quotes } = await setup(page);
  await enter(page);
  const modal = await form(page);
  await modal.getByRole('button', { name: 'Confirmar publicación', exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(creates[0]).toEqual({
    price_per_lb_cents: 1234,
    min_lb: 2,
    volumetric_divisor: 166,
    valid_from: '2030-06-15T09:00:00-05:00',
  });
  await expect(page.getByRole('cell', { name: 'Programada', exact: true })).toBeVisible();
  await calculate(page);
  expect(quotes[0]).toEqual({ weight_kg: '1.250', length_mm: 400, width_mm: 300, height_mm: 100 });
  await expect(page.locator('.freight-total')).toContainText('27.50');
  await expect(page.getByRole('definition').filter({ hasText: '5 lb · 2.268 kg' })).toBeVisible();
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: /Cambiar a modo oscuro/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  }
  await page.screenshot({
    path: info.outputPath('courier-rates.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Peso real (kg)', { exact: true }).fill('2');
  await expect(page.getByRole('heading', { name: 'Resultado del flete', exact: true })).toHaveCount(
    0,
  );
});
test('ventas puede consultar y simular sin publicar tarifas', async ({ page }) => {
  const { creates } = await setup(page, { role: 'seller' });
  await enter(page);
  await expect(
    page.getByRole('button', { name: 'Publicar nueva tarifa', exact: true }),
  ).toHaveCount(0);
  await calculate(page);
  expect(creates).toHaveLength(0);
});
test('solapamiento conserva borrador y actualiza historial sin éxito falso', async ({ page }) => {
  const { creates, reads } = await setup(page, { overlap: true });
  await enter(page);
  const modal = await form(page);
  await modal.getByRole('button', { name: 'Confirmar publicación', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('se superpone');
  await expect(modal.getByLabel('Precio en USD por libra', { exact: true })).toHaveValue('12,34');
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(creates).toHaveLength(1);
  expect(reads.filter((path) => path.endsWith('/rates')).length).toBeGreaterThan(1);
});
test('publicación incierta bloquea reenvío y permite revisar nueva versión', async ({ page }) => {
  const { creates } = await setup(page, { uncertain: true });
  await enter(page);
  const modal = await form(page);
  await modal.getByRole('button', { name: 'Confirmar publicación', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('puede haberse publicado');
  await expect(
    modal.getByRole('button', { name: 'Confirmar publicación', exact: true }),
  ).toBeDisabled();
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Programada', exact: true })).toBeVisible();
  expect(creates).toHaveLength(1);
});
test('fallo de tarifa vigente conserva historial y reintenta solo esa lectura', async ({
  page,
}) => {
  const { reads } = await setup(page, { failCurrent: true });
  await enter(page);
  await expect(page.getByRole('alert')).toContainText('temporalmente');
  await expect(page.getByRole('table', { name: undefined }).getByRole('row')).toHaveCount(2);
  const historyReads = reads.filter((path) => path.endsWith('/rates')).length;
  await page.getByRole('button', { name: 'Reintentar tarifa vigente', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(reads.filter((path) => path.endsWith('/rates'))).toHaveLength(historyReads);
});
test('primera tarifa omite fecha de inicio para usar la hora del servidor', async ({ page }) => {
  const { creates } = await setup(page, { noCurrent: true });
  await enter(page);
  await expect(page.getByText(/No hay una tarifa vigente en este momento/)).toBeVisible();
  const modal = await form(page, false);
  await modal.getByRole('button', { name: 'Confirmar publicación', exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(creates[0]).not.toHaveProperty('valid_from');
  await expect(page.getByRole('cell', { name: 'Vigente', exact: true })).toBeVisible();
});
