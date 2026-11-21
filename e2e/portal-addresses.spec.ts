import { test, expect } from '@playwright/test';
import { mockPortal, loginPortal, navigatePortal } from './fixtures/portal';
test('edita direcciones con cambios explícitos, conserva errores y permite quitar el punto', async ({
  page,
}, info) => {
  await mockPortal(page, 'existing');
  await page.route('**/api/v1/portal/packages', (r) => r.fulfill({ json: { packages: [] } }));
  await page.route('**/api/v1/portal/agencies', (r) => r.fulfill({ json: { agencies: [] } }));
  let address = {
    id: 'address-1',
    ubigeo: '150131',
    line: 'Av. Javier Prado 123',
    reference: 'Puerta principal',
    primary: true,
    latitude: -12.09 as number | null,
    longitude: -77.03 as number | null,
  };
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/v1/portal/addresses**', (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { addresses: [address] } });
    const body = route.request().postDataJSON();
    writes.push(body);
    if (writes.length === 1)
      return route.fulfill({ status: 422, json: { detail: 'Revisa la referencia de entrega.' } });
    address = {
      ...address,
      ...body,
      ...(body.clear_point ? { latitude: null, longitude: null } : {}),
    };
    return route.fulfill({ json: address });
  });
  await loginPortal(page);
  await navigatePortal(page, 'Mis entregas');
  const opener = page.getByRole('button', {
    name: 'Editar dirección Av. Javier Prado 123',
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Editar dirección', exact: true });
  await expect(dialog.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
  await dialog.getByLabel('Referencia (opcional)').fill('Piso 2');
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Revisa la referencia');
  await expect(dialog.getByLabel('Referencia (opcional)')).toHaveValue('Piso 2');
  await dialog.getByRole('button', { name: 'Quitar punto exacto', exact: true }).click();
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(writes[1]).toMatchObject({ clear_point: true, reference: 'Piso 2' });
  expect(writes[1]).not.toHaveProperty('latitude');
  await expect(opener).toBeFocused();
  await expect(
    page.getByText('Sin punto exacto; se usará el distrito', { exact: false }),
  ).toBeVisible();
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(writes).toHaveLength(2);
  await page.screenshot({ path: info.outputPath('portal-addresses.png'), fullPage: true });
});

test('crea una dirección buscando distrito por nombre sin obligar a marcar un punto', async ({
  page,
}) => {
  await mockPortal(page, 'existing');
  await page.route('**/api/v1/portal/packages', (r) => r.fulfill({ json: { packages: [] } }));
  await page.route('**/api/v1/portal/agencies', (r) => r.fulfill({ json: { agencies: [] } }));
  let saved: Record<string, unknown> | undefined;
  await page.route('**/api/v1/portal/addresses', (r) => {
    if (r.request().method() === 'GET') return r.fulfill({ json: { addresses: [] } });
    saved = r.request().postDataJSON();
    return r.fulfill({
      status: 201,
      json: { id: 'new-address', ...saved, latitude: null, longitude: null },
    });
  });
  await page.route('**/api/v1/ubigeo/districts?**', (r) => {
    expect(new URL(r.request().url()).searchParams.get('q')).toBe('jesus maria');
    return r.fulfill({
      json: {
        districts: [
          {
            code: '150113',
            name: 'Jesús María',
            province: 'Lima',
            department: 'Lima',
            center: { lat: -12.07, lng: -77.05 },
          },
        ],
      },
    });
  });
  await loginPortal(page);
  await navigatePortal(page, 'Mis entregas');
  await page.getByRole('button', { name: 'Nueva dirección', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva dirección', exact: true });
  await dialog.getByLabel('Buscar distrito').fill('jesus maria');
  await dialog.getByRole('button', { name: 'Buscar', exact: true }).click();
  await dialog.getByLabel('Distrito (obligatorio)').selectOption('150113');
  await dialog.getByLabel('Dirección (obligatoria)').fill('Av. Brasil 123');
  await dialog.getByRole('button', { name: 'Guardar dirección', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(saved).toMatchObject({ ubigeo: '150113', line: 'Av. Brasil 123' });
  expect(saved).not.toHaveProperty('latitude');
});
