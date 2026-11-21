import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RuntimeConfig } from '../core/runtime-config';
import { CodeSearch } from './code-search';
afterEach(() => {
  vi.useRealTimers();
  TestBed.resetTestingModule();
});
it('muestra opciones al enfocar, agrupa pulsaciones y devuelve el código seleccionado', () => {
  vi.useFakeTimers();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
    ],
  });
  const fixture = TestBed.createComponent(CodeSearch);
  fixture.detectChanges();
  const page = fixture.componentInstance,
    http = TestBed.inject(HttpTestingController),
    picked = vi.fn(),
    changed = vi.fn();
  page.registerOnChange(changed);
  page.picked.subscribe(picked);
  page.focus();
  http
    .expectOne((r) => r.params.get('q') === '')
    .flush({ customers: [{ id: 'c1', locker_code: 'PE00042', name: 'Ana' }] });
  expect(page.rows()[0]?.code).toBe('PE00042');
  page.change('An');
  vi.advanceTimersByTime(200);
  http.expectNone((r) => r.params.get('q') === 'An');
  page.change('Ana');
  vi.advanceTimersByTime(300);
  http
    .expectOne((r) => r.params.get('q') === 'Ana')
    .flush({ customers: [{ id: 'c1', locker_code: 'PE00042', name: 'Ana' }] });
  page.key(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  page.key(new KeyboardEvent('keydown', { key: 'Enter' }));
  expect(picked).toHaveBeenCalledWith({ id: 'c1', code: 'PE00042', name: 'Ana' });
  expect(changed).toHaveBeenLastCalledWith('PE00042');
  expect(page.open()).toBe(false);
  http.verify();
});
