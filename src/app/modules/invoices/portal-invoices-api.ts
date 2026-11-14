import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import type { DownloadLink } from '../../core/documents-api';
import type { Invoice, InvoiceFileKind } from './invoice.model';

@Injectable({ providedIn: 'root' })
export class PortalInvoicesApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/portal/invoices`;
  }
  list() {
    return this.http
      .get<{ invoices: Invoice[] }>(this.base)
      .pipe(map((response) => response.invoices));
  }
  file(id: string, kind: InvoiceFileKind) {
    return this.http.get<DownloadLink>(`${this.base}/${encodeURIComponent(id)}/files/${kind}`);
  }
}
