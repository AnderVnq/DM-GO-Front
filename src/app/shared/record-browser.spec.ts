import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RuntimeConfig } from '../core/runtime-config';
import { RecordBrowser } from './record-browser';
function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
    ],
  });
  const fixture = TestBed.createComponent(RecordBrowser);
  fixture.componentRef.setInput('resource', 'bulks');
  fixture.componentRef.setInput('title', 'Bultos disponibles');
  fixture.componentRef.setInput('columns', [{ key: 'code', label: 'Código' }]);
  fixture.componentRef.setInput('filters', {
    status: 'closed',
    free: 'true',
    warehouse_code: 'USA-01',
  });
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, http: TestBed.inject(HttpTestingController) };
}
afterEach(() => TestBed.resetTestingModule());
it('filtra en el servidor, pagina y reinicia la página al buscar sin perder las restricciones', () => {
  const { page, http } = setup();
  const first = http.expectOne((r) => r.url === '/api/v1/bulks');
  expect(first.request.params.get('free')).toBe('true');
  expect(first.request.params.get('warehouse_code')).toBe('USA-01');
  first.flush({ bulks: [{ id: 'a', code: 'BLK-01' }], total: 21, limit: 10, offset: 0 });
  page.load(10);
  const second = http.expectOne((r) => r.params.get('offset') === '10');
  second.flush({ bulks: [], total: 0, limit: 10, offset: 10 });
  page.query = ' precinto ';
  page.search();
  const search = http.expectOne((r) => r.params.get('q') === 'precinto');
  expect(search.request.params.get('offset')).toBe('0');
  expect(search.request.params.get('status')).toBe('closed');
  search.flush({ bulks: [], total: 0, limit: 10, offset: 0 });
  http.verify();
});
it('cancela búsquedas anteriores y distingue errores de resultados vacíos', () => {
  const { page, fixture, http } = setup();
  const old = http.expectOne((r) => r.url === '/api/v1/bulks');
  page.query = 'nuevo';
  page.search();
  expect(old.cancelled).toBe(true);
  http
    .expectOne((r) => r.params.get('q') === 'nuevo')
    .flush({ detail: 'Servicio no disponible' }, { status: 503, statusText: 'Unavailable' });
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
    'Servicio no disponible',
  );
  expect(fixture.nativeElement.textContent).not.toContain('No hay registros que coincidan');
  page.load();
  http
    .expectOne((r) => r.params.get('q') === 'nuevo')
    .flush({ bulks: [], total: 0, limit: 10, offset: 0 });
  expect(page.error()).toBe('');
  http.verify();
});
it('impide seleccionar mientras hay una operación en curso', () => {
  const { page, fixture, http } = setup();
  const selected = vi.fn();
  page.selected.subscribe(selected);
  page.choose('a');
  expect(selected).not.toHaveBeenCalled();
  http
    .expectOne((r) => r.url === '/api/v1/bulks')
    .flush({ bulks: [{ id: 'a', code: 'BLK-01' }], total: 1 });
  fixture.componentRef.setInput('disabled', true);
  page.choose('a');
  expect(selected).not.toHaveBeenCalled();
  fixture.componentRef.setInput('disabled', false);
  page.choose('a');
  expect(selected).toHaveBeenCalledWith('a');
  http.verify();
});
it('conserva las filas y el nodo de tabla durante una recarga y ante un error', () => {
  const { page, fixture, http } = setup();
  http
    .expectOne((r) => r.url === '/api/v1/bulks')
    .flush({
      bulks: [{ id: 'a', code: 'BLK-01' }],
      total: 1,
    });
  fixture.detectChanges();
  const table = fixture.nativeElement.querySelector('table');
  page.load();
  fixture.detectChanges();
  expect(page.rows()).toHaveLength(1);
  expect(fixture.nativeElement.querySelector('table')).toBe(table);
  expect(fixture.nativeElement.querySelector('tbody button').disabled).toBe(true);
  http
    .expectOne((r) => r.url === '/api/v1/bulks')
    .flush({ detail: 'Servicio no disponible' }, { status: 503, statusText: 'Unavailable' });
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('table')).toBe(table);
  expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
    'Servicio no disponible',
  );
  http.verify();
});

it('conserva la búsqueda, página y nodo de fila al actualizar una ficha en un modal', () => {
  const { page, fixture, http } = setup();
  const rows = [{ id: 'b', code: 'BLK-20' }];
  http.expectOne((r) => r.url === '/api/v1/bulks').flush({ bulks: rows, total: 21 });
  page.query = 'precinto';
  page.search();
  http.expectOne((r) => r.params.get('q') === 'precinto').flush({ bulks: rows, total: 21 });
  page.load(10);
  http.expectOne((r) => r.params.get('offset') === '10').flush({ bulks: rows, total: 21 });
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('tbody button');
  fixture.componentRef.setInput('refresh', 1);
  fixture.detectChanges();
  const refresh = http.expectOne((r) => r.params.get('offset') === '10');
  expect(refresh.request.params.get('q')).toBe('precinto');
  refresh.flush({ bulks: rows, total: 21 });
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('tbody button')).toBe(button);
  http.verify();
});
