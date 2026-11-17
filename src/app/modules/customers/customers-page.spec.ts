import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CustomersPage } from './customers-page';
import { CustomersApi } from './customers-api';
import type { Customer } from './customer.model';

const customer: Customer = {
  id: 'customer-1',
  locker_code: 'PE00042',
  name: 'Cliente de prueba',
  email: 'cliente@example.test',
  phone: '999000042',
  document: { type: 'dni', number: '70000042', verified: true },
  addresses: [],
  created_at: '2026-11-12T12:00:00Z',
};
function setup() {
  const api = { updateContact: vi.fn(() => of(customer)) };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: CustomersApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(CustomersPage);
  fixture.detectChanges();
  const page = fixture.componentInstance;
  page.customer.set(customer);
  const dialog = fixture.nativeElement.querySelector(
    'dialog[aria-labelledby="contact-edit-title"]',
  ) as HTMLDialogElement;
  Object.assign(dialog, { showModal: vi.fn(), close: vi.fn() });
  return { page, api, dialog };
}
afterEach(() => TestBed.resetTestingModule());
it('no guarda valores equivalentes según la normalización del backend', () => {
  const { page, api } = setup();
  page.editContact();
  expect(page.contactChanged()).toBe(false);
  page.contact.setValue({ email: 'CLIENTE@example.test', phone: '(999) 000-042' });
  expect(page.contactChanged()).toBe(false);
  page.saveContact();
  expect(api.updateContact).not.toHaveBeenCalled();
});
it('descarta el borrador al cancelar y recupera el contacto guardado al abrir', () => {
  const { page, api, dialog } = setup();
  page.editContact();
  page.contact.controls.phone.setValue('999000043');
  expect(page.contactChanged()).toBe(true);
  page.cancelContact();
  expect(dialog.close).toHaveBeenCalled();
  page.editContact();
  expect(page.contact.getRawValue()).toEqual({ email: customer.email, phone: customer.phone });
  expect(api.updateContact).not.toHaveBeenCalled();
});
it('conserva el borrador y el modal ante un error del servidor', () => {
  const { page, api, dialog } = setup();
  api.updateContact.mockReturnValue(throwError(() => new Error('Sin conexión')));
  page.editContact();
  page.contact.controls.phone.setValue('999000043');
  page.saveContact();
  expect(page.contact.controls.phone.value).toBe('999000043');
  expect(page.contactError()).not.toBe('');
  expect(dialog.close).not.toHaveBeenCalled();
  expect(page.saving()).toBe(false);
});
it('impide cerrar o duplicar el envío pendiente y cierra al actualizar', () => {
  const { page, api, dialog } = setup();
  const result = new Subject<Customer>();
  api.updateContact.mockReturnValue(result);
  page.editContact();
  page.contact.controls.phone.setValue('999000043');
  page.saveContact();
  page.saveContact();
  const event = new Event('cancel', { cancelable: true });
  page.cancelContact(event);
  expect(event.defaultPrevented).toBe(true);
  expect(dialog.close).not.toHaveBeenCalled();
  expect(api.updateContact).toHaveBeenCalledTimes(1);
  result.next({ ...customer, phone: '999000043' });
  expect(dialog.close).toHaveBeenCalledTimes(1);
  expect(page.customer()?.phone).toBe('999000043');
});

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

it('impide guardar un teléfono vacío después de normalizarlo', () => {
  const { page, api } = setup();
  page.editContact();
  page.contact.controls.phone.setValue(' ()- ');
  expect(page.contactValid()).toBe(false);
  page.saveContact();
  expect(api.updateContact).not.toHaveBeenCalled();
});
