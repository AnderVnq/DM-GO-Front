import { test, expect } from '@playwright/test';
import { login, mockPanel } from './fixtures/panel';

for (const failed of ['notes', 'quotes'] as const) {
  test(`recupera ${failed === 'notes' ? 'las notas' : 'las cotizaciones'} sin interrumpir la otra sección`, async ({
    page,
  }) => {
    const { requests } = await mockPanel(page);
    const path = failed === 'notes' ? 'dispatch-notes' : 'quotes';
    let attempts = 0;
    await page.route(new RegExp(`/api/v1/${path}\\?`), async (route) => {
      attempts++;
      if (attempts === 1) {
        await route.fulfill({
          status: 503,
          json: { detail: 'Consulta temporalmente no disponible.' },
        });
      } else await route.fallback();
    });
    await login(page);
    const broken = page.locator('section').filter({
      has: page.getByRole('heading', {
        name: failed === 'notes' ? 'Notas de salida recientes' : 'Cotizaciones recientes',
        exact: true,
      }),
    });
    const healthy = page.locator('section').filter({
      has: page.getByRole('heading', {
        name: failed === 'notes' ? 'Cotizaciones recientes' : 'Notas de salida recientes',
        exact: true,
      }),
    });
    const healthyNumber = failed === 'notes' ? 'CA-TEST-42' : 'NS-TEST-42';
    const recoveredNumber = failed === 'notes' ? 'NS-TEST-42' : 'CA-TEST-42';
    await expect(broken.getByRole('alert')).toHaveText('Consulta temporalmente no disponible.');
    await expect(healthy.getByRole('cell', { name: healthyNumber, exact: true })).toBeVisible();
    await expect(healthy.getByRole('button', { name: 'Volver a intentar' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Buscar cliente', exact: true })).toBeVisible();
    await broken.getByRole('button', { name: 'Volver a intentar' }).click();
    await expect(broken.getByRole('cell', { name: recoveredNumber, exact: true })).toBeVisible();
    await expect(broken.getByRole('alert')).toHaveCount(0);
    await expect(broken.getByRole('button', { name: 'Volver a intentar' })).toHaveCount(0);
    await expect(healthy.getByRole('cell', { name: healthyNumber, exact: true })).toBeVisible();
    expect(attempts).toBe(2);
    expect(requests.filter((r) => r.path === '/customers' || r.path === '/packages')).toEqual([]);
    const healthyPath = failed === 'notes' ? '/quotes' : '/dispatch-notes';
    expect(requests.filter((r) => r.path === healthyPath && r.method === 'GET')).toHaveLength(1);
  });
}

test('distingue una consulta vacía de un error y conserva los límites del resumen', async ({
  page,
}) => {
  await mockPanel(page);
  await page.route(/\/api\/v1\/dispatch-notes\?/, (route) =>
    route.fulfill({ json: { dispatch_notes: [] } }),
  );
  await page.route(/\/api\/v1\/quotes\?/, (route) => route.fulfill({ json: { quotes: [] } }));
  await login(page);
  await expect(
    page.getByText('No hay notas disponibles para tu cuenta.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('No hay cotizaciones disponibles para tu cuenta.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Volver a intentar' })).toHaveCount(0);
  await expect(
    page.getByText('Hasta 5 notas recientes. Este conjunto no representa el total de la empresa.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Hasta 5 cotizaciones recientes, limitadas a los permisos de tu cuenta.', {
      exact: true,
    }),
  ).toBeVisible();
});

test('mantiene las cotizaciones utilizables mientras las notas siguen cargando', async ({
  page,
}) => {
  await mockPanel(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/v1\/dispatch-notes\?/, async (route) => {
    await pending;
    await route.fallback();
  });
  try {
    await login(page);
    await expect(page.getByRole('status').filter({ hasText: 'Cargando notas…' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'CA-TEST-42', exact: true })).toBeVisible();
    await expect(
      page.getByText('No hay notas disponibles para tu cuenta.', { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ver cotizaciones', exact: true })).toBeVisible();
    release();
    await expect(page.getByRole('cell', { name: 'NS-TEST-42', exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Cargando notas…' })).toHaveCount(0);
  } finally {
    release();
  }
});
