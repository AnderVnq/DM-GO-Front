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
