import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { CustomersPage } from './customers-page';
import { CustomersApi } from './customers-api';
import type { Customer } from './customer.model';

it('una búsqueda pendiente no reemplaza al cliente recién registrado', () => {
  const old: Customer = {
    id: 'old',
    locker_code: 'PE00042',
    name: 'Anterior',
    email: 'old@example.test',
    phone: '999000042',
    document: { type: 'dni', number: '70000042', verified: true },
    addresses: [],
    created_at: '2026-11-13T00:00:00Z',
  };
  const created: Customer = { ...old, id: 'new', locker_code: 'PE00043', name: 'Nuevo' };
  const pending = new Subject<Customer>();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: CustomersApi,
        useValue: { findByLocker: () => pending, create: () => of(created) },
      },
      provideRouter([]),
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(CustomersPage);
  fixture.detectChanges();
  fixture.nativeElement.querySelector('dialog').close = vi.fn();
  const page = fixture.componentInstance;
  page.search.setValue({ kind: 'locker', value: 'PE00042' });
  page.find();
  page.form.setValue({
    doc_type: 'dni',
    doc_number: '70000043',
    name: 'Nuevo',
    email: 'new@example.test',
    phone: '999000043',
  });
  page.create();
  pending.next(old);
  expect(page.customer()?.id).toBe('new');
  expect(page.loading()).toBe(false);
  expect(navigate).toHaveBeenLastCalledWith([], { queryParams: { id: 'new' }, replaceUrl: true });
});

it('la respuesta lenta de una búsqueda no reemplaza al segundo cliente encontrado', () => {
  const first = new Subject<Customer>();
  const second: Customer = {
    id: 'second',
    locker_code: 'PE00043',
    name: 'Segundo cliente',
    email: 'second@example.test',
    phone: '999000043',
    document: { type: 'dni', number: '70000043', verified: true },
    addresses: [],
    created_at: '2026-11-13T00:00:00Z',
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: CustomersApi,
        useValue: { findByLocker: (code: string) => (code === 'PE00042' ? first : of(second)) },
      },
      provideRouter([]),
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const page = TestBed.createComponent(CustomersPage).componentInstance;
  page.search.setValue({ kind: 'locker', value: 'PE00042' });
  page.find();
  page.search.controls.value.setValue('PE00043');
  page.find();
  first.next({ ...second, id: 'first', locker_code: 'PE00042' });
  expect(page.customer()?.id).toBe('second');
  expect(page.loading()).toBe(false);
  expect(navigate).toHaveBeenLastCalledWith([], {
    queryParams: { id: 'second' },
    replaceUrl: true,
  });
});
