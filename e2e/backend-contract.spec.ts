import { test, expect } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';
import type { GuideBoard, GuideCard } from '../src/app/modules/consolidation/consolidation.model';

test('lote con error indexado y fallo parcial de factura conserva ambos paquetes', async ({
  page,
}, info) => {
  await mockPanel(page);
  let batches = 0;
  const uploads: string[] = [];
  await page.route('**/api/v1/packages/batch', async (route) => {
    batches++;
    const input = route.request().postDataJSON();
    expect(input).not.toHaveProperty('declared_value_cents');
    if (batches === 1)
      return route.fulfill({
        status: 422,
        json: {
          detail: 'Revisa el segundo paquete.',
          errors: { 'packages[1].carrier_tracking': 'Este tracking ya está registrado.' },
        },
      });
    const packages = input.packages.map((row: Record<string, unknown>, i: number) => {
      expect(row).not.toHaveProperty('declared_value_cents');
      expect(row.carrier_tracking).toBe(String(row.carrier_tracking).toUpperCase());
      return {
        ...row,
        id: `new-${i + 1}`,
        customer_id: 'customer-test',
        mode: 'courier',
        status: 'PREALERTED',
        has_invoice: false,
        invoice_pending: true,
        locker_code: 'PE00042',
        declared_value_cents: Number(row.unit_value_cents) * Number(row.quantity),
        created_at: '2026-11-14T00:00:00Z',
      };
    });
    return route.fulfill({ status: 201, json: { packages } });
  });
  await page.route('**/api/v1/packages/new-*/invoice', (route) => {
    uploads.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 503, json: { detail: 'Vuelve a subir la factura.' } });
  });
  await login(page);
  await navigate(page, 'Paquetes', 'packages');
  await page.getByLabel('Casillero o documento del cliente').fill('PE00042');
  await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva prealerta', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const first = dialog.locator('fieldset').nth(0);
  await first.getByLabel('Número de tracking').fill('first-123');
  await first.getByLabel('Compañía de envío').fill('Amazon');
  await first.getByLabel('Contenido', { exact: true }).fill('Libros');
  await first.getByLabel('Precio por unidad (USD)').fill('0.29');
  await first.getByLabel('Cantidad', { exact: true }).fill('3');
  await expect(first).toContainText(/0[.,]87/);
  await dialog.getByRole('button', { name: 'Agregar paquete', exact: true }).click();
  const second = dialog.locator('fieldset').nth(1);
  await second.getByLabel('Número de tracking').fill('second-123');
  await second.getByLabel('Compañía de envío').fill('UPS');
  await second.getByLabel('Contenido', { exact: true }).fill('Ropa');
  await second.getByLabel('Precio por unidad (USD)').fill('49.99');
  await second.locator('input[type=file]').setInputFiles({
    name: 'factura.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-test'),
  });
  await dialog.getByRole('button', { name: 'Registrar prealerta', exact: true }).click();
  await expect(
    second.getByText('Este tracking ya está registrado.', { exact: true }),
  ).toBeVisible();
  await expect(first.getByText('Este tracking ya está registrado.')).toHaveCount(0);
  await second.getByLabel('Número de tracking').fill('second-456');
  await page.screenshot({
    path: info.outputPath('prealert-batch.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Registrar prealerta', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('cell', { name: 'FIRST-123', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'SECOND-456', exact: true })).toBeVisible();
  await expect(page.locator('.inspector').getByRole('alert')).toContainText(
    'Los paquetes se registraron',
  );
  expect(batches).toBe(2);
  expect(uploads).toEqual(['/api/v1/packages/new-2/invoice']);
  await page.getByRole('button', { name: 'Nueva prealerta', exact: true }).click();
  await expect(dialog.locator('fieldset')).toHaveCount(1);
  await expect(dialog.getByLabel('Cantidad', { exact: true })).toHaveValue('1');
  await expect(dialog.getByLabel('Número de tracking')).toHaveValue('');
});

test('AWB permite agrupar con teclado y arrastre, ordenar y consultar cerrado', async ({
  page,
}, info) => {
  await mockPanel(page);
  const card: GuideCard = {
    id: 'p1',
    customer_id: 'c1',
    locker_code: 'PE00042',
    consignee_id: 'dest1',
    carrier_tracking: 'TRACK-001',
    store: 'Amazon',
    description: 'Libros para oficina',
    unit_value_cents: 1250,
    quantity: 2,
    declared_value_cents: 2500,
    wr: 'WR00001',
    weight_g: 750,
  };
  let board: GuideBoard = {
    consolidation_id: 'con1',
    code: 'CON00001',
    status: 'open',
    groups: [],
    ungrouped: [
      card,
      { ...card, id: 'p2', carrier_tracking: 'TRACK-002' },
      {
        ...card,
        id: 'p3',
        carrier_tracking: 'TRACK-003',
        customer_id: 'c2',
        locker_code: 'PE00043',
      },
    ],
  };
  let writes = 0;
  await page.route('**/api/v1/consolidations/con1/guide-groups**', (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: board });
    writes++;
    const body = request.postDataJSON();
    if (request.method() === 'POST') {
      const packages = board.ungrouped.filter((p) => body.package_ids.includes(p.id));
      board = {
        ...board,
        groups: [
          ...board.groups,
          {
            id: `g${writes}`,
            position: board.groups.length,
            customer_id: packages[0]!.customer_id,
            packages,
            created_at: '',
          },
        ],
        ungrouped: board.ungrouped.filter((p) => !body.package_ids.includes(p.id)),
      };
    } else {
      board.groups = body.group_ids.map((id: string, position: number) => ({
        ...board.groups.find((g) => g.id === id)!,
        position,
      }));
    }
    return route.fulfill({ json: board });
  });
  await page.goto('/login?returnUrl=%2Finternal%2Fconsolidations%2Fcon1%2Fguide-groups');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Creación de AWB', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Agregar grupo', exact: true }).focus();
  await page.keyboard.press('Enter');
  const first = page.locator('.package-card').filter({ hasText: 'TRACK-001' });
  await first.getByRole('combobox').selectOption({ label: 'Nuevo grupo 1' });
  await first.getByRole('button', { name: 'Mover TRACK-001 a grupo', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.guide-group')).toHaveCount(1);
  await page.getByRole('button', { name: 'Agregar grupo', exact: true }).click();
  const second = page.locator('.package-card').filter({ hasText: 'TRACK-002' });
  if (info.project.name === 'mobile') {
    await second.getByRole('combobox').selectOption({ label: 'Nuevo grupo 2' });
    await second.getByRole('button', { name: 'Mover TRACK-002 a grupo', exact: true }).click();
  } else {
    await second.dragTo(page.locator('.draft'));
  }
  await expect(page.locator('.draft')).toHaveCount(0);
  await expect(page.locator('.guide-group')).toHaveCount(2);
  await page.getByRole('button', { name: 'Subir grupo 2', exact: true }).click();
  await expect(page.locator('.guide-group').first()).toContainText('TRACK-002');
  const third = page.locator('.package-card').filter({ hasText: 'TRACK-003' });
  await third.getByRole('combobox').selectOption({ label: 'Grupo 1' });
  await third.getByRole('button', { name: 'Mover TRACK-003 a grupo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('cliente y consignatario');
  expect(writes).toBe(3);
  await page.screenshot({
    path: info.outputPath('awb-open.png'),
    fullPage: true,
    animations: 'disabled',
  });
  board = { ...board, status: 'closed' };
  await page.getByRole('button', { name: 'Actualizar tablero', exact: true }).click();
  await expect(page.getByText('CON00001')).toBeVisible();
  await expect(page.getByText(/Consolidado cerrado · Solo lectura/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar grupo', exact: true })).toHaveCount(0);
  await expect(page.locator('[draggable=true]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: info.outputPath('awb-closed.png'),
    fullPage: true,
    animations: 'disabled',
  });
});
