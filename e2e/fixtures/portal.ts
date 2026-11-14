import { expect, type Page } from '@playwright/test';
import { mockPanel } from './panel';

export async function mockPortal(
  page: Page,
  mode: 'new' | 'existing' | 'link' | 'pending' | 'validation' | 'already' = 'new',
  role = 'customer',
) {
  const panel = await mockPanel(page, role);
  const customer = {
    ...panel.customer,
    locker_addresses: [
      {
        warehouse_code: 'USA-TEST',
        recipient: panel.customer.name,
        line1: '100 Test Street',
        line2: 'Suite PE00042',
        city: 'Miami',
        state: 'FL',
        postal_code: '33101',
        country: 'USA',
      },
    ],
  };
  let onboarded = mode === 'existing';
  let pending = mode === 'pending';
  const writes: Record<string, unknown>[] = [];
  const requests: string[] = [];
  await page.route('**/api/v1/portal/**', async (route) => {
    const request = route.request();
    if (!request.headers()['authorization']?.startsWith('Bearer '))
      return route.fulfill({ status: 401, json: {} });
    const path = new URL(request.url()).pathname;
    requests.push(path);
    if (path.endsWith('/me'))
      return route.fulfill(
        onboarded
          ? { json: customer }
          : { status: 404, json: { code: 'onboarding_required', detail: 'Complete su registro.' } },
      );
    if (path.endsWith('/link-request'))
      return route.fulfill(
        pending
          ? { json: { id: 'link-test', status: 'pending', created_at: customer.created_at } }
          : { status: 404, json: { code: 'link_request_not_found' } },
      );
    if (path.endsWith('/onboarding') && request.method() === 'POST') {
      writes.push(request.postDataJSON() as Record<string, unknown>);
      if (mode === 'validation' && writes.length === 1)
        return route.fulfill({
          status: 422,
          json: {
            detail: 'Datos inválidos.',
            errors: { doc_number: 'Revisa el documento ingresado.' },
          },
        });
      if (mode === 'link') {
        pending = true;
        return route.fulfill({
          status: 409,
          json: { code: 'link_requested', detail: 'La vinculación requiere revisión.' },
        });
      }
      onboarded = true;
      if (mode === 'already')
        return route.fulfill({ status: 409, json: { code: 'already_onboarded' } });
      return route.fulfill({ status: 201, json: customer });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  return { customer, writes, requests };
}

export async function loginPortal(page: Page) {
  await page.goto('/login?returnUrl=%2Fportal');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/portal$/);
}

export async function fillOnboarding(page: Page) {
  await page.getByLabel('Número de documento', { exact: true }).fill('70000042');
  await page
    .getByLabel('Nombre completo o razón social', { exact: true })
    .fill('Cliente de prueba');
  await page.getByLabel('Teléfono', { exact: true }).fill('999000042');
}

export async function navigatePortal(page: Page, label: string) {
  await expect(page.locator('app-portal-shell')).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Abrir menú de mi cuenta', exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('link', { name: label, exact: true }).click();
}
