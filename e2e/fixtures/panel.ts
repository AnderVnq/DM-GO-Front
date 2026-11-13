import { expect, type Page } from '@playwright/test';
import type { Customer } from '../../src/app/modules/customers/customer.model';
import type { Package } from '../../src/app/modules/shipments/package.model';
import type { Quote } from '../../src/app/modules/quotes/quote.model';
import type { DispatchNote } from '../../src/app/modules/billing/dispatch-note.model';

// Dobles exclusivos del navegador de pruebas. La aplicación conserva su cliente OIDC real.
export async function mockPanel(page: Page, role = 'supervisor') {
  const issuer = 'http://localhost:3000/test-idp/realms/dm48';
  let nonce = '';
  const requests: { path: string; method: string; body: Record<string, unknown> | null }[] = [];
  const customer: Customer = {
    id: 'customer-test',
    locker_code: 'PE00042',
    name: 'Cliente de prueba',
    email: 'cliente@example.test',
    phone: '999000042',
    document: { type: 'dni', number: '70000042', verified: true },
    addresses: [],
    locker_addresses: [],
    created_at: '2026-11-12T12:00:00Z',
  };
  const packages: Package[] = [
    {
      id: 'package-test',
      customer_id: customer.id,
      mode: 'courier',
      status: 'RELEASED',
      store: 'Tienda de prueba',
      carrier_tracking: 'TEST-TRACK-42',
      description: 'Audífonos de prueba',
      declared_value_cents: 10000,
      has_invoice: false,
      created_at: customer.created_at,
    },
  ];
  let note: DispatchNote = {
    id: 'note-test',
    number: 'NS-TEST-42',
    customer_id: customer.id,
    status: 'draft',
    method: 'pickup',
    total_cents: 10000,
    paid_cents: 0,
    balance_cents: 10000,
    currency: 'USD',
    guides: [],
    lines: [],
    payments: [],
    created_at: customer.created_at,
  };
  const quote: Quote = {
    id: 'quote-test',
    number: 'CA-TEST-42',
    status: 'pending',
    product_name: 'Producto de prueba',
    unit_cents: 10000,
    quantity: 1,
    grams: 500,
    currency: 'USD',
    total_cents: 11500,
    breakdown: [
      { concept: 'product', cents: 10000 },
      { concept: 'assisted_purchase', cents: 1000 },
      { concept: 'peru_tax_estimate', cents: 500 },
    ],
    created_at: customer.created_at,
    expires_at: '2026-11-30T12:00:00Z',
  };
  await page.route('**/app-config.json', (route) =>
    route.fulfill({
      json: {
        apiBaseUrl: '/api/v1',
        oidcUrl: 'http://localhost:3000/test-idp',
        oidcRealm: 'dm48',
        oidcClientId: 'dm48-web',
      },
    }),
  );
  await page.route('**/test-idp/realms/dm48/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/3p-cookies/step1.html')) {
      await route.fulfill({
        contentType: 'text/html',
        body: "<script>parent.postMessage('supported', location.origin)</script>",
      });
    } else if (url.pathname.endsWith('/auth')) {
      const callback = new URL(url.searchParams.get('redirect_uri')!);
      const params = new URLSearchParams({ state: url.searchParams.get('state')!, iss: issuer });
      if (url.searchParams.get('prompt') === 'none') params.set('error', 'login_required');
      else {
        nonce = url.searchParams.get('nonce')!;
        params.set('code', 'test-code');
      }
      callback.hash = params.toString();
      await route.fulfill({ status: 302, headers: { location: callback.href } });
    } else if (url.pathname.endsWith('/token')) {
      const now = Math.floor(Date.now() / 1000);
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = `${encode({ alg: 'none' })}.${encode({ sub: 'staff-test', iss: issuer, aud: 'dm48-web', iat: now, exp: now + 300, nonce, realm_access: { roles: [role] } })}.test`;
      await route.fulfill({
        json: {
          access_token: token,
          id_token: token,
          refresh_token: token,
          token_type: 'Bearer',
          expires_in: 300,
          refresh_expires_in: 3600,
        },
      });
    } else await route.fulfill({ status: 404 });
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    const body = request.postDataJSON() as Record<string, unknown> | null;
    requests.push({ path, method, body });
    if (!request.headers()['authorization']?.startsWith('Bearer ')) {
      await route.fulfill({ status: 401, json: { detail: 'Sesión requerida.' } });
      return;
    }
    let data: unknown;
    if (path === '/me')
      data = {
        id: 'staff-test',
        username: 'staff.test',
        name: 'Personal de prueba',
        roles: [role],
      };
    else if (path === '/customers' || path === `/customers/${customer.id}`) data = customer;
    else if (path === '/packages' && method === 'GET') {
      if (new URL(request.url()).searchParams.get('customer_id') !== customer.id) {
        await route.fulfill({ status: 400, json: { detail: 'Falta el cliente.' } });
        return;
      }
      data = { packages };
    } else if (path === '/packages' && method === 'POST') {
      data = { ...packages[0], ...body, id: 'prealert-test', status: 'PREALERTED' };
      packages.unshift(data as Package);
    } else if (/^\/packages\/[^/]+\/tracking$/.test(path))
      data = {
        package_id: path.split('/')[2],
        status: 'RELEASED',
        events: [
          {
            at: customer.created_at,
            action: 'package.released',
            title: 'Liberado por aduana',
            location: 'LIM-01',
          },
        ],
      };
    else if (path === '/dispatch-notes' && method === 'GET') data = { dispatch_notes: [note] };
    else if (path === `/dispatch-notes/${note.id}`) data = note;
    else if (path === `/dispatch-notes/${note.id}/liquidate` && method === 'POST') {
      note = { ...note, status: 'pending_payment', liquidation_number: 'LIQ-TEST-42' };
      data = note;
    } else if (path === `/dispatch-notes/${note.id}/payments` && method === 'POST') {
      const amount = body?.['amount_cents'] as number;
      note = {
        ...note,
        status: 'paid',
        paid_cents: amount,
        balance_cents: note.total_cents - amount,
        payments: [
          {
            id: 'payment-test',
            method: body?.['method'] as string,
            origin: body?.['origin'] as string,
            amount_cents: amount,
            paid_at: customer.created_at,
            status: 'accepted',
          },
        ],
      };
      data = note;
    } else if (path === '/quotes') data = { quotes: [quote] };
    else if (path === '/quotes/quote-test') data = quote;
    else {
      await route.fulfill({
        status: 404,
        json: { detail: `Petición sin doble: ${method} ${path}` },
      });
      return;
    }
    await route.fulfill({ json: data });
  });
  return { requests, customer };
}

export async function login(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}

export async function navigate(page: Page, name: string, path: string) {
  const toggle = page.getByRole('button', { name: 'Abrir navegación' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/internal/${path}`));
}
