import { provideHttpClient } from '@angular/common/http';
import { RuntimeConfig } from '../../core/runtime-config';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CustomersPage } from './customers-page';
import { CustomersApi } from './customers-api';
import type { CustomerListPage, Customer } from './customer.model';

const empty: CustomerListPage = { customers: [], total: 0, limit: 25, offset: 0 };
function setup(list = vi.fn(() => of(empty))) {
  const api = { list, get: vi.fn(), findByLocker: vi.fn(() => of(null)) };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
      provideRouter([]),
      { provide: CustomersApi, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(CustomersPage);
  fixture.detectChanges();
  return { page: fixture.componentInstance, api, fixture };
}
afterEach(() => TestBed.resetTestingModule());
it('carga el listado al entrar, cambia de página y reinicia al filtrar', () => {
  const { page, api } = setup(vi.fn(() => of({ ...empty, total: 60 })));
  expect(api.list).toHaveBeenLastCalledWith({ q: '', sort: 'newest', limit: 25, offset: 0 });
  page.changePage(1);
  expect(api.list).toHaveBeenLastCalledWith({ q: '', sort: 'newest', limit: 25, offset: 25 });
  page.listFilters.patchValue({ q: 'Ana', sort: 'name', limit: 50 });
  page.applyListFilters();
  expect(api.list).toHaveBeenLastCalledWith({ q: 'Ana', sort: 'name', limit: 50, offset: 0 });
});
it('descarta una respuesta anterior al cambiar filtros', () => {
  const pending = new Subject<CustomerListPage>();
  const list = vi.fn().mockReturnValueOnce(pending).mockReturnValue(of(empty));
  const { page } = setup(list);
  page.listFilters.controls.q.setValue('Sin coincidencia');
  page.applyListFilters();
  pending.next({ ...empty, total: 500 });
  expect(page.listPage()?.total).toBe(0);
  expect(page.listLoading()).toBe(false);
});
it('diferencia el error de un listado vacío y permite reintentar', () => {
  const list = vi
    .fn()
    .mockReturnValueOnce(throwError(() => new Error('Sin red')))
    .mockReturnValue(of(empty));
  const { page } = setup(list);
  expect(page.listError()).not.toBe('');
  expect(page.listPage()).toBeNull();
  page.reloadList();
  expect(page.listError()).toBe('');
  expect(page.listPage()?.total).toBe(0);
});
it('regresa de una ficha conservando la consulta y página aplicadas', () => {
  const { page, api } = setup(vi.fn(() => of({ ...empty, total: 60, offset: 25 })));
  page.customer.set({ id: 'c-1' } as Customer);
  page.backToList();
  expect(page.customer()).toBeNull();
  expect(api.list).toHaveBeenCalledTimes(1);
  expect(page.listPage()?.offset).toBe(25);
});
it('corrige la página si el total disminuyó', () => {
  const list = vi
    .fn()
    .mockReturnValueOnce(of({ ...empty, total: 60 }))
    .mockReturnValueOnce(of({ ...empty, total: 10, offset: 25 }))
    .mockReturnValue(of({ ...empty, total: 10 }));
  const { page } = setup(list);
  page.changePage(1);
  expect(list).toHaveBeenLastCalledWith({ q: '', sort: 'newest', limit: 25, offset: 0 });
  expect(page.listLoading()).toBe(false);
});

it('rechaza búsquedas exactas con solo espacios antes de llamar a la API', () => {
  const { page, api } = setup();
  page.search.setValue({ kind: 'locker', value: '   ' });
  page.find();
  expect(api.findByLocker).not.toHaveBeenCalled();
});
it('reinicia el desplazamiento cuando el listado queda vacío', () => {
  const list = vi
    .fn()
    .mockReturnValueOnce(of({ ...empty, total: 26 }))
    .mockReturnValue(of({ ...empty, offset: 25 }));
  const { page } = setup(list);
  page.changePage(1);
  expect(page.listPage()?.offset).toBe(0);
  expect(page.listPage()?.total).toBe(0);
});
