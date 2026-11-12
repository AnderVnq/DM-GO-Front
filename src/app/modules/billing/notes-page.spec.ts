import { TestBed } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute } from '@angular/router';
import { of, Subject } from 'rxjs';
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
