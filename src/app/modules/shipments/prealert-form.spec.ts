import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { PrealertForm, type PrealertResult } from './prealert-form';
import { ShipmentsApi } from './shipments-api';
import { PortalShipmentsApi } from './portal-shipments-api';
import type { Package, PrealertBatchInput } from './package.model';

const first: Package = {
  id: 'p1',
  customer_id: 'c1',
  mode: 'courier',
  status: 'PREALERTED',
  carrier_tracking: 'ABC123',
  store: 'UPS',
  description: 'Libro',
  unit_value_cents: 29,
  quantity: 3,
  declared_value_cents: 87,
  observation: '',
  invoice_pending: true,
  locker_code: 'PE00001',
  has_invoice: false,
  created_at: '',
};
function setup(portal = false) {
  const staff = {
    prealertBatch: vi.fn((_input: PrealertBatchInput) => of([first])),
    attachInvoice: vi.fn(() => of({ ...first, has_invoice: true, invoice_pending: false })),
  };
  const client = { ...staff, prealertBatch: vi.fn((_input: PrealertBatchInput) => of([first])) };
  TestBed.configureTestingModule({
    providers: [
      { provide: ShipmentsApi, useValue: staff },
      { provide: PortalShipmentsApi, useValue: client },
    ],
  });
  const fixture = TestBed.createComponent(PrealertForm);
  fixture.componentRef.setInput('customerId', 'c1');
  fixture.componentRef.setInput('portal', portal);
  const form = fixture.componentInstance;
  form.rows.at(0).patchValue({
    carrier_tracking: 'abc123',
    store: 'UPS',
    description: 'Libro',
    amount: '0.29',
    quantity: 3,
  });
  return { form, staff, client, fixture };
}
it('normaliza tracking, mantiene centavos y omite el total de solo lectura', () => {
  const { form, staff } = setup();
  form.submit();
  expect(staff.prealertBatch).toHaveBeenCalledWith({
    customer_id: 'c1',
    mode: 'courier',
    packages: [
      {
        carrier_tracking: 'ABC123',
        store: 'UPS',
        description: 'Libro',
        unit_value_cents: 29,
        quantity: 3,
        observation: '',
      },
    ],
  });
});
it('marca errores indexados en el paquete correcto sin perder sus datos', () => {
  const { form, staff } = setup();
  staff.prealertBatch.mockReturnValue(
    throwError(() => ({
      status: 422,
      error: {
        errors: {
          'packages[1].carrier_tracking': 'Tracking duplicado',
          'packages[1].unit_value_cents': 'Precio inválido',
        },
      },
    })),
  );
  form.add();
  form.rows.at(1).patchValue(form.rows.at(0).getRawValue());
  form.submit();
  expect(form.issue(1, 'carrier_tracking')).toBe('Tracking duplicado');
  expect(form.issue(0, 'carrier_tracking')).toBe('');
  expect(form.issue(1, 'amount')).toBe('Precio inválido');
  expect(form.rows.at(1).controls.store.value).toBe('UPS');
});
it('conserva los paquetes si falla una factura y no repite el lote', () => {
  const { form, staff } = setup();
  staff.attachInvoice.mockReturnValue(throwError(() => ({ status: 503 })));
  form.files[0] = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
  let result: PrealertResult | undefined;
  form.created.subscribe((value) => (result = value));
  form.submit();
  expect(result?.packages).toEqual([first]);
  expect(result?.warning).toContain('ABC123');
  expect(staff.prealertBatch).toHaveBeenCalledTimes(1);
  expect(form.busy()).toBe(false);
});
it('portal omite customer_id, impide doble envío y asocia cada factura al id devuelto', () => {
  const { form, client, staff } = setup(true);
  const pending = new Subject<Package[]>();
  client.prealertBatch.mockReturnValue(pending);
  form.files[0] = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
  form.submit();
  form.submit();
  expect(client.prealertBatch).toHaveBeenCalledTimes(1);
  expect(client.prealertBatch.mock.calls[0]?.[0]).not.toHaveProperty('customer_id');
  expect(staff.prealertBatch).not.toHaveBeenCalled();
  expect(client.attachInvoice).not.toHaveBeenCalled();
  pending.next([first]);
  pending.complete();
  expect(client.attachInvoice).toHaveBeenCalledWith(first.id, form.files[0]);
});
it('al reiniciar elimina archivos, errores y filas del lote anterior', () => {
  const { form } = setup();
  form.add();
  form.files[0] = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
  form.error.set('Anterior');
  form.reset();
  expect(form.rows.length).toBe(1);
  expect(form.files).toEqual([null]);
  expect(form.error()).toBe('');
  expect(form.rows.at(0).controls.quantity.value).toBe(1);
});

it('permite corregir el total cambiando solo cantidad', () => {
  const { form, staff } = setup();
  form.rows.at(0).patchValue({ amount: '10000', quantity: 11 });
  form.submit();
  expect(staff.prealertBatch).not.toHaveBeenCalled();
  form.rows.at(0).controls.quantity.setValue(10);
  form.submit();
  expect(staff.prealertBatch).toHaveBeenCalledTimes(1);
});

it('permite descartar un archivo rechazado y registrar el paquete en espera', () => {
  const { form, staff } = setup();
  const input = {
    files: [new File(['exe'], 'invalid.exe', { type: 'application/octet-stream' })],
    value: 'invalid.exe',
  };
  form.chooseFile(0, { target: input } as unknown as Event);
  expect(form.fileIssues()[0]).toBeTruthy();
  form.clearFile(0, input as unknown as HTMLInputElement);
  form.submit();
  expect(form.files[0]).toBeNull();
  expect(form.fileIssues()[0]).toBe('');
  expect(staff.prealertBatch).toHaveBeenCalledTimes(1);
  expect(staff.attachInvoice).not.toHaveBeenCalled();
});

it('reinicia el lote sin reemplazar los controles del primer paquete', () => {
  const { form } = setup();
  const firstRow = form.rows.at(0);
  form.add();
  form.reset();
  expect(form.rows.length).toBe(1);
  expect(form.rows.at(0)).toBe(firstRow);
  expect(firstRow.getRawValue()).toEqual({
    carrier_tracking: '',
    store: '',
    description: '',
    amount: '',
    quantity: 1,
    observation: '',
  });
});
