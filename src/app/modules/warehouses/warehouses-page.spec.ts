import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import type { NgForm } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { WarehousesApi } from './warehouses-api';
import { WarehousesPage } from './warehouses-page';
import type { Warehouse } from './warehouse.model';

const warehouse: Warehouse = {
  id: 'usa',
  code: 'USA-01',
  country: 'US',
  name: 'Miami',
  address: { line1: '123 Main St', line2: '', city: 'Miami', state: 'FL', postal_code: '33101' },
  timezone: 'America/New_York',
  active: true,
  created_at: '',
  updated_at: '',
};

function setup() {
  const pending = new Subject<Warehouse>();
  const update = vi.fn(() => pending);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { user: signal({ roles: ['admin'] }), manager: () => true },
      },
      { provide: WarehousesApi, useValue: { list: () => of([warehouse]), update } },
    ],
  });
  const fixture = TestBed.createComponent(WarehousesPage);
  fixture.detectChanges();
  const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
  dialog.showModal = vi.fn();
  dialog.close = vi.fn();
  return { fixture, page: fixture.componentInstance, dialog, update, pending };
}
const validForm = { invalid: false } as NgForm;

it('muestra la ficha sin campos editables y bloquea cambios normalizados equivalentes', () => {
  const { fixture, page, update } = setup();
  expect(fixture.nativeElement.querySelector('aside input')).toBeNull();
  page.startEdit();
  expect(page.hasChanges).toBe(false);
  page.input.name = '  Miami  ';
  page.input.address.line2 = '  ';
  page.save(validForm);
  expect(update).not.toHaveBeenCalled();
  page.input.name = '   ';
  page.save(validForm);
  expect(update).not.toHaveBeenCalled();
  page.cancelEdit();
  expect(page.input.name).toBe('Miami');
  expect(page.selected()?.address.line2).toBe('');
});

it('conserva el borrador al fallar y bloquea cerrar o duplicar el guardado pendiente', () => {
  const { page, dialog, update, pending } = setup();
  page.startEdit();
  page.input.name = '  Sede Miami  ';
  page.input.address.city = ' Miami Beach ';
  page.save(validForm);
  expect(update).toHaveBeenCalledWith('usa', {
    name: 'Sede Miami',
    timezone: warehouse.timezone,
    active: true,
    address: { ...warehouse.address, city: 'Miami Beach' },
  });
  const escape = new Event('cancel', { cancelable: true });
  page.cancelEdit(escape);
  page.save(validForm);
  expect(escape.defaultPrevented).toBe(true);
  expect(dialog.close).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledTimes(1);
  pending.error(new Error('Sin conexión'));
  expect(page.editing()).toBe(true);
  expect(page.busy()).toBe(false);
  expect(page.input.name).toBe('  Sede Miami  ');
  expect(page.selected()?.name).toBe('Miami');
  page.cancelEdit();
  expect(page.input.name).toBe('Miami');
  expect(page.editing()).toBe(false);
});

it('actualiza la ficha y cierra el diálogo tras confirmar el servidor', () => {
  const { page, dialog, pending } = setup();
  page.startEdit();
  page.active = false;
  page.save(validForm);
  pending.next({ ...warehouse, active: false });
  expect(page.selected()?.active).toBe(false);
  expect(page.warehouses()[0].active).toBe(false);
  expect(page.editing()).toBe(false);
  expect(dialog.close).toHaveBeenCalledOnce();
});
