import { TestBed } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { NotesPage } from './notes-page';
import { BillingApi } from './billing-api';
import { type DispatchNote } from './dispatch-note.model';
import { CustomersApi } from '../customers';
import { ShipmentsApi } from '../shipments';
import { DocumentsApi } from '../../core/documents-api';
import { AuthService } from '../../core/auth.service';

describe('NotesPage: lecturas anteriores a una escritura', () => {
  it('no sobrescribe un cargo actualizado con el detalle anterior', () => {
    const original: DispatchNote = {
      id: 'note-1',
      number: 'NS-1',
      customer_id: 'customer-1',
      status: 'draft',
      method: 'pickup',
      total_cents: 10000,
      paid_cents: 0,
      balance_cents: 10000,
      currency: 'USD',
      guides: [],
      lines: [],
      payments: [],
      created_at: '2026-11-12T00:00:00Z',
    };
    const updated: DispatchNote = { ...original, total_cents: 5000, balance_cents: 5000 };
    const pendingRead = new Subject<DispatchNote>();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BillingApi,
          useValue: {
            list: () => of([original]),
            get: () => pendingRead,
            updateCharge: () => of(updated),
          },
        },
        { provide: CustomersApi, useValue: {} },
        { provide: ShipmentsApi, useValue: {} },
        { provide: DocumentsApi, useValue: {} },
        { provide: AuthService, useValue: { manager: () => true } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    const page = TestBed.createComponent(NotesPage).componentInstance;
    page.select(original);
    page.toggleCharge('line-1', false);
    pendingRead.next(original);
    expect(page.selected()?.total_cents).toBe(5000);
    expect(page.notes()[0]?.total_cents).toBe(5000);
  });
});

describe('NotesPage: registro de pagos', () => {
  it.each([false, true])('registra un pago con evidencia=%s', (withEvidence) => {
    const note: DispatchNote = {
      id: 'note-1',
      number: 'NS-1',
      customer_id: 'customer-1',
      status: 'pending_payment',
      method: 'pickup',
      total_cents: 10000,
      paid_cents: 0,
      balance_cents: 10000,
      currency: 'USD',
      guides: [],
      lines: [],
      payments: [],
      created_at: '2026-11-12T00:00:00Z',
    };
    const recordPayment = vi.fn(() =>
      of({ ...note, status: 'paid', paid_cents: 10000, balance_cents: 0 }),
    );
    const upload = vi.fn(() => of({ id: 'document-1' }));
    TestBed.configureTestingModule({
      providers: [
        { provide: BillingApi, useValue: { list: () => of([note]), recordPayment } },
        { provide: CustomersApi, useValue: {} },
        { provide: ShipmentsApi, useValue: {} },
        { provide: DocumentsApi, useValue: { upload } },
        { provide: AuthService, useValue: { manager: () => true } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(NotesPage);
    fixture.detectChanges();
    for (const dialog of fixture.nativeElement.querySelectorAll('dialog')) dialog.close = vi.fn();
    const page = fixture.componentInstance;
    page.payment.setValue({
      amount: '100.00',
      method: 'transfer',
      origin: 'PERU',
      reference: 'TEST-1',
    });
    if (withEvidence)
      page.attachEvidence({
        target: { files: [new File(['%PDF'], 'proof.pdf', { type: 'application/pdf' })] },
      } as unknown as Event);
    page.recordPayment();
    expect(recordPayment).toHaveBeenCalledExactlyOnceWith('note-1', {
      amount_cents: 10000,
      method: 'transfer',
      origin: 'PERU',
      reference: 'TEST-1',
      evidence_document_id: withEvidence ? 'document-1' : undefined,
    });
    expect(upload).toHaveBeenCalledTimes(withEvidence ? 1 : 0);
    expect(page.selected()?.status).toBe('paid');
  });
});

it('recupera una nota modificada por otro operador y retira el éxito anterior', () => {
  const original: DispatchNote = {
    id: 'note-conflict',
    number: 'NS-CONFLICT',
    customer_id: 'customer-1',
    status: 'draft',
    method: 'pickup',
    total_cents: 10000,
    paid_cents: 0,
    balance_cents: 10000,
    currency: 'USD',
    guides: [],
    lines: [],
    payments: [],
    created_at: '2026-11-13T00:00:00Z',
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BillingApi,
        useValue: {
          list: () => of([original]),
          updateCharge: () => throwError(() => ({ status: 409 })),
          get: () => of({ ...original, status: 'paid', paid_cents: 10000, balance_cents: 0 }),
        },
      },
      { provide: CustomersApi, useValue: {} },
      { provide: ShipmentsApi, useValue: {} },
      { provide: DocumentsApi, useValue: {} },
      { provide: AuthService, useValue: { manager: () => true } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
    ],
  });
  const page = TestBed.createComponent(NotesPage).componentInstance;
  page.success.set('Operación completada.');
  page.toggleCharge('line-1', false);
  expect(page.selected()?.status).toBe('paid');
  expect(page.selected()?.balance_cents).toBe(0);
  expect(page.notes()[0]?.paid_cents).toBe(10000);
  expect(page.success()).toBe('');
  expect(page.error()).toContain('El registro cambió.');
  expect(page.busy()).toBe(false);
});

describe('NotesPage: edición explícita de tarifa y destino', () => {
  function setup(pendingCustomer?: Subject<{ addresses: { id: string; line: string }[] }>) {
    const note: DispatchNote = {
      id: 'note-edit',
      number: 'NS-EDIT',
      customer_id: 'customer-1',
      status: 'draft',
      method: 'home',
      address_id: 'address-1',
      total_cents: 250,
      paid_cents: 0,
      balance_cents: 250,
      currency: 'USD',
      guides: [],
      payments: [],
      created_at: '',
      lines: [
        {
          id: 'line-1',
          charge_code: 'HANDLING',
          charge_name: 'Manipulación',
          calc: 'per_unit',
          rate_cents: 125,
          quantity: 2,
          amount_cents: 250,
          applies: true,
          manual: true,
        },
      ],
    };
    const getCustomer = vi.fn(
      () => pendingCustomer ?? of({ addresses: [{ id: 'address-1', line: 'Dirección real 42' }] }),
    );
    const write = new Subject<DispatchNote>();
    const updateCharge = vi.fn(() => write);
    const setDestination = vi.fn(() => write);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BillingApi,
          useValue: {
            list: () => of([note]),
            get: (id: string) => of({ ...note, id }),
            agencies: () =>
              of([
                {
                  id: 'agency-1',
                  name: 'Agencia real',
                  active: true,
                  branches: [{ id: 'branch-1', name: 'Sucursal real', active: true }],
                },
              ]),
            updateCharge,
            setDestination,
          },
        },
        { provide: CustomersApi, useValue: { get: getCustomer } },
        { provide: ShipmentsApi, useValue: {} },
        { provide: DocumentsApi, useValue: {} },
        { provide: AuthService, useValue: { manager: () => true } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(NotesPage);
    fixture.detectChanges();
    for (const dialog of fixture.nativeElement.querySelectorAll('dialog')) {
      dialog.showModal = vi.fn();
      dialog.close = vi.fn();
    }
    return {
      page: fixture.componentInstance,
      fixture,
      note,
      write,
      updateCharge,
      setDestination,
      getCustomer,
    };
  }

  it('compara tarifas en centavos e impide escrituras sin cambio o inválidas', () => {
    const { page, updateCharge } = setup();
    page.prepareRate('line-1', 125);
    for (const value of ['1.25', ' 1,25 ', '01.25', '', '-1', '1.251']) {
      page.rate.setValue(value);
      expect(page.canSaveRate()).toBe(false);
      page.saveRate();
    }
    expect(updateCharge).not.toHaveBeenCalled();
    page.rate.setValue('3,50');
    expect(page.canSaveRate()).toBe(true);
    page.saveRate();
    page.saveRate();
    expect(updateCharge).toHaveBeenCalledExactlyOnceWith('note-edit', 'line-1', {
      rate_cents: 350,
    });
  });

  it('normaliza el destino, bloquea no-op y descarta campos que no aplican', () => {
    const { page, setDestination } = setup();
    page.prepareDestination();
    page.creation.patchValue({
      agency_id: 'agencia-oculta',
      branch_id: 'sucursal-oculta',
      address_id: ' address-1 ',
    });
    expect(page.canSaveDestination()).toBe(false);
    page.saveDestination();
    expect(setDestination).not.toHaveBeenCalled();
    page.creation.patchValue({ method: 'agency_pickup', agency_id: 'agency-1', branch_id: '' });
    expect(page.canSaveDestination()).toBe(false);
    page.creation.patchValue({ method: 'pickup' });
    page.saveDestination();
    page.saveDestination();
    expect(setDestination).toHaveBeenCalledExactlyOnceWith('note-edit', {
      method: 'pickup',
      address_id: '',
      agency_id: '',
      branch_id: '',
    });
  });

  it('conserva el borrador si falla y bloquea cancelar mientras guarda', () => {
    const { page, fixture, write } = setup();
    page.prepareRate('line-1', 125);
    page.rate.setValue('3.50');
    page.saveRate();
    const event = new Event('cancel', { cancelable: true });
    page.cancelRate(event);
    expect(event.defaultPrevented).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[aria-labelledby="billing-rate-title"]').close,
    ).not.toHaveBeenCalled();
    expect(page.rate.value).toBe('3.50');
    write.error({ status: 500 });
    expect(page.busy()).toBe(false);
    expect(page.rate.value).toBe('3.50');
    expect(page.formError()).not.toBe('');
    page.cancelRate();
    page.prepareRate('line-1', 125);
    expect(page.rate.value).toBe('1.25');
    expect(page.canSaveRate()).toBe(false);
  });

  it('descarta el destino al cancelar y conserva el actual al reabrir', () => {
    const { page, setDestination } = setup();
    page.prepareDestination();
    page.creation.patchValue({ method: 'pickup' });
    page.cancelDestination();
    expect(setDestination).not.toHaveBeenCalled();
    page.prepareDestination();
    expect(page.creation.controls.method.value).toBe('home');
    expect(page.creation.controls.address_id.value).toBe('address-1');
    expect(page.canSaveDestination()).toBe(false);
  });
  it('muestra dirección, agencia y sucursal en lectura sin abrir el editor', () => {
    const { page, fixture, note } = setup();
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain(
      'Dirección real 42',
    );
    expect(page.customer()).toBeNull();
    expect(page.creation.controls.method.value).toBe('pickup');
    page.selected.set({
      ...note,
      method: 'agency_pickup',
      agency_id: 'agency-1',
      branch_id: 'branch-1',
    });
    fixture.detectChanges();
    const inspector = fixture.nativeElement.querySelector('.inspector').textContent;
    expect(inspector).toContain('Agencia real');
    expect(inspector).toContain('Sucursal real');
    expect(inspector).not.toContain('Dirección real 42');
    expect(page.customer()).toBeNull();
  });

  it('ignora la consulta tardía de dirección al seleccionar otra nota', () => {
    const pendingCustomer = new Subject<{ addresses: { id: string; line: string }[] }>();
    const { page, fixture, note } = setup(pendingCustomer);
    page.select({ ...note, id: 'another-note', method: 'pickup', address_id: undefined });
    pendingCustomer.next({ addresses: [{ id: 'address-1', line: 'Dirección anterior' }] });
    pendingCustomer.complete();
    expect(page.destinationDetails()).toBeNull();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.inspector').textContent).not.toContain(
      'Dirección anterior',
    );
  });

  it('exige direcciones y sucursales del catálogo actual al guardar', () => {
    const { page, setDestination } = setup();
    page.prepareDestination();
    page.creation.patchValue({ address_id: 'address-deleted' });
    page.saveDestination();
    expect(page.canSaveDestination()).toBe(false);
    page.creation.patchValue({
      method: 'agency_pickup',
      agency_id: 'agency-1',
      branch_id: 'branch-deleted',
    });
    page.saveDestination();
    expect(page.canSaveDestination()).toBe(false);
    expect(setDestination).not.toHaveBeenCalled();
    page.creation.patchValue({ branch_id: 'branch-1' });
    expect(page.canSaveDestination()).toBe(true);
  });
});
