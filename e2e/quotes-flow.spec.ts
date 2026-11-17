import { test, expect } from '@playwright/test';
import { login, mockPanel, navigate } from './fixtures/panel';

for (const { store, url } of [
  { store: '', url: '' },
  { store: 'Tienda de prueba', url: '' },
  { store: '', url: 'https://example.test/producto' },
  { store: 'Tienda de prueba', url: 'https://example.test/producto' },
]) {
  test(`crea una cotización con tienda ${store ? 'indicada' : 'vacía'} y enlace ${url ? 'indicado' : 'vacío'}`, async ({
    page,
  }) => {
    const fixture = await mockPanel(page);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Resumen de la operación' })).toBeVisible();
    await navigate(page, 'Cotizaciones', 'quotes');
    await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
    const workbench = page.locator('.quote-workbench');
    await workbench.getByLabel('Nombre del cliente o prospecto').fill('Prospecto de prueba');
    await workbench.getByLabel('Correo electrónico').fill('prospecto@example.test');
    await workbench.getByLabel('Producto', { exact: true }).fill('Audífonos');
    await workbench.getByLabel(/^Tienda/).fill(store);
    await workbench.getByLabel(/^Enlace del producto/).fill(url);
    await workbench.getByLabel('Precio unitario en USD').fill('100.00');
    await workbench.getByLabel('Peso (KG)').fill('0.500');
    await expect(
      workbench.getByRole('button', { name: 'Guardar sin correo', exact: true }),
    ).toBeEnabled();
    await workbench.getByRole('button', { name: 'Guardar sin correo', exact: true }).click();
    await expect(workbench).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'CA-TEST-43', exact: true })).toBeVisible();
    const requests = fixture.requests.filter((r) => r.path === '/quotes' && r.method === 'POST');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toMatchObject({
      store,
      product_url: url,
      product_name: 'Audífonos',
      unit_cents: 10000,
      weight_kg: '0.500',
      quantity: 1,
    });
  });
}

for (const status of [422, 403, 409]) {
  test(`conserva las entradas y permite corregir una creación rechazada con ${status}`, async ({
    page,
  }) => {
    await mockPanel(page);
    let attempts = 0;
    await page.route('**/api/v1/quotes', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      attempts++;
      if (attempts === 1)
        await route.fulfill({
          status,
          json: {
            detail: 'No se pudo registrar esta cotización.',
            errors: { product_name: 'Revisa el producto.' },
          },
        });
      else await route.fallback();
    });
    await login(page);
    await navigate(page, 'Cotizaciones', 'quotes');
    await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
    const workbench = page.locator('.quote-workbench');
    await workbench.getByLabel('Nombre del cliente o prospecto').fill('Prospecto recuperable');
    await workbench.getByLabel('Correo electrónico').fill('prospecto@example.test');
    await workbench.getByLabel('Producto', { exact: true }).fill('Audífonos');
    await workbench.getByLabel('Precio unitario en USD').fill('100.25');
    await workbench.getByLabel('Peso (KG)').fill('0.500');
    await workbench.getByRole('button', { name: 'Guardar sin correo', exact: true }).click();
    await expect(workbench.getByRole('alert')).toHaveText('No se pudo registrar esta cotización.');
    await expect(workbench.getByLabel('Nombre del cliente o prospecto')).toHaveValue(
      'Prospecto recuperable',
    );
    await expect(workbench.getByLabel('Producto', { exact: true })).toHaveValue('Audífonos');
    await expect(workbench.getByLabel('Precio unitario en USD')).toHaveValue('100.25');
    await workbench.getByRole('button', { name: 'Ver historial', exact: true }).click();
    await expect(page.locator('.inspector h2')).toHaveText('CA-TEST-42');
    await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
    await expect(workbench.getByLabel('Producto', { exact: true })).toHaveValue('Audífonos');
    expect(attempts).toBe(1);
    await workbench.getByRole('button', { name: 'Guardar sin correo', exact: true }).click();
    await expect(workbench).not.toBeVisible();
    await expect(page.locator('.inspector h2')).toHaveText('CA-TEST-43');
    expect(attempts).toBe(2);
  });
}

test('descarga el PDF binario de la cotización con su número', async ({ page }) => {
  await mockPanel(page);
  await page.route('**/api/v1/quotes/quote-test/pdf', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.7\nCotización de prueba' }),
  );
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('CA-TEST-42.pdf');
  expect(await file.failure()).toBeNull();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('exige correo o teléfono del prospecto antes de enviar la cotización', async ({ page }) => {
  const fixture = await mockPanel(page);
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
  const workbench = page.locator('.quote-workbench');
  await workbench.getByLabel('Nombre del cliente o prospecto').fill('Nuevo prospecto');
  await workbench.getByLabel('Producto', { exact: true }).fill('Audífonos');
  await workbench.getByLabel('Precio unitario en USD').fill('100');
  await workbench.getByLabel('Peso (KG)').fill('0.500');
  await workbench.getByRole('button', { name: 'Guardar sin correo', exact: true }).click();
  await expect(workbench.getByRole('alert')).toHaveText(
    'Indica al menos un correo electrónico o teléfono para el prospecto.',
  );
  expect(fixture.requests.filter((r) => r.path === '/quotes' && r.method === 'POST')).toHaveLength(
    0,
  );
  await workbench.getByLabel('Teléfono', { exact: true }).fill('999000043');
  await workbench.getByRole('button', { name: 'Guardar sin correo', exact: true }).click();
  await expect(workbench).not.toBeVisible();
  await expect(page.locator('.inspector h2')).toHaveText('CA-TEST-43');
  expect(
    fixture.requests.filter((r) => r.path === '/quotes' && r.method === 'POST')[0]?.body,
  ).toMatchObject({
    prospect_name: 'Nuevo prospecto',
    prospect_phone: '999000043',
    prospect_email: '',
  });
});

test('prepara tarifas y servicios con resumen adaptable en ambos temas', async ({ page }, info) => {
  const fixture = await mockPanel(page);
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
  const workbench = page.locator('.quote-workbench');
  await workbench.getByLabel('Nombre del cliente o prospecto').fill('María Torres');
  await workbench.getByLabel('Correo electrónico').fill('maria@example.test');
  await workbench.getByLabel('Producto', { exact: true }).fill('Audífonos inalámbricos');
  await workbench.getByLabel('Precio unitario en USD').fill('100.00');
  await workbench.getByLabel('Peso (KG)').fill('1.001');
  await workbench.getByLabel('Impuesto en USA (%)').fill('7');
  await workbench.getByLabel('Compra asistida (%)').fill('5');
  await workbench.getByLabel('Tarifa de envío por kg en USD').fill('10');
  await workbench.getByRole('button', { name: 'Añadir servicio', exact: true }).click();
  await workbench
    .getByRole('combobox', { name: 'Servicio adicional', exact: true })
    .selectOption('HANDLING_TEST');
  await workbench.getByLabel('Cantidad del servicio').fill('2');
  await workbench.getByLabel('Precio del servicio en USD').fill('1.25');
  const summary = workbench.locator('.quote-summary');
  await expect(summary.locator('.summary-subtotal')).toContainText(/USD\s+124\.51/);
  await expect(summary).toContainText('Por calcular');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await workbench.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`quotes-${theme}.png`), animations: 'disabled' });
    if (info.project.name === 'mobile') {
      await summary.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`quotes-summary-${theme}.png`),
        animations: 'disabled',
      });
    }
  }
  await workbench.getByRole('button', { name: 'Guardar sin correo', exact: true }).click();
  await expect(workbench).not.toBeVisible();
  const request = fixture.requests.find((r) => r.path === '/quotes' && r.method === 'POST');
  expect(request?.body).toMatchObject({
    weight_kg: '1.001',
    tax_usa_bp: 700,
    assisted_bp: 500,
    rate_per_kg_cents: 1000,
    extras: [{ code: 'HANDLING_TEST', quantity: 2, unit_cents: 125 }],
  });
});

test('Enter busca el casillero sin crear y conserva la tarifa automática del cliente', async ({
  page,
}) => {
  const fixture = await mockPanel(page);
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
  const workbench = page.locator('.quote-workbench');
  await workbench.getByLabel('Nombre del cliente o prospecto').fill('Cliente de prueba');
  await workbench.getByLabel('Correo electrónico').fill('cliente@example.test');
  await workbench.getByLabel('Producto', { exact: true }).fill('Libro');
  await workbench.getByLabel('Precio unitario en USD').fill('100');
  await workbench.getByLabel('Peso (KG)').fill('1');
  await workbench.getByLabel('Casillero de cliente (opcional)').fill('PE00042');
  await workbench.getByLabel('Casillero de cliente (opcional)').press('Enter');
  await expect(workbench).toContainText('Cliente seleccionado:');
  expect(fixture.requests.filter((r) => r.path === '/quotes' && r.method === 'POST')).toHaveLength(
    0,
  );
  await workbench.getByRole('button', { name: 'Añadir servicio', exact: true }).click();
  await workbench
    .getByRole('combobox', { name: 'Servicio adicional', exact: true })
    .selectOption('HANDLING_TEST');
  await expect(workbench.locator('.quote-summary')).toContainText('Por calcular');
  await workbench.getByRole('button', { name: 'Guardar sin correo', exact: true }).click();
  await expect(workbench).not.toBeVisible();
  const request = fixture.requests.find((r) => r.path === '/quotes' && r.method === 'POST');
  expect(request?.body).toMatchObject({
    customer_id: 'customer-test',
    extras: [{ code: 'HANDLING_TEST', quantity: 1 }],
  });
  expect((request?.body?.['extras'] as Record<string, unknown>[])[0]).not.toHaveProperty(
    'unit_cents',
  );
});

test('guarda con reglas nuevas y reintenta el correo sin crear otra cotización', async ({
  page,
}) => {
  const fixture = await mockPanel(page);
  let creations = 0;
  await page.route('**/api/v1/quotes', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    creations++;
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: {
        ...body,
        id: 'saved-email-quote',
        number: 'CA-EMAIL-44',
        status: 'pending',
        currency: 'USD',
        total_cents: 25136,
        breakdown: [
          { concept: 'product', cents: 10000 },
          { concept: 'tax_usa', cents: 700 },
          { concept: 'assisted_purchase', cents: 500 },
          { concept: 'freight', cents: 500 },
          { concept: 'traveler', cents: 7000 },
          { concept: 'supplements', cents: 2700 },
          { concept: 'peru_tax_estimate', cents: 2500 },
          { concept: 'delivery_lima', cents: 1235 },
          { concept: 'agency_dispatch', cents: 1 },
        ],
        created_at: '2026-11-16T12:00:00Z',
        expires_at: '2099-11-26T04:59:59Z',
        email_sent: false,
        email_error: 'SMTP temporalmente no disponible',
      },
    });
  });
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
  const workbench = page.locator('.quote-workbench');
  await workbench.getByLabel('Nombre del cliente o prospecto').fill('Prospecto de envío');
  await workbench.getByLabel('Correo electrónico').fill('prospecto@example.test');
  await workbench.getByLabel('Producto', { exact: true }).fill('Suplemento');
  await workbench.getByLabel('Precio unitario en USD').fill('100');
  await workbench.getByLabel('Peso (KG)').fill('0,250');
  await workbench.getByLabel('Modalidad viajero').check();
  await workbench.getByLabel('Envío con viajero (%) (opcional)').fill('15.25');
  await workbench.getByLabel('Suplementos o líquidos').check();
  await workbench.getByLabel('Unidades de suplementos').fill('3');
  await workbench.getByLabel('Tributos estimados en Perú').selectOption('yes');
  await workbench.getByLabel('Delivery en Lima en USD').fill('12,35');
  await workbench.getByLabel('Despacho a agencia en USD').fill('0.01');
  await workbench.getByLabel('Válida hasta (opcional)').fill('2026-11-25');
  const createRequest = page.waitForRequest(
    (request) => request.url().endsWith('/api/v1/quotes') && request.method() === 'POST',
  );
  await workbench.getByRole('button', { name: 'Guardar y enviar', exact: true }).click();
  expect((await createRequest).postDataJSON()).toMatchObject({
    peru_tax_mode: 'yes',
    traveler_percent_bp: 1525,
    supplements: true,
    supplement_units: 3,
    delivery_lima_cents: 1235,
    agency_dispatch_cents: 1,
    valid_until: '2026-11-25',
    weight_kg: '0.250',
    send_email: true,
  });
  await expect(workbench).not.toBeVisible();
  await expect(page.locator('.inspector h2')).toHaveText('CA-EMAIL-44');
  await expect(page.getByRole('status')).toContainText('La cotización está guardada.');
  await expect(page.getByRole('status')).toContainText('SMTP temporalmente no disponible');
  await page.getByRole('button', { name: 'Enviar por correo', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Cotización enviada por correo.');
  expect(
    fixture.requests.filter((request) => request.path === '/quotes/saved-email-quote/send'),
  ).toHaveLength(1);
  expect(creations).toBe(1);
});

test('mantiene de solo lectura el precio fijo del catálogo', async ({ page }) => {
  await mockPanel(page);
  await page.route('**/api/v1/charge-types', (route) =>
    route.fulfill({
      json: {
        charge_types: [
          {
            code: 'FIXED_TEST',
            name: 'Servicio fijo',
            active: true,
            default_cents: 350,
            quote_price_editable: false,
          },
          {
            code: 'FREE_TEST',
            name: 'Servicio sin tarifa',
            active: true,
            default_cents: null,
            quote_price_editable: false,
          },
        ],
      },
    }),
  );
  await login(page);
  await navigate(page, 'Cotizaciones', 'quotes');
  await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click();
  const workbench = page.locator('.quote-workbench');
  await workbench.getByRole('button', { name: 'Añadir servicio', exact: true }).click();
  await workbench
    .getByRole('combobox', { name: 'Servicio adicional', exact: true })
    .selectOption('FIXED_TEST');
  await expect(workbench.getByLabel('Precio del servicio en USD')).toHaveAttribute('readonly', '');
  await workbench
    .getByRole('combobox', { name: 'Servicio adicional', exact: true })
    .selectOption('FREE_TEST');
  await expect(workbench.getByLabel('Precio del servicio en USD')).not.toHaveAttribute('readonly');
});
