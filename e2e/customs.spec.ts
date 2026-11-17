import { test, expect, type Page } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';
import { testPdf } from './fixtures/pdf';
import type { CustomsLine } from '../src/app/modules/customs/customs.model';
const id = '44444444-4444-4444-8444-444444444444';
async function setup(
  page: Page,
  options: { role?: string; noProof?: boolean; conflict?: boolean; invalidReport?: boolean } = {},
) {
  await mockPanel(page, options.role ?? 'supervisor');
  let line: CustomsLine = {
    id,
    package_id: 'package-test',
    customer_id: 'customer-test',
    guide: 'H-42',
    customs_manifest: 'MAN-42',
    declaration: 'DAM-42',
    tax_cents: 1234,
    currency: 'PEN',
    channel: 'red',
    status: options.noProof ? 'pending_tax' : 'proof_sent',
    proof_submitted: !options.noProof,
    assessment_document_id: 'assessment-doc',
    proof_document_id: options.noProof ? '' : 'proof-doc',
    released_at: null,
  };
  const writes: { path: string; body: Record<string, unknown> | string }[] = [];
  await page.route('**/api/v1/customs/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (req.method() === 'GET')
      return route.fulfill({
        json: path.endsWith('/lines')
          ? { pending: line.status === 'released' ? [] : [line] }
          : line,
      });
    const body = req.headers()['content-type']?.includes('application/json')
      ? req.postDataJSON()
      : (req.postData() ?? '');
    writes.push({ path, body });
    if (path.endsWith('/reports')) {
      if (options.invalidReport)
        return route.fulfill({
          status: 422,
          json: {
            detail: 'Hay filas inválidas: no se importó nada',
            errors: { 'fila 3.tax': 'monto inválido' },
          },
        });
      return route.fulfill({
        json: {
          report_id: 'report-test',
          released: ['H-GREEN'],
          pending_tax: ['H-42'],
          inspection: ['H-RED'],
          unchanged: [],
          updated: [],
          conflicts: ['H-OLD'],
          unknown: ['H-UNKNOWN'],
          not_arrived: ['H-NOT-ARRIVED'],
        },
      });
    }
    if (path.endsWith('/documents')) {
      line = {
        ...line,
        ...(body.type === 'assessment'
          ? { assessment_document_id: body.document_id }
          : {
              proof_document_id: body.document_id,
              proof_submitted: true,
              status: 'proof_sent' as const,
            }),
      };
      return route.fulfill({ json: line });
    }
    if (path.endsWith('/release')) {
      line = { ...line, status: 'released', released_at: '2026-11-17T21:00:00Z' };
      if (options.conflict)
        return route.fulfill({ status: 409, json: { detail: 'La guía ya fue liberada' } });
      return route.fulfill({ json: line });
    }
    return route.fulfill({ status: 404 });
  });
  await page.route('**/api/v1/documents/*/download', (route) =>
    route.fulfill({
      json: { url: 'https://files.example.test/customs.pdf', expires_at: '2026-11-30T00:00:00Z' },
    }),
  );
  await page.route('https://files.example.test/customs.pdf', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: testPdf() }),
  );
  return writes;
}
async function enter(page: Page) {
  await login(page);
  await navigate(page, 'Aduanas', 'customs');
  await expect(page.getByRole('button', { name: 'Ver guía H-42', exact: true })).toBeVisible();
}
async function detail(page: Page) {
  await page.getByRole('button', { name: 'Ver guía H-42', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Guía H-42', exact: true })).toBeVisible();
}
test('importa reporte y muestra todos los grupos confirmados sin convertir monedas', async ({
  page,
}, info) => {
  const writes = await setup(page);
  await enter(page);
  await page.getByRole('button', { name: 'Importar reporte', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Importar reporte de Aduanas', exact: true });
  await expect(
    modal.getByRole('button', { name: 'Confirmar importación', exact: true }),
  ).toBeDisabled();
  await modal.getByLabel('Manifiesto de Aduanas', { exact: true }).fill(' MAN-42 ');
  await modal.getByLabel('Reporte del agente', { exact: true }).setInputFiles({
    name: 'agente.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('guia,declaracion,tributo,canal\nH-42,DAM-42,12.34,rojo'),
  });
  await modal.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(String(writes[0]?.body)).toContain('name="customs_manifest"');
  expect(String(writes[0]?.body)).toContain('MAN-42');
  await expect(
    page.getByRole('heading', { name: 'Resultado del reporte', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('H-UNKNOWN', { exact: true })).toBeVisible();
  await expect(page.getByText('H-NOT-ARRIVED', { exact: true })).toBeVisible();
  await detail(page);
  await expect(page).toHaveURL(new RegExp(`line_id=${id}`));
  await expect(page.getByRole('definition').filter({ hasText: 'PEN' })).toHaveText(/PEN.*12.34/);
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: /Cambiar a modo oscuro/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  }
  await page.screenshot({
    path: info.outputPath('customs.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('muestra errores por fila y conserva el archivo y manifiesto', async ({ page }) => {
  const writes = await setup(page, { invalidReport: true });
  await enter(page);
  await page.getByRole('button', { name: 'Importar reporte', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Importar reporte de Aduanas', exact: true });
  await modal.getByLabel('Manifiesto de Aduanas', { exact: true }).fill('MAN-INVALID');
  await modal
    .getByLabel('Reporte del agente', { exact: true })
    .setInputFiles({ name: 'agente.csv', mimeType: 'text/csv', buffer: Buffer.from('bad') });
  await modal.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('no se importó nada');
  await expect(modal.getByText('fila 3.tax', { exact: true })).toBeVisible();
  await expect(modal.getByLabel('Manifiesto de Aduanas', { exact: true })).toHaveValue(
    'MAN-INVALID',
  );
  expect(
    await modal
      .getByLabel('Reporte del agente', { exact: true })
      .evaluate((e: HTMLInputElement) => e.files?.[0]?.name),
  ).toBe('agente.csv');
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(writes).toHaveLength(1);
});
test('preview, descarga y constancia antes de confirmar liberación', async ({ page }) => {
  const writes = await setup(page, { noProof: true });
  await enter(page);
  await detail(page);
  await expect(page.getByRole('button', { name: 'Liberar guía', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Ver liquidación de tributos', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Liquidación H-42', exact: true });
  await expect(preview.getByRole('img', { name: /Página 1 de 2/ })).toBeVisible();
  const downloading = page.waitForEvent('download');
  await preview.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  expect((await downloading).suggestedFilename()).toBe('Liquidación H-42.pdf');
  await preview.getByRole('button', { name: 'Cerrar vista previa', exact: true }).click();
  await page.getByRole('button', { name: 'Adjuntar constancia', exact: true }).click();
  const attach = page.getByRole('dialog', { name: 'Adjuntar constancia', exact: true });
  await expect(
    attach.getByRole('button', { name: 'Guardar documento', exact: true }),
  ).toBeDisabled();
  await attach
    .getByLabel('Documento PDF o imagen', { exact: true })
    .setInputFiles({ name: 'constancia.pdf', mimeType: 'application/pdf', buffer: testPdf() });
  await attach.getByRole('button', { name: 'Guardar documento', exact: true }).click();
  await expect(attach).not.toBeVisible();
  expect(writes.at(-1)?.body).toEqual({ type: 'payment_proof', document_id: 'document-test' });
  await page.getByRole('button', { name: 'Liberar guía', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirmar liberación', exact: true });
  await confirm.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(writes.filter((w) => w.path.endsWith('/release'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Liberar guía', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirmar liberación', exact: true }).click();
  await expect(confirm).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('Guía H-42 liberada');
  await expect(page.getByRole('button', { name: 'Liberar guía', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ver guía H-42', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Guía H-42', exact: true })).toBeFocused();
});
test('conflicto de liberación actualiza el detalle sin éxito falso', async ({ page }) => {
  await setup(page, { conflict: true });
  await enter(page);
  await detail(page);
  await page.getByRole('button', { name: 'Liberar guía', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Confirmar liberación', exact: true });
  await modal.getByRole('button', { name: 'Confirmar liberación', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('ya fue liberada');
  await expect(
    modal.getByRole('button', { name: 'Confirmar liberación', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('status')).toHaveCount(0);
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Liberar guía', exact: true })).toHaveCount(0);
});
test('ventas no ve ni accede a Aduanas', async ({ page }) => {
  const writes = await setup(page, { role: 'seller' });
  await login(page);
  await expect(
    page.getByRole('heading', { name: 'Resumen de la operación', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Aduanas', exact: true })).toHaveCount(0);
  await page.goto('/internal/customs');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Acceso restringido', exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});
