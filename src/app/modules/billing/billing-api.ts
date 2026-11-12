import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import { type DownloadLink } from '../../core/documents-api';
import {
  type Agency,
  type ChargeType,
  type CreateNoteInput,
  type Destination,
  type DispatchNote,
  type PaymentInput,
} from './dispatch-note.model';

@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/dispatch-notes`;
  }
  list(filter: { customer_id?: string; status?: string; limit?: number } = {}) {
    const params = Object.fromEntries(
      Object.entries({ limit: 50, ...filter }).filter(
        ([, value]) => value !== '' && value !== undefined,
      ),
    );
    return this.http
      .get<{ dispatch_notes: DispatchNote[] }>(this.base, { params })
      .pipe(map((data) => data.dispatch_notes));
  }
  get(id: string) {
    return this.http.get<DispatchNote>(`${this.base}/${encodeURIComponent(id)}`);
  }
  create(input: CreateNoteInput) {
    return this.http.post<DispatchNote>(this.base, input);
  }
  setDestination(id: string, input: Destination) {
    return this.http.put<DispatchNote>(`${this.base}/${encodeURIComponent(id)}/destination`, input);
  }
  addPackage(id: string, packageId: string) {
    return this.action(id, 'packages', { package_id: packageId });
  }
  removePackage(id: string, packageId: string) {
    return this.http.delete<DispatchNote>(
      `${this.base}/${encodeURIComponent(id)}/packages/${encodeURIComponent(packageId)}`,
    );
  }
  addCharge(
    id: string,
    input: { code: string; package_id: string; quantity: number; rate_cents?: number },
  ) {
    return this.action(id, 'charges', input);
  }
  updateCharge(id: string, lineId: string, input: { applies?: boolean; rate_cents?: number }) {
    return this.http.patch<DispatchNote>(
      `${this.base}/${encodeURIComponent(id)}/charges/${encodeURIComponent(lineId)}`,
      input,
    );
  }
  removeCharge(id: string, lineId: string) {
    return this.http.delete<DispatchNote>(
      `${this.base}/${encodeURIComponent(id)}/charges/${encodeURIComponent(lineId)}`,
    );
  }
  liquidate(id: string) {
    return this.action(id, 'liquidate', {});
  }
  recordPayment(id: string, input: PaymentInput) {
    return this.action(id, 'payments', input);
  }
  reviewPayment(id: string, paymentId: string, accept: boolean, reason: string) {
    return this.action(id, `payments/${encodeURIComponent(paymentId)}/review`, { accept, reason });
  }
  cancel(id: string, reason: string) {
    return this.action(id, 'cancel', { reason });
  }
  pdf(id: string) {
    return this.http.get<DownloadLink>(`${this.base}/${encodeURIComponent(id)}/pdf`);
  }
  catalog() {
    return this.http
      .get<{ charge_types: ChargeType[] }>(`${this.config.value.apiBaseUrl}/charge-types`)
      .pipe(map((data) => data.charge_types.filter((charge) => charge.active)));
  }
  agencies() {
    return this.http
      .get<{ agencies: Agency[] }>(`${this.config.value.apiBaseUrl}/agencies`)
      .pipe(map((data) => data.agencies));
  }
  private action(id: string, path: string, input: unknown) {
    return this.http.post<DispatchNote>(`${this.base}/${encodeURIComponent(id)}/${path}`, input);
  }
}
