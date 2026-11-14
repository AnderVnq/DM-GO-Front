import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import type { DownloadLink } from '../../core/documents-api';
import type { DispatchNote, PaymentInput } from './dispatch-note.model';

@Injectable({ providedIn: 'root' })
export class PortalBillingApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/portal/dispatch-notes`;
  }
  list() {
    return this.http
      .get<{ dispatch_notes: DispatchNote[] }>(this.base)
      .pipe(map((response) => response.dispatch_notes));
  }
  get(id: string) {
    return this.http.get<DispatchNote>(`${this.base}/${encodeURIComponent(id)}`);
  }
  pdf(id: string) {
    return this.http.get<DownloadLink>(`${this.base}/${encodeURIComponent(id)}/pdf`);
  }
  submitPayment(id: string, input: PaymentInput) {
    return this.http.post<DispatchNote>(`${this.base}/${encodeURIComponent(id)}/payments`, input);
  }
}
