import { test, expect, type Page } from '@playwright/test';
import { mockPortal, loginPortal, navigatePortal } from './fixtures/portal';

async function operations(page: Page) {
  await mockPortal(page, 'existing');
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  const original = {
    id: 'client-package',
    customer_id: 'customer-test',
    mode: 'courier',
    status: 'PREALERTED',
    store: 'Tienda de prueba',
    carrier_tracking: 'CLIENT-42',
    description: 'Audífonos',
    declared_value_cents: 10000,
    has_invoice: false,
    created_at: '2026-11-13T00:00:00Z',
  };
  const packages = [original];
  let note = {
    id: 'client-note',
    number: 'NS-CLIENT-42',
    customer_id: 'customer-test',
    status: 'pending_payment',
    method: 'pickup',
    total_cents: 10000,
    balance_cents: 10000,
    paid_cents: 0,
    currency: 'USD',
    guides: [],
    lines: [],
    payments: [] as object[],
    created_at: original.created_at,
  };
  await page.route(
    /\/api\/v1\/(portal\/(packages|prealerts|dispatch-notes|invoices)|documents)/,
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace('/api/v1', '');
      const body = request.headers()['content-type']?.includes('application/json')
        ? (request.postDataJSON() as Record<string, unknown>)
        : null;
      if (request.method() !== 'GET') calls.push({ path, body });
      if (path === '/portal/packages') return route.fulfill({ json: { packages } });
      if (path.endsWith('/tracking'))
        return route.fulfill({
          json: {
            package_id: path.split('/')[3],
            status: 'PREALERTED',
            events: [
              {
                at: original.created_at,
                action: 'package.prealerted',
                title: 'Compra prealertada',
              },
            ],
          },
        });
      if (path === '/portal/prealerts') {
        const created = { ...original, ...body, id: 'new-client-package' };
        packages.unshift(created);
        return route.fulfill({ status: 201, json: created });
      }
      if (path.endsWith('/invoice')) {
        packages[0] = { ...packages[0]!, has_invoice: true };
        return route.fulfill({ json: packages[0] });
      }
      if (path === '/portal/dispatch-notes')
        return route.fulfill({ json: { dispatch_notes: [note] } });
      if (path === '/portal/dispatch-notes/client-note') return route.fulfill({ json: note });
      if (path.endsWith('/payments')) {
        note = {
          ...note,
          payments: [
            {
              id: 'pending-client-payment',
              method: 'transfer',
              origin: 'PERU',
              reference: 'OP42',
              amount_cents: body?.['amount_cents'],
              paid_at: original.created_at,
              status: 'pending',
            },
          ],
        };
        return route.fulfill({ json: note });
      }
      if (path === '/documents')
        return route.fulfill({ status: 403, json: { detail: 'Solo personal.' } });
      if (path === '/documents/uploads')
        return route.fulfill({
          status: 201,
          json: {
            upload_id: 'client-upload',
            method: 'PUT',
            url: 'https://uploads.example.test/client-proof',
            headers: { 'Content-Type': 'application/pdf' },
            expires_at: '2027-01-01T00:00:00Z',
          },
        });
      if (path === '/documents/uploads/client-upload/complete')
        return route.fulfill({
          status: 201,
          json: {
            id: 'client-proof',
            original_name: 'pago.pdf',
            mime_type: 'application/pdf',
            size: 9,
          },
        });
      if (path === '/portal/invoices')
        return route.fulfill({
          json: {
            invoices: [
              {
                id: 'client-invoice',
                code: 'B001-42',
                type: '03',
                note_id: note.id,
                note_number: note.number,
                customer_id: note.customer_id,
                customer_name: 'Cliente de prueba',
                currency: 'USD',
                issued_at: original.created_at,
                total_cents: 10000,
                igv_cents: 0,
                lines: [{ description: 'Servicio courier', total_cents: 10000 }],
                status: 'accepted',
                has_pdf: true,
                has_xml: false,
                has_cdr: false,
                credited: false,
              },
            ],
          },
        });
      if (path.endsWith('/files/pdf'))
        return route.fulfill({
          json: {
            url: 'https://files.example.test/client-invoice.pdf',
            expires_at: '2027-01-01T00:00:00Z',
          },
        });
      return route.fulfill({ status: 404, json: {} });
    },
  );
  await page.context().route('https://uploads.example.test/client-proof', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': 'http://localhost:3000',
          'access-control-allow-methods': 'PUT',
          'access-control-allow-headers': 'content-type',
        },
      });
    expect(route.request().method()).toBe('PUT');
    expect(route.request().headers()['authorization']).toBeUndefined();
    expect(route.request().postDataBuffer()?.toString()).toBe('%PDF-test');
    calls.push({ path: 'storage-upload', body: null });
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': 'http://localhost:3000' },
      body: '',
    });
  });
  return { calls };
}

test('el cliente prealerta y adjunta factura desde sus paquetes sin enviar customer_id', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'desktop')
    await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await operations(page);
  await loginPortal(page);
  await navigatePortal(page, 'Mis paquetes');
  await expect(page.getByRole('heading', { name: 'Mis paquetes', exact: true })).toBeVisible();
  await expect(page.getByText('Compra prealertada', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva prealerta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva prealerta', exact: true });
  await dialog.getByLabel('Tienda', { exact: true }).fill('Otra tienda');
  await dialog.getByLabel('Tracking del transportista').fill('CLIENT-43');
  await dialog.getByLabel('Contenido del paquete').fill('Libro');
  await dialog.getByLabel('Valor declarado en USD').fill('49.99');
  await dialog.getByRole('button', { name: 'Registrar prealerta', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.inspector')).toContainText('CLIENT-43');
  expect(fixture.calls.find((r) => r.path === '/portal/prealerts')?.body).toEqual({
    mode: 'courier',
    store: 'Otra tienda',
    carrier_tracking: 'CLIENT-43',
    description: 'Libro',
    declared_value_cents: 4999,
  });
  await page.locator('.inspector input[type=file]').setInputFiles({
    name: 'factura.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-test'),
  });
  await expect(page.getByRole('button', { name: 'Cambiar factura', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `.impeccable/review/portal-modules/${testInfo.project.name}-packages.png`,
    fullPage: true,
  });
});

test('reporta un pago con evidencia sin aprobarlo y consulta sus comprobantes', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'desktop')
    await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await operations(page);
  await page
    .context()
    .route('https://files.example.test/**', (route) =>
      route.fulfill({ contentType: 'text/plain', body: 'Comprobante de prueba' }),
    );
  await loginPortal(page);
  await navigatePortal(page, 'Mis pagos');
  await page.getByRole('button', { name: 'Reportar pago', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Reportar pago', exact: true });
  await dialog.getByLabel('Importe en USD').fill('100.01');
  await dialog.getByRole('button', { name: 'Enviar comprobante', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('saldo pendiente');
  await dialog.getByLabel('Importe en USD').fill('100');
  await dialog.getByRole('button', { name: 'Enviar comprobante', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Adjunta');
  expect(fixture.calls).toHaveLength(0);
  await dialog.getByLabel('Comprobante de pago').setInputFiles({
    name: 'pago.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-test'),
  });
  await dialog.getByLabel('Referencia').fill('OP42');
  await dialog.getByRole('button', { name: 'Enviar comprobante', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('pendiente de revisión');
  await expect(page.locator('.inspector')).toContainText('Pendiente');
  expect(fixture.calls.map((c) => c.path)).toEqual([
    '/documents/uploads',
    'storage-upload',
    '/documents/uploads/client-upload/complete',
    '/portal/dispatch-notes/client-note/payments',
  ]);
  expect(fixture.calls[3]?.body).toMatchObject({
    amount_cents: 10000,
    evidence_document_id: 'client-proof',
    reference: 'OP42',
  });
  await page.screenshot({
    path: `.impeccable/review/portal-modules/${testInfo.project.name}-payments.png`,
    fullPage: true,
  });
  await navigatePortal(page, 'Mis comprobantes');
  await expect(page.getByRole('heading', { name: 'B001-42', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar XML', exact: true })).toBeDisabled();
  const popup = page.context().waitForEvent('page');
  await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  const preview = await popup;
  await expect(preview).toHaveURL('https://files.example.test/client-invoice.pdf');
  await preview.close();
  await page.screenshot({
    path: `.impeccable/review/portal-modules/${testInfo.project.name}-invoices.png`,
    fullPage: true,
  });
});
