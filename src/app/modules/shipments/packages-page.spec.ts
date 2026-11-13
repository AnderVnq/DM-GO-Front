import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { CustomersApi, type Customer } from '../customers';
import { DocumentsApi } from '../../core/documents-api';
import { PackagesPage } from './packages-page';
import { ShipmentsApi } from './shipments-api';
import type { Package, TrackingResponse } from './package.model';

const first: Package = {
  id: 'first',
  customer_id: 'customer-first',
  mode: 'courier',
  status: 'PREALERTED',
  store: 'Primera',
  carrier_tracking: 'FIRST',
  description: 'Primero',
  declared_value_cents: 1000,
  has_invoice: false,
  created_at: '2026-11-13T00:00:00Z',
};
const second: Package = {
  ...first,
  id: 'second',
  customer_id: 'customer-second',
  carrier_tracking: 'SECOND',
};
const customer: Customer = {
  id: 'customer-second',
  locker_code: 'PE00043',
  name: 'Segundo cliente',
  email: 'second@example.test',
  phone: '999000043',
  document: { type: 'dni', number: '70000043', verified: true },
  addresses: [],
  created_at: first.created_at,
};

function setup(shipments: object, customers: object = {}) {
  TestBed.configureTestingModule({
    providers: [
      { provide: ShipmentsApi, useValue: shipments },
      { provide: CustomersApi, useValue: customers },
      { provide: DocumentsApi, useValue: {} },
      { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(convertToParamMap({})),
          snapshot: { queryParamMap: convertToParamMap({}) },
        },
      },
    ],
  });
  return TestBed.createComponent(PackagesPage).componentInstance;
}

it('el seguimiento anterior no reemplaza el del paquete seleccionado después', () => {
  const pending = new Subject<TrackingResponse>();
  const page = setup({
    tracking: (id: string) =>
      id === 'first' ? pending : of({ package_id: 'second', status: 'PREALERTED', events: [] }),
  });
  page.select(first);
  page.select(second);
  pending.next({ package_id: 'first', status: 'DELIVERED', events: [] });
  expect(page.selected()?.id).toBe('second');
  expect(page.timeline()?.package_id).toBe('second');
  expect(page.trackingLoading()).toBe(false);
});

it('cambiar de cliente descarta la respuesta anterior de paquetes y ficha', () => {
  const pendingCustomer = new Subject<Customer>();
  const pendingPackages = new Subject<Package[]>();
  const page = setup(
    {
      list: (id: string) => (id === 'customer-first' ? pendingPackages : of([second])),
      tracking: () => of({ package_id: 'second', status: 'PREALERTED', events: [] }),
    },
    { get: (id: string) => (id === 'customer-first' ? pendingCustomer : of(customer)) },
  );
  page.load('customer-first');
  page.load('customer-second');
  pendingCustomer.next({ ...customer, id: 'customer-first' });
  pendingCustomer.complete();
  pendingPackages.next([first]);
  pendingPackages.complete();
  expect(page.customer()?.id).toBe('customer-second');
  expect(page.packages().map((item) => item.id)).toEqual(['second']);
  expect(page.selected()?.id).toBe('second');
  expect(page.timeline()?.package_id).toBe('second');
  expect(page.loading()).toBe(false);
});
