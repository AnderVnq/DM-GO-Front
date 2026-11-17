import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject, throwError, type Observable } from 'rxjs';
import { CustomersApi, type Customer } from '../customers';
import { DocumentsApi } from '../../core/documents-api';
import { PackagesPage } from './packages-page';
import { PdfPreviewService } from '../../shared/pdf-preview.service';
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
  unit_value_cents: 1000,
  quantity: 1,
  observation: '',
  invoice_pending: true,
  locker_code: 'PE00043',
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

function setup(
  shipments: object,
  customers: object = {},
  params: Record<string, string> = {},
  documents: object = {},
  preview: object = {},
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: ShipmentsApi, useValue: shipments },
      { provide: CustomersApi, useValue: customers },
      { provide: DocumentsApi, useValue: documents },
      { provide: PdfPreviewService, useValue: preview },
      { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(convertToParamMap(params)),
          snapshot: { queryParamMap: convertToParamMap(params) },
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

it('buscar cliente desde pendientes vuelve a activar la carga por cliente', () => {
  const page = setup(
    { invoicePending: () => of([]), tracking: () => of({ events: [] }) },
    { findByLocker: () => of(customer) },
  );
  page.loadPending();
  page.search.patchValue({ value: 'PE00043' });
  page.find();
  expect(page.pendingOnly()).toBe(false);
});

it('retira de pendientes el paquete con factura subida y selecciona el siguiente', () => {
  const page = setup({
    invoicePending: () => of([first, second]),
    tracking: (id: string) => of({ package_id: id, events: [] }),
    attachInvoice: () => of({ ...first, has_invoice: true, invoice_pending: false }),
  });
  page.loadPending();
  const input = {
    files: [new File(['pdf'], 'factura.pdf', { type: 'application/pdf' })],
    value: 'factura.pdf',
  };
  page.attach({ target: input } as unknown as Event);
  expect(page.packages().map((item) => item.id)).toEqual(['second']);
  expect(page.selected()?.id).toBe('second');
});

it('restaura el paquete correcto al abrir un enlace de pendientes sin cliente', () => {
  const page = setup(
    {
      invoicePending: () => of([first, second]),
      tracking: (id: string) => of({ package_id: id, events: [] }),
    },
    {},
    { view: 'invoice-pending', package_id: 'second' },
  );
  expect(page.pendingOnly()).toBe(true);
  expect(page.selected()?.id).toBe('second');
});
it('la cola genera una URL sin arrastrar el cliente anterior', () => {
  const page = setup({
    invoicePending: () => of([first, second]),
    tracking: (id: string) => of({ package_id: id, events: [] }),
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
  page.loadPending();
  page.select(second);
  expect(navigate).toHaveBeenLastCalledWith([], {
    queryParams: { view: 'invoice-pending', package_id: 'second' },
    replaceUrl: true,
  });
});

it('un error al descargar conserva el paquete seleccionado y permite reintentar', () => {
  const page = setup(
    {},
    {},
    {},
    { download: () => throwError(() => new Error('Archivo no disponible')) },
    { download: (_filename: string, source: () => Observable<Blob>) => source() },
  );
  page.selected.set({ ...first, invoice_document_id: 'document-first' });
  page.download();
  expect(page.busy()).toBe(false);
  expect(page.selected()?.id).toBe('first');
  expect(page.detailError()).not.toBe('');
});

it('la descarga de una factura de otra fila no cambia la ficha seleccionada', () => {
  const pending = new Subject<void>();
  const page = setup({}, {}, {}, {}, { download: () => pending });
  page.selected.set(first);
  page.download({ ...second, invoice_document_id: 'document-second' });
  expect(page.busy()).toBe(true);
  expect(page.selected()?.id).toBe('first');
  pending.next();
  expect(page.busy()).toBe(false);
  expect(page.selected()?.id).toBe('first');
});
