import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { LoginPage } from './login-page';

function restored(persisted = true) {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
}
async function setup() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  const auth = {
    user: signal(null),
    staff: signal(false),
    driver: signal(false),
    portalUser: signal(true),
    error: signal(''),
    ensureInitialized: vi.fn(async () => {}),
    login: vi.fn((_returnUrl?: string) => new Promise<void>(() => {})),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  const fixture = TestBed.createComponent(LoginPage);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, page: fixture.componentInstance, auth };
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});

it('recupera el botón al restaurar el login desde el historial y permite otro intento', async () => {
  const { fixture, page, auth } = await setup();
  void page.login();
  fixture.detectChanges();
  expect(page.busy()).toBe(true);
  restored(false);
  expect(page.busy()).toBe(true);
  restored();
  fixture.detectChanges();
  expect(page.busy()).toBe(false);
  expect(fixture.nativeElement.querySelector('.login-form button').disabled).toBe(false);
  expect(fixture.nativeElement.querySelector('.login-form button').textContent).toContain(
    'Iniciar sesión',
  );
  void page.login();
  expect(auth.login).toHaveBeenCalledTimes(2);
});

it('ignora errores de un intento anterior restaurado y evita el doble envío', async () => {
  const { page, auth } = await setup();
  let rejectOld!: (error: Error) => void;
  auth.login.mockImplementationOnce(
    () => new Promise<void>((_resolve, reject) => (rejectOld = reject)),
  );
  const old = page.login();
  await Promise.resolve();
  void page.login();
  expect(auth.login).toHaveBeenCalledTimes(1);
  restored();
  void page.login();
  expect(auth.login).toHaveBeenCalledTimes(2);
  rejectOld(new Error('Intento previo cancelado'));
  await old;
  expect(page.busy()).toBe(true);
  expect(page.error()).toBe('');
});
