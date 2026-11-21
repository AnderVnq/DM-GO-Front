import { provideHttpClient } from '@angular/common/http';
import { RuntimeConfig } from '../../core/runtime-config';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { PortalApi } from '../portal';
import { PortalShipmentsApi, type Package } from '../shipments';
import { PortalDeliveryApi } from './portal-delivery-api';
import { PortalDeliveryPage } from './portal-delivery-page';

function setup() {
  const item: Package = {
    id: 'package-1',
    customer_id: 'customer-1',
    mode: 'assisted',
    status: 'RECEIVED',
    store: 'Tienda',
    carrier_tracking: 'TRACK-1',
    description: 'Compra',
    unit_value_cents: 1000,
    quantity: 1,
    observation: '',
    invoice_pending: false,
    locker_code: 'PE00001',
    declared_value_cents: 1000,
    has_invoice: true,
    created_at: '',
    delivery_method: 'pickup',
    delivery_address_id: 'irrelevant-old-address',
  };
  const pending = new Subject<Package>();
  const save = vi.fn(() => pending);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
      provideRouter([]),
      {
        provide: PortalApi,
        useValue: {
          addresses: () => of({ addresses: [{ id: 'address-1', line: 'Dirección principal' }] }),
        },
      },
      { provide: PortalShipmentsApi, useValue: { list: () => of([item]) } },
      { provide: PortalDeliveryApi, useValue: { agencies: () => of([]), save } },
    ],
  });
  const fixture = TestBed.createComponent(PortalDeliveryPage);
  fixture.detectChanges();
  const dialog = fixture.nativeElement.querySelector(
    'dialog[aria-labelledby=delivery-edit-title]',
  ) as HTMLDialogElement;
  dialog.showModal = vi.fn();
  dialog.close = vi.fn();
  return { fixture, page: fixture.componentInstance, dialog, save, pending, item };
}

it('muestra la preferencia guardada y solo edita en el modal; cancelar descarta el borrador', () => {
  const { page, fixture, save } = setup();
  expect(fixture.nativeElement.querySelector('section form')).toBeNull();
  page.openEdit();
  fixture.detectChanges();
  expect(
    fixture.nativeElement.querySelector(
      'dialog[aria-labelledby=delivery-edit-title] button[type=submit]',
    ).disabled,
  ).toBe(true);
  page.save();
  expect(save).not.toHaveBeenCalled();
  page.changeMethod('home');
  page.preference.address_id = 'address-1';
  expect(page.changed).toBe(true);
  page.cancelEdit();
  page.openEdit();
  expect(page.preference.method).toBe('pickup');
  expect(page.changed).toBe(false);
});

it('ignora campos que no aplican y bloquea opciones inválidas y cambios revertidos', () => {
  const { page, save } = setup();
  page.openEdit();
  page.preference.address_id = 'irrelevant-new-address';
  page.save();
  expect(page.changed).toBe(false);
  page.changeMethod('home');
  page.save();
  expect(save).not.toHaveBeenCalled();
  page.changeMethod('pickup');
  expect(page.changed).toBe(false);
  page.save();
  expect(save).not.toHaveBeenCalled();
});

it('impide cancelar y guardar dos veces durante la petición y actualiza el resumen al terminar', () => {
  const { page, dialog, save, pending, item } = setup();
  page.openEdit();
  page.changeMethod('home');
  page.preference.address_id = 'address-1';
  page.preference.agency_id = 'irrelevant-agency';
  page.save();
  const escape = new Event('cancel', { cancelable: true });
  page.cancelEdit(escape);
  page.save();
  expect(escape.defaultPrevented).toBe(true);
  expect(dialog.close).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledExactlyOnceWith('package-1', {
    method: 'home',
    address_id: 'address-1',
    agency_id: '',
    branch_id: '',
  });
  pending.next({ ...item, delivery_method: 'home', delivery_address_id: 'address-1' });
  expect(dialog.close).toHaveBeenCalledOnce();
  expect(page.editing()).toBe(false);
  expect(page.savedAddress).toBe('Dirección principal');
  expect(page.savedMethodLabel).toBe('Entrega a domicilio');
});

it('conserva el borrador tras un error y mantiene el resumen sin cambios', () => {
  const { page, pending, dialog } = setup();
  page.openEdit();
  page.changeMethod('home');
  page.preference.address_id = 'address-1';
  page.save();
  pending.error(new Error('Sin conexión'));
  expect(page.busy()).toBe(false);
  expect(page.editing()).toBe(true);
  expect(page.preference.address_id).toBe('address-1');
  expect(page.editError()).toBeTruthy();
  expect(page.savedMethodLabel).toBe('Recojo en oficina');
  expect(dialog.close).not.toHaveBeenCalled();
});

it('rechaza cambios en paquetes bloqueados aunque se invoque la acción directamente', () => {
  const { page, save, item } = setup();
  page.selected.set({ ...item, status: 'DELIVERED' });
  page.openEdit();
  page.preference.method = 'home';
  page.preference.address_id = 'address-1';
  page.save();
  expect(page.editing()).toBe(false);
  expect(save).not.toHaveBeenCalled();
});
