import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { HomePage } from './home-page';

afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});
it('permite volver a crear el casillero al regresar del registro sin completarlo', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false })),
  );
  const auth = {
    user: signal(null),
    staff: signal(false),
    error: signal(''),
    ensureInitialized: vi.fn(async () => {}),
    register: vi.fn(() => new Promise<void>(() => {})),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  const fixture = TestBed.createComponent(HomePage);
  fixture.detectChanges();
  await fixture.whenStable();
  const page = fixture.componentInstance;
  void page.createLocker();
  await Promise.resolve();
  expect(page.busy()).toBe(true);
  expect(auth.register).toHaveBeenCalledTimes(1);
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: true });
  window.dispatchEvent(event);
  fixture.detectChanges();
  expect(page.busy()).toBe(false);
  expect(fixture.nativeElement.querySelector('.hero-actions button').disabled).toBe(false);
  void page.createLocker();
  await Promise.resolve();
  expect(auth.register).toHaveBeenCalledTimes(2);
});
